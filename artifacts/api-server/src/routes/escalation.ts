import { Router, type IRouter } from "express";
import { eq, ne } from "drizzle-orm";
import { db, buyersTable, invoicesTable, escalationEventsTable } from "@workspace/db";
import {
  getEscalationStageForInvoiceDate,
  calculateInterest,
  generateEscalationMessage,
} from "../lib/interest.js";
import { buildPrompt, callGroq } from "../lib/drafting.js";
import { sendNotice } from "../lib/notify.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ── Stage ordering ────────────────────────────────────────────────────────────

const STAGE_ORDER = ["none", "nudge", "tax_nudge", "formal_demand", "odr_ready"] as const;

function stageIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);
  return idx === -1 ? 0 : idx;
}

const STAGE_SUBJECT: Record<string, string> = {
  nudge:         "Payment Reminder",
  tax_nudge:     "Overdue Notice — Tax Alert",
  formal_demand: "Formal Demand Notice",
  odr_ready:     "Final Notice — ODR Filing Ready",
};

// ── Sweep engine ──────────────────────────────────────────────────────────────

type SweepResult =
  | { invoiceId: number; invoiceNumber: string; action: "no_change"; stage: string }
  | {
      invoiceId: number;
      invoiceNumber: string;
      action: "escalated";
      from: string;
      to: string;
      source: "llm" | "fallback";
      deliveryStatus: string;
      deliveryDetail: string;
    };

export async function runEscalationSweep(): Promise<SweepResult[]> {
  const rows = await db
    .select({ invoice: invoicesTable, buyer: buyersTable })
    .from(invoicesTable)
    .innerJoin(buyersTable, eq(invoicesTable.buyerId, buyersTable.id))
    .where(ne(invoicesTable.status, "paid"));

  const results: SweepResult[] = [];

  for (const { invoice, buyer } of rows) {
    const computedStage = getEscalationStageForInvoiceDate(invoice.invoiceDate);
    const storedStage = invoice.escalationStage ?? "none";

    // Skip if no advance is due
    if (computedStage === "none" || stageIndex(computedStage) <= stageIndex(storedStage)) {
      results.push({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, action: "no_change", stage: storedStage });
      continue;
    }

    const amount = parseFloat(invoice.amount as string);
    const language = buyer.language || "English";
    const interest = calculateInterest(amount, invoice.invoiceDate);

    // Draft via Groq, fall back to template
    let message: string;
    let source: "llm" | "fallback";
    try {
      const prompt = buildPrompt({
        stage: computedStage,
        buyerName: buyer.name,
        amount,
        daysOverdue: interest.msmedDaysOverdue,
        interest: interest.totalInterest,
        totalDue: interest.totalDue,
        ratePct: parseFloat((interest.applicableRate * 100).toFixed(1)),
        flag43bh: interest.section43bhApplies,
        language,
      });
      message = await callGroq(prompt);
      source = "llm";
    } catch {
      message = generateEscalationMessage(
        computedStage, invoice.invoiceNumber, amount, buyer.name, invoice.invoiceDate, language,
      );
      source = "fallback";
    }

    // Send email — DEMO_RECIPIENT_EMAIL override is handled inside sendNotice
    const recipientEmail = process.env.DEMO_RECIPIENT_EMAIL || buyer.email;
    let deliveryStatus = "no_email";
    let deliveryDetail = "No recipient email configured — set DEMO_RECIPIENT_EMAIL or add buyer email";

    if (recipientEmail) {
      const result = await sendNotice({
        to: recipientEmail,
        subject: `${STAGE_SUBJECT[computedStage] ?? "Payment Notice"} — Invoice ${invoice.invoiceNumber}`,
        body: message,
        senderName: "Accounts Desk",
        meta: {
          invoiceNumber: invoice.invoiceNumber,
          buyerName: buyer.name,
          stage: computedStage,
          principal: amount,
          interestAccrued: interest.totalInterest,
          totalDue: interest.totalDue,
          daysOverdue: interest.msmedDaysOverdue,
        },
      });
      deliveryStatus = result.status;
      deliveryDetail = result.detail;
    }

    // Log escalation event
    await db.insert(escalationEventsTable).values({
      invoiceId: invoice.id,
      stage: computedStage,
      message,
      channel: "email",
      approvedByOwner: false,
      language,
    });

    // Advance invoice stage + status
    await db
      .update(invoicesTable)
      .set({ escalationStage: computedStage, status: "escalating" })
      .where(eq(invoicesTable.id, invoice.id));

    logger.info(
      { invoiceId: invoice.id, from: storedStage, to: computedStage, deliveryStatus },
      "Auto-escalated invoice",
    );

    results.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      action: "escalated",
      from: storedStage,
      to: computedStage,
      source,
      deliveryStatus,
      deliveryDetail,
    });
  }

  return results;
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/escalation/run
 *
 * Sweeps all unpaid invoices, advances any whose computed stage is ahead of
 * their stored stage, drafts + sends a notice for each, and logs the event.
 * Demo gold: click this live and watch the whole book advance.
 *
 * Response: { swept, escalated, results[] }
 */
router.post("/escalation/run", async (req, res): Promise<void> => {
  logger.info("Manual escalation sweep triggered via POST /api/escalation/run");
  try {
    const results = await runEscalationSweep();
    const escalated = results.filter((r) => r.action === "escalated");
    res.json({
      swept: results.length,
      escalated: escalated.length,
      results,
    });
  } catch (err) {
    logger.error({ err }, "Escalation sweep failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Sweep failed" });
  }
});

export default router;
