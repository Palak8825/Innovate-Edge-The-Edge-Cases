import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, buyersTable, invoicesTable, escalationEventsTable } from "@workspace/db";
import {
  CreateInvoiceBody,
  UpdateInvoiceBody,
  GetInvoiceParams,
  UpdateInvoiceParams,
  DeleteInvoiceParams,
  EscalateInvoiceParams,
  EscalateInvoiceBody,
  MarkInvoicePaidParams,
  GetInvoiceInterestParams,
  ListInvoicesQueryParams,
} from "@workspace/api-zod";
import { calculateInterest, getDaysOverdue, generateEscalationMessage } from "../lib/interest";

const router: IRouter = Router();

function enrichInvoice(inv: typeof invoicesTable.$inferSelect, buyerName: string) {
  const daysOverdue = getDaysOverdue(inv.dueDate);
  // Interest uses invoiceDate + MSMED 45-day rule (not dueDate), per MSMED Act s.16
  const interest = calculateInterest(parseFloat(inv.amount as string), inv.invoiceDate);
  return {
    ...inv,
    amount: parseFloat(inv.amount as string),
    buyerName,
    daysOverdue,
    interestAccrued: interest.totalInterest,
  };
}

router.get("/invoices", async (req, res): Promise<void> => {
  const query = ListInvoicesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.status) conditions.push(eq(invoicesTable.status, query.data.status));
  if (query.data.buyerId) conditions.push(eq(invoicesTable.buyerId, query.data.buyerId));

  const invoices = await db
    .select({
      invoice: invoicesTable,
      buyerName: buyersTable.name,
    })
    .from(invoicesTable)
    .innerJoin(buyersTable, eq(invoicesTable.buyerId, buyersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(invoicesTable.createdAt));

  res.json(invoices.map(({ invoice, buyerName }) => enrichInvoice(invoice, buyerName)));
});

router.post("/invoices", async (req, res): Promise<void> => {
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [buyer] = await db
    .select()
    .from(buyersTable)
    .where(eq(buyersTable.id, parsed.data.buyerId));
  if (!buyer) {
    res.status(400).json({ error: "Buyer not found" });
    return;
  }

  const daysOverdue = getDaysOverdue(parsed.data.dueDate);
  const status = daysOverdue > 0 ? "overdue" : "pending";

  const [invoice] = await db
    .insert(invoicesTable)
    .values({ ...parsed.data, amount: String(parsed.data.amount), status })
    .returning();

  res.status(201).json(enrichInvoice(invoice, buyer.name));
});

router.get("/invoices/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetInvoiceParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select({ invoice: invoicesTable, buyerName: buyersTable.name })
    .from(invoicesTable)
    .innerJoin(buyersTable, eq(invoicesTable.buyerId, buyersTable.id))
    .where(eq(invoicesTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  const events = await db
    .select()
    .from(escalationEventsTable)
    .where(eq(escalationEventsTable.invoiceId, params.data.id))
    .orderBy(escalationEventsTable.sentAt);

  res.json({ ...enrichInvoice(row.invoice, row.buyerName), escalationEvents: events });
});

router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateInvoiceParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.amount !== undefined) updateData.amount = String(parsed.data.amount);

  const [invoice] = await db
    .update(invoicesTable)
    .set(updateData)
    .where(eq(invoicesTable.id, params.data.id))
    .returning();

  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  const [buyer] = await db.select().from(buyersTable).where(eq(buyersTable.id, invoice.buyerId));
  res.json(enrichInvoice(invoice, buyer?.name ?? "Unknown"));
});

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteInvoiceParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(escalationEventsTable).where(eq(escalationEventsTable.invoiceId, params.data.id));
  const [invoice] = await db.delete(invoicesTable).where(eq(invoicesTable.id, params.data.id)).returning();

  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/invoices/:id/escalate", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = EscalateInvoiceParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = EscalateInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .select({ invoice: invoicesTable, buyer: buyersTable })
    .from(invoicesTable)
    .innerJoin(buyersTable, eq(invoicesTable.buyerId, buyersTable.id))
    .where(eq(invoicesTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  const message =
    parsed.data.customMessage ||
    generateEscalationMessage(
      parsed.data.stage,
      row.invoice.invoiceNumber,
      parseFloat(row.invoice.amount as string),
      row.buyer.name,
      row.invoice.invoiceDate,
      row.buyer.language
    );

  const [event] = await db
    .insert(escalationEventsTable)
    .values({
      invoiceId: params.data.id,
      stage: parsed.data.stage,
      message,
      channel: parsed.data.channel,
      approvedByOwner: parsed.data.approvedByOwner,
      language: row.buyer.language,
    })
    .returning();

  await db
    .update(invoicesTable)
    .set({ escalationStage: parsed.data.stage, status: "escalating" })
    .where(eq(invoicesTable.id, params.data.id));

  res.status(201).json(event);
});

router.post("/invoices/:id/mark-paid", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = MarkInvoicePaidParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select({ invoice: invoicesTable, buyerName: buyersTable.name })
    .from(invoicesTable)
    .innerJoin(buyersTable, eq(invoicesTable.buyerId, buyersTable.id))
    .where(eq(invoicesTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  const [invoice] = await db
    .update(invoicesTable)
    .set({ status: "paid", paidAt: new Date() })
    .where(eq(invoicesTable.id, params.data.id))
    .returning();

  res.json(enrichInvoice(invoice, row.buyerName));
});

router.get("/invoices/:id/interest", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetInvoiceInterestParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, params.data.id));

  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  // Calculate interest using invoiceDate + MSMED 45-day rule (MSMED Act s.16)
  const calc = calculateInterest(parseFloat(invoice.amount as string), invoice.invoiceDate);

  res.json({ invoiceId: params.data.id, ...calc });
});

export default router;
