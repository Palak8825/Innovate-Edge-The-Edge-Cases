import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, buyersTable, invoicesTable, escalationEventsTable } from "@workspace/db";
import { getDaysOverdue, getMSMEDaysOverdue } from "../lib/interest";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const invoices = await db
    .select()
    .from(invoicesTable);

  let totalInvoices = invoices.length;
  let totalOutstanding = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let escalatingCount = 0;
  let paidCount = 0;
  let recoveredAmount = 0;
  let odrReadyCount = 0;
  let totalDaysOverdue = 0;
  let overdueForAvg = 0;

  for (const inv of invoices) {
    const amount = parseFloat(inv.amount as string);
    const daysOverdue = getDaysOverdue(inv.dueDate);
    if (inv.status === "paid") {
      paidCount++;
      recoveredAmount += amount;
    } else {
      totalOutstanding += amount;
      if (daysOverdue > 0) {
        overdueCount++;
        overdueAmount += amount;
        totalDaysOverdue += daysOverdue;
        overdueForAvg++;
      }
    }
    if (inv.status === "escalating") escalatingCount++;
    if (inv.escalationStage === "odr_ready") odrReadyCount++;
  }

  res.json({
    totalInvoices,
    totalOutstanding,
    overdueCount,
    overdueAmount,
    escalatingCount,
    paidCount,
    recoveredAmount,
    avgDaysOverdue: overdueForAvg > 0 ? totalDaysOverdue / overdueForAvg : 0,
    odrReadyCount,
  });
});

router.get("/dashboard/overdue-breakdown", async (_req, res): Promise<void> => {
  const invoices = await db
    .select()
    .from(invoicesTable)
    .where(sql`${invoicesTable.status} != 'paid'`);

  const stageMap: Record<string, { count: number; amount: number }> = {
    none: { count: 0, amount: 0 },
    nudge: { count: 0, amount: 0 },
    tax_nudge: { count: 0, amount: 0 },
    formal_demand: { count: 0, amount: 0 },
    odr_ready: { count: 0, amount: 0 },
  };

  const stageLabels: Record<string, string> = {
    none: "Not Yet Escalated",
    nudge: "Nudge Sent",
    tax_nudge: "Tax Nudge Sent",
    formal_demand: "Formal Demand Issued",
    odr_ready: "ODR Pack Ready",
  };

  for (const inv of invoices) {
    const stage = inv.escalationStage ?? "none";
    if (stageMap[stage]) {
      stageMap[stage].count++;
      stageMap[stage].amount += parseFloat(inv.amount as string);
    }
  }

  const result = Object.entries(stageMap).map(([stage, data]) => ({
    stage,
    count: data.count,
    amount: data.amount,
    label: stageLabels[stage] ?? stage,
  }));

  res.json(result);
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
  const events = await db
    .select({
      id: escalationEventsTable.id,
      invoiceId: escalationEventsTable.invoiceId,
      invoiceNumber: invoicesTable.invoiceNumber,
      buyerName: buyersTable.name,
      stage: escalationEventsTable.stage,
      message: escalationEventsTable.message,
      sentAt: escalationEventsTable.sentAt,
      channel: escalationEventsTable.channel,
    })
    .from(escalationEventsTable)
    .innerJoin(invoicesTable, eq(escalationEventsTable.invoiceId, invoicesTable.id))
    .innerJoin(buyersTable, eq(invoicesTable.buyerId, buyersTable.id))
    .orderBy(desc(escalationEventsTable.sentAt))
    .limit(20);

  res.json(events);
});

export default router;
