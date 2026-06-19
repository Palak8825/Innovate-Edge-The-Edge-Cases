import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { db, buyersTable, invoicesTable, escalationEventsTable } from "@workspace/db";
import { calculateInterest, STATUTORY_RATE, RBI_BANK_RATE } from "../lib/interest.js";

const router: IRouter = Router();

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/**
 * GET /api/invoices/:id/odr-pack
 * Returns a downloadable PDF ODR filing pack for the invoice.
 */
router.get("/invoices/:id/odr-pack", async (req, res): Promise<void> => {
  const invoiceId = parseInt(req.params.id, 10);
  if (isNaN(invoiceId)) { res.status(400).json({ error: "Invalid invoice id" }); return; }

  const [row] = await db
    .select({ invoice: invoicesTable, buyer: buyersTable })
    .from(invoicesTable)
    .innerJoin(buyersTable, eq(invoicesTable.buyerId, buyersTable.id))
    .where(eq(invoicesTable.id, invoiceId));

  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }

  const events = await db
    .select()
    .from(escalationEventsTable)
    .where(eq(escalationEventsTable.invoiceId, invoiceId))
    .orderBy(escalationEventsTable.sentAt);

  const { invoice, buyer } = row;
  const amount = parseFloat(invoice.amount as string);
  const calc = calculateInterest(amount, invoice.invoiceDate);

  const doc = new PDFDocument({ margin: 50, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="ODR-Pack-${invoice.invoiceNumber}.pdf"`,
  );
  doc.pipe(res);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const DARK = "#0f172a";
  const ACCENT = "#7c3aed";
  const MUTED = "#64748b";
  const RED = "#dc2626";
  const pageW = doc.page.width - 100; // usable width

  function sectionTitle(text: string) {
    doc.moveDown(0.8)
      .rect(50, doc.y, pageW, 22).fill(ACCENT)
      .fillColor("#ffffff").fontSize(10).font("Helvetica-Bold")
      .text(text, 56, doc.y - 18)
      .fillColor(DARK).font("Helvetica").fontSize(10)
      .moveDown(0.6);
  }

  function row2col(label: string, value: string, labelColor = MUTED, valueColor = DARK) {
    const y = doc.y;
    doc.fillColor(labelColor).font("Helvetica").fontSize(9).text(label, 50, y, { width: 180 });
    doc.fillColor(valueColor).font("Helvetica-Bold").fontSize(9).text(value, 240, y, { width: pageW - 190 });
    doc.moveDown(0.45);
  }

  function divider() {
    doc.moveDown(0.3)
      .moveTo(50, doc.y).lineTo(50 + pageW, doc.y).strokeColor("#e2e8f0").lineWidth(1).stroke()
      .moveDown(0.4);
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 80).fill(DARK);
  doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold").text("Bakaya", 50, 22);
  doc.fillColor("#94a3b8").fontSize(10).font("Helvetica").text("MSME Accounts-Receivable Desk", 50, 50);
  doc.fillColor(ACCENT).fontSize(10).font("Helvetica-Bold")
    .text("ODR FILING PACK", doc.page.width - 180, 30, { width: 130, align: "right" });
  doc.fillColor("#94a3b8").fontSize(8).font("Helvetica")
    .text(`Generated: ${fmtDate(new Date())}`, doc.page.width - 180, 50, { width: 130, align: "right" });
  doc.moveDown(3);

  // ── Cover notice ───────────────────────────────────────────────────────────
  doc.rect(50, doc.y, pageW, 48).fill("#faf5ff");
  doc.fillColor(ACCENT).fontSize(11).font("Helvetica-Bold")
    .text("NOTICE OF DISPUTE — MSMED ACT 2006", 58, doc.y - 40);
  doc.fillColor(DARK).fontSize(9).font("Helvetica")
    .text(
      `This pack is prepared for submission to the MSME Facilitation Council via the ODR Portal ` +
      `(odr.msme.gov.in) in respect of invoice ${invoice.invoiceNumber}. ` +
      `All interest figures are computed under Section 16 of the MSMED Act 2006.`,
      58, doc.y - 20, { width: pageW - 16 },
    );
  doc.moveDown(1.2);

  // ── 1. Parties ─────────────────────────────────────────────────────────────
  sectionTitle("1. PARTIES");
  row2col("Supplier (Claimant)", "Bakaya Demo Supplier");
  row2col("Udyam Registration Date", "01 Jun 2020 (pre-dates all invoices — eligible)");
  row2col("Buyer (Respondent)", buyer.name);
  if (buyer.email) row2col("Buyer Email", buyer.email);
  if (buyer.phone) row2col("Buyer Phone", buyer.phone);
  if (buyer.gstNumber) row2col("Buyer GST", buyer.gstNumber);
  if (buyer.city) row2col("Buyer City", buyer.city);

  // ── 2. Invoice details ─────────────────────────────────────────────────────
  sectionTitle("2. INVOICE DETAILS");
  row2col("Invoice Number", invoice.invoiceNumber);
  row2col("Invoice Date", fmtDate(invoice.invoiceDate));
  row2col("Due Date (agreed)", fmtDate(invoice.dueDate));
  row2col("Principal Amount", fmtINR(amount));
  row2col("MSMED 45-Day Limit Expired On",
    fmtDate(new Date(new Date(invoice.invoiceDate).getTime() + 45 * 86400000)));
  row2col("Days Past MSMED Limit", `${calc.msmedDaysOverdue} days`, MUTED, calc.msmedDaysOverdue > 0 ? RED : DARK);
  if (invoice.poNumber) row2col("PO Number", invoice.poNumber);
  if (invoice.description) row2col("Description", invoice.description);

  // ── 3. Interest workings ───────────────────────────────────────────────────
  sectionTitle("3. STATUTORY INTEREST WORKINGS (MSMED Act s.16)");
  row2col("Legal basis", "MSMED Act 2006, Section 16 — compound interest with monthly rests at 3× RBI Bank Rate");
  row2col("Eligibility rule", "Silpi Industries v. KSRTC (Supreme Court, 2021) — Udyam registration must pre-date invoice");
  row2col("Supplier eligible?", calc.eligible ? "Yes — Udyam date pre-dates invoice date" : "No");
  divider();
  row2col("RBI Bank Rate (June 2026)", `${(RBI_BANK_RATE * 100).toFixed(2)}%`);
  row2col("Statutory Rate (3× Bank Rate)", `${(STATUTORY_RATE * 100).toFixed(2)}% per annum`);
  row2col("Compounding", "Monthly rests — formula: A = P × (1 + r/12)^n");
  divider();
  row2col("Principal", fmtINR(amount));
  row2col("Months past MSMED limit", (calc.msmedDaysOverdue / 30.44).toFixed(2));
  row2col("Interest accrued", fmtINR(calc.totalInterest), MUTED, RED);
  row2col("Daily accrual rate (approx.)", `${fmtINR(calc.dailyInterest)} / day`, MUTED, RED);
  divider();
  doc.fillColor(DARK).font("Helvetica-Bold").fontSize(11)
    .text(`TOTAL NOW PAYABLE: ${fmtINR(calc.totalDue)}`, 50, doc.y, { align: "right" });
  doc.moveDown(0.5);

  // ── 4. Section 43B(h) ──────────────────────────────────────────────────────
  if (calc.section43bhApplies) {
    sectionTitle("4. SECTION 43B(h) — INCOME TAX ACT");
    doc.fillColor(DARK).font("Helvetica").fontSize(9)
      .text(
        "Under Section 43B(h) of the Income Tax Act 1961 (effective FY 2023-24), a buyer can claim " +
        "this MSME payment as a business expense deduction ONLY in the year it is actually paid. " +
        "As of this filing date the amount remains outstanding; the buyer's deduction is therefore " +
        "disallowed for the current assessment year until payment is made. " +
        "This creates a direct tax cost for the buyer in addition to the statutory interest above.",
        50, doc.y, { width: pageW },
      );
    doc.moveDown(0.8);
  }

  // ── 5. Escalation timeline ─────────────────────────────────────────────────
  const section5 = calc.section43bhApplies ? "5" : "4";
  sectionTitle(`${section5}. ESCALATION TIMELINE`);

  if (events.length === 0) {
    doc.fillColor(MUTED).fontSize(9).text("No escalation events recorded.", 50, doc.y);
    doc.moveDown(0.5);
  } else {
    events.forEach((ev, i) => {
      doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(9)
        .text(`${i + 1}. ${ev.stage.replace(/_/g, " ").toUpperCase()} — ${fmtDate(ev.sentAt)}`, 50, doc.y);
      doc.fillColor(MUTED).font("Helvetica").fontSize(8)
        .text(`Channel: ${ev.channel}  |  Owner approved: ${ev.approvedByOwner ? "Yes" : "Auto"}  |  Language: ${ev.language ?? "English"}`, 50, doc.y);
      doc.fillColor(DARK).font("Helvetica").fontSize(8.5)
        .text(ev.message, 50, doc.y, { width: pageW });
      doc.moveDown(0.7);
      if (i < events.length - 1) divider();
    });
  }

  // ── 6. Legal references ────────────────────────────────────────────────────
  const section6 = parseInt(section5) + 1;
  sectionTitle(`${section6}. LEGAL REFERENCES`);
  const refs = [
    ["MSMED Act 2006, s.15", "Payment due within 45 days of acceptance of goods/services"],
    ["MSMED Act 2006, s.16", "Compound interest at 3× RBI Bank Rate with monthly rests on delayed payment"],
    ["Income Tax Act, s.43B(h)", "Buyer can deduct MSME payment only in the year it is actually paid"],
    ["Silpi Industries v. KSRTC", "Supreme Court 2021 — s.16 protection requires Udyam registration before invoice date"],
    ["MSME ODR Portal", "odr.msme.gov.in — free, online dispute resolution; council must rule within 90 days"],
    ["Appeal deposit rule", "Buyer must deposit 75% of any council award to file an appeal"],
  ];
  refs.forEach(([law, desc]) => row2col(law, desc));

  // ── Footer ─────────────────────────────────────────────────────────────────
  doc.moveDown(1.5);
  doc.rect(50, doc.y, pageW, 1).fill("#e2e8f0");
  doc.moveDown(0.5);
  doc.fillColor(MUTED).fontSize(8).font("Helvetica")
    .text(
      `This document was generated by Bakaya on ${fmtDate(new Date())}. ` +
      `It is intended for submission to the MSME Facilitation Council via odr.msme.gov.in. ` +
      `Interest figures are computed deterministically from the invoice date and the RBI Bank Rate — no manual calculation has been applied.`,
      50, doc.y, { width: pageW },
    );

  doc.end();
});

export default router;
