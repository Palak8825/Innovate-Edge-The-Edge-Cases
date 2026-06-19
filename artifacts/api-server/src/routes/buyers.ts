import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, buyersTable, invoicesTable } from "@workspace/db";
import {
  CreateBuyerBody,
  UpdateBuyerBody,
  GetBuyerParams,
  UpdateBuyerParams,
  DeleteBuyerParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/buyers", async (_req, res): Promise<void> => {
  const buyers = await db.select().from(buyersTable).orderBy(buyersTable.name);

  const buyerIds = buyers.map((b) => b.id);
  let totals: { buyerId: number; total: string; count: string }[] = [];

  if (buyerIds.length > 0) {
    totals = await db
      .select({
        buyerId: invoicesTable.buyerId,
        total: sql<string>`COALESCE(SUM(CASE WHEN ${invoicesTable.status} != 'paid' THEN ${invoicesTable.amount}::numeric ELSE 0 END), 0)`,
        count: sql<string>`COUNT(*)`,
      })
      .from(invoicesTable)
      .groupBy(invoicesTable.buyerId);
  }

  const totalsMap = new Map(totals.map((t) => [t.buyerId, t]));

  const result = buyers.map((b) => {
    const t = totalsMap.get(b.id);
    return {
      ...b,
      totalOutstanding: parseFloat(t?.total ?? "0"),
      invoiceCount: parseInt(t?.count ?? "0", 10),
    };
  });

  res.json(result);
});

router.post("/buyers", async (req, res): Promise<void> => {
  const parsed = CreateBuyerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [buyer] = await db.insert(buyersTable).values(parsed.data).returning();
  res.status(201).json({ ...buyer, totalOutstanding: 0, invoiceCount: 0 });
});

router.get("/buyers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetBuyerParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [buyer] = await db
    .select()
    .from(buyersTable)
    .where(eq(buyersTable.id, params.data.id));

  if (!buyer) {
    res.status(404).json({ error: "Buyer not found" });
    return;
  }

  const [totals] = await db
    .select({
      total: sql<string>`COALESCE(SUM(CASE WHEN ${invoicesTable.status} != 'paid' THEN ${invoicesTable.amount}::numeric ELSE 0 END), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(invoicesTable)
    .where(eq(invoicesTable.buyerId, params.data.id));

  res.json({
    ...buyer,
    totalOutstanding: parseFloat(totals?.total ?? "0"),
    invoiceCount: parseInt(totals?.count ?? "0", 10),
  });
});

router.patch("/buyers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateBuyerParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateBuyerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [buyer] = await db
    .update(buyersTable)
    .set(parsed.data)
    .where(eq(buyersTable.id, params.data.id))
    .returning();

  if (!buyer) {
    res.status(404).json({ error: "Buyer not found" });
    return;
  }

  const [totals] = await db
    .select({
      total: sql<string>`COALESCE(SUM(CASE WHEN ${invoicesTable.status} != 'paid' THEN ${invoicesTable.amount}::numeric ELSE 0 END), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(invoicesTable)
    .where(eq(invoicesTable.buyerId, params.data.id));

  res.json({
    ...buyer,
    totalOutstanding: parseFloat(totals?.total ?? "0"),
    invoiceCount: parseInt(totals?.count ?? "0", 10),
  });
});

router.delete("/buyers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteBuyerParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [buyer] = await db
    .delete(buyersTable)
    .where(eq(buyersTable.id, params.data.id))
    .returning();

  if (!buyer) {
    res.status(404).json({ error: "Buyer not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
