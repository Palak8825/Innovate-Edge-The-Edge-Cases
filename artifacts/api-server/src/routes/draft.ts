import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, buyersTable, invoicesTable } from "@workspace/db";
import {
  calculateInterest,
  getEscalationStageForInvoiceDate,
  generateEscalationMessage,
} from "../lib/interest.js";
import { buildPrompt, callGroq, fmtINR } from "../lib/drafting.js";

const router: IRouter = Router();

/**
 * POST /api/invoices/:id/draft
 * Body (optional): { stage?: string, language?: string }
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
