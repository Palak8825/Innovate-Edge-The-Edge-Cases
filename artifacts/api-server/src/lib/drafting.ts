/**
 * Shared Groq LLM drafting helpers — used by both /draft and /send routes.
 *
 * DESIGN RULE: the LLM never computes a legal number. The rules engine
 * (interest.ts) provides all figures; the LLM only rewrites them as a
 * polite human-sounding message in the right tone and language.
 * On any failure the caller falls back to generateEscalationMessage().
 */

const MODEL_NAME = "llama-3.3-70b-versatile";

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

export const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

export type DraftArgs = {
  stage: string;
  buyerName: string;
  amount: number;
  daysOverdue: number;
  interest: number;
  totalDue: number;
  ratePct: number;
  flag43bh: boolean;
  language: string;
};

export function buildPrompt(args: DraftArgs): string {
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

export async function callGroq(prompt: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");

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
