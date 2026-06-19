import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, buyersTable, invoicesTable } from "@workspace/db";
import {
  calculateInterest,
  getEscalationStageForInvoiceDate,
  generateEscalationMessage,
} from "../lib/interest";

const router: IRouter = Router();

/**
 * Groq LLM drafting layer (port of bakaya/drafting.py).
 *
 * DESIGN RULE (identical to the Python layer): the LLM does NOT compute any
 * legal number. The rules engine (interest.ts) already computed stage,
 * interest, total due and 43B(h). The LLM only rewrites those finished numbers
 * as a polite, human-sounding message in the right tone and language.
 *
 * Any failure (missing key, network, 429, bad response) falls back to the
 * deterministic template in generateEscalationMessage(), so the endpoint can
 * never hard-fail.
 */

const MODEL_NAME = "llama-3.3-70b-versatile";

// Tones keyed by the canonical 5-stage ladder (lowercase, as returned by
// getEscalationStageForInvoiceDate). Mirrors TONE_BY_STAGE in drafting.py.
const TONE_BY_STAGE: Record<string, string> = {
  nudge:
    "warm and friendly, assumes good faith; a proactive, PRE-deadline heads-up. " +
    "Do NOT mention interest or tax -- nothing is legally overdue yet; keep it purely relational",
  tax_nudge:
    "warm but matter-of-fact; the 45-day limit has now passed, so note that statutory " +
    "interest has begun and gently mention the buyer's own 43B(h) tax-deduction risk as a helpful heads-up",
  formal_demand:
    "formal and firm but professional; a clear demand with the exact amount and interest, mentions next steps",
  odr_ready:
    "formal final notice; states the matter is ready to be filed with the MSME Facilitation Council via the ODR Portal",
};

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

function buildPrompt(args: {
  stage: string;
  buyerName: string;
  amount: number;
  daysOverdue: number;
  interest: number;
  totalDue: number;
  ratePct: number;
  flag43bh: boolean;
  language: string;
}): string {
  const tone = TONE_BY_STAGE[args.stage] ?? "polite and professional";

  const interestLine =
    args.interest > 0
      ? `Statutory interest accrued so far: ${fmtINR(args.interest)} ` +
        `(compound, at ${args.ratePct}% per annum, 3x the RBI bank rate, per Section 16 of the MSMED Act).`
      : "No statutory interest yet.";

  const taxLine = args.flag43bh
    ? "Helpfully remind the buyer that under Section 43B(h) of the Income Tax Act, they can only " +
      "claim this expense as a tax deduction in the year they actually pay it -- so clearing it soon " +
      "protects their own deduction."
    : "Do NOT mention tax deductions.";

  return `You are drafting a payment-reminder message that an Indian small
business is sending to a buyer who owes them money. You write ONLY the message
text -- no preamble, no explanation, no markdown.

Write the message in this language: ${args.language}.
Tone required: ${tone}.

USE THESE EXACT FACTS. Do not invent or change any number:
- Buyer name: ${args.buyerName}
- Invoice amount (principal): ${fmtINR(args.amount)}
- Days overdue (past the 45-day legal limit): ${args.daysOverdue}
- ${interestLine}
- Total now payable (principal + interest): ${fmtINR(args.totalDue)}

Instructions:
- ${taxLine}
- The message is sent "on behalf of the supplier's accounts desk", so it should
  feel like it comes from a back-office system, not an angry owner. This keeps
  the business relationship intact.
- Keep it concise (under 130 words).
- Sign off as "Accounts Desk (via Bakaya)".
- Output ONLY the message text in ${args.language}.`;
}

async function callGroq(prompt: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");

  // Node 24 has global fetch -- no SDK dependency needed.
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.4,
      }),
    });

    if (resp.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (!resp.ok) {
      throw new Error(`Groq API error ${resp.status}: ${await resp.text()}`);
    }
    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Groq returned an empty message");
    return text;
  }
  throw new Error("Groq API exhausted retries");
}

/**
 * POST /api/invoices/:id/draft
 * Body (optional): { stage?: string, language?: string }
 *   - stage overrides the computed escalation stage (e.g. to preview a stage)
 *   - language overrides the buyer's default language
 * Response: { message, stage, source: "llm" | "fallback", reason? }
 */
router.post("/invoices/:id/draft", async (req, res): Promise<void> => {
  const { id } = req.params;

  const [row] = await db
    .select({ invoice: invoicesTable, buyer: buyersTable })
    .from(invoicesTable)
    .innerJoin(buyersTable, eq(invoicesTable.buyerId, buyersTable.id))
    .where(eq(invoicesTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  const amount = parseFloat(row.invoice.amount as string);
  const invoiceDate = row.invoice.invoiceDate;
  const language = (req.body?.language as string) || row.buyer.language || "English";
  const stage =
    (req.body?.stage as string) || getEscalationStageForInvoiceDate(invoiceDate);

  const interest = calculateInterest(amount, invoiceDate);

  // NONE stage: nothing to draft yet.
  if (stage === "none") {
    res.json({
      stage,
      source: "fallback",
      message:
        "(No notice generated: this invoice is still within the first 30 days; monitoring only.)",
    });
    return;
  }

  const prompt = buildPrompt({
    stage,
    buyerName: row.buyer.name,
    amount,
    daysOverdue: interest.msmedDaysOverdue,
    interest: interest.totalInterest,
    totalDue: interest.totalDue,
    ratePct: parseFloat((interest.applicableRate * 100).toFixed(1)),
    flag43bh: interest.section43bhApplies,
    language,
  });

  try {
    const message = await callGroq(prompt);
    res.json({ stage, source: "llm", message });
  } catch (err) {
    // Deterministic fallback -- the same template the escalate route uses.
    const message = generateEscalationMessage(
      stage,
      row.invoice.invoiceNumber,
      amount,
      row.buyer.name,
      invoiceDate,
      language,
    );
    res.json({
      stage,
      source: "fallback",
      reason: err instanceof Error ? err.message : "unknown error",
      message,
    });
  }
});

export default router;
