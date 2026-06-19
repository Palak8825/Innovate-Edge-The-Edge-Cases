/**
 * Bakaya Rules Engine (TypeScript port of rules_engine.py)
 *
 * Legal basis:
 * - MSMED Act 2006 s.15: payment due within 45 days of acceptance
 * - MSMED Act 2006 s.16: COMPOUND interest with MONTHLY rests at 3× RBI bank rate
 * - Silpi Industries v. KSRTC (SC 2021): s.16 protection only if supplier was
 *   registered on Udyam on/before the invoice date
 * - Income Tax Act s.43B(h): buyer cannot deduct unpaid MSME invoices
 *
 * RBI bank rate as of June 2026: 5.50%
 * Statutory rate: 3 × 5.50% = 16.50% p.a.
 * Update ONLY RBI_BANK_RATE when RBI changes the rate.
 */

// ── CONFIG ────────────────────────────────────────────────────────────────────
export const RBI_BANK_RATE = 0.055;          // 5.50% — RBI bank rate, June 2026
export const STATUTORY_MULTIPLIER = 3;        // MSMED Act s.16
export const STATUTORY_RATE = RBI_BANK_RATE * STATUTORY_MULTIPLIER; // 0.165 = 16.5% p.a.
export const PAYMENT_LIMIT_DAYS = 45;         // MSMED Act s.15
const AVG_DAYS_PER_MONTH = 30.44;

// Demo supplier Udyam registration date (pre-dates all invoices → always eligible).
// In a multi-tenant build this would come from the supplier's profile table.
export const SUPPLIER_UDYAM_DATE = "2020-06-01";

// ── 1. DATE HELPERS ───────────────────────────────────────────────────────────

/** Days elapsed from a date string to today (0 if in the future). */
export function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - d.getTime()) / 86_400_000));
}

/**
 * Days past the 45-day statutory payment window, measured from invoiceDate.
 * This is the correct legal definition — MSMD Act measures from invoice
 * acceptance, not from whatever due date was agreed in the contract.
 */
export function getMSMEDaysOverdue(invoiceDateStr: string): number {
  return Math.max(0, daysSince(invoiceDateStr) - PAYMENT_LIMIT_DAYS);
}

/**
 * Days past the agreed due date — used for the UI display column only.
 * NOT used for interest calculation.
 */
export function getDaysOverdue(dueDateStr: string): number {
  return daysSince(dueDateStr);
}

// ── 2. ELIGIBILITY (Silpi Industries, SC 2021) ────────────────────────────────

/**
 * s.16 protection applies ONLY if the supplier was registered on Udyam
 * on or before the invoice date. Retrospective registration = no protection.
 */
export function isEligible(invoiceDateStr: string, udyamDateStr: string = SUPPLIER_UDYAM_DATE): boolean {
  return udyamDateStr <= invoiceDateStr; // ISO string comparison is safe
}

// ── 3. INTEREST (compound, monthly rests — MSMED Act s.16) ───────────────────

/**
 * Full interest calculation matching the Python rules_engine exactly.
 *
 * Formula: A = P × (1 + r/12)^n
 * where r = STATUTORY_RATE, n = msmedDaysOverdue / 30.44 (months)
 */
export function calculateInterest(
  principalAmount: number,
  invoiceDateStr: string,
  udyamDateStr: string = SUPPLIER_UDYAM_DATE,
) {
  const eligible = isEligible(invoiceDateStr, udyamDateStr);
  const msmedDaysOverdue = getMSMEDaysOverdue(invoiceDateStr);
  const isLegallyOverdue = msmedDaysOverdue > 0;

  let totalInterest = 0;
  let dailyInterest = 0;

  if (eligible && isLegallyOverdue) {
    const monthsOverdue = msmedDaysOverdue / AVG_DAYS_PER_MONTH;
    // Compound with monthly rests (matches Python exactly)
    totalInterest = principalAmount * (Math.pow(1 + STATUTORY_RATE / 12, monthsOverdue) - 1);
    totalInterest = Math.round(totalInterest * 100) / 100;

    // Daily interest approximation for display (∂A/∂t at current point)
    const r12 = STATUTORY_RATE / 12;
    dailyInterest = principalAmount * r12 * Math.pow(1 + r12, monthsOverdue) / AVG_DAYS_PER_MONTH;
    dailyInterest = Math.round(dailyInterest * 100) / 100;
  }

  const totalDue = Math.round((principalAmount + totalInterest) * 100) / 100;

  return {
    principalAmount,
    msmedDaysOverdue,
    rbiRate: RBI_BANK_RATE,
    applicableRate: STATUTORY_RATE,
    eligible,
    udyamDate: udyamDateStr,
    isLegallyOverdue,
    totalInterest,
    dailyInterest,
    totalDue,
    section43bhApplies: eligible && isLegallyOverdue,
  };
}

// ── 4. ESCALATION STAGE ───────────────────────────────────────────────────────

/**
 * Stage ladder. Measured in days since invoice date (the MSMED clock),
 * matching the recommend.py timeline milestones.
 *
 * Day 0   — invoice issued
 * Day 30  — proactive nudge (before legal limit, relationship-safe)
 * Day 46  — tax nudge (interest has started, 43B(h) lever)
 * Day 75  — formal demand notice
 * Day 90+ — ODR pack assembled
 */
export function getEscalationStageForInvoiceDate(invoiceDateStr: string): string {
  const daysSinceInvoice = daysSince(invoiceDateStr);
  if (daysSinceInvoice >= 90) return "odr_ready";
  if (daysSinceInvoice >= 75) return "formal_demand";
  if (daysSinceInvoice >= 46) return "tax_nudge";
  if (daysSinceInvoice >= 30) return "nudge";
  return "none";
}

/** @deprecated Use getEscalationStageForInvoiceDate — kept for compat */
export function getEscalationStageForDays(daysOverdue: number): string {
  if (daysOverdue >= 90) return "odr_ready";
  if (daysOverdue >= 75) return "formal_demand";
  if (daysOverdue >= 46) return "tax_nudge";
  if (daysOverdue >= 30) return "nudge";
  return "none";
}

// ── 5. MESSAGE DRAFTING ───────────────────────────────────────────────────────

export function generateEscalationMessage(
  stage: string,
  invoiceNumber: string,
  amount: number,
  buyerName: string,
  invoiceDateStr: string,
  language: string = "en",
): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  const interest = calculateInterest(amount, invoiceDateStr);
  const daysOverdue = interest.msmedDaysOverdue;
  const total = fmt(interest.totalDue);
  const principal = fmt(amount);
  const interestAmt = fmt(interest.totalInterest);
  const ratePct = (STATUTORY_RATE * 100).toFixed(1);

  if (language === "ta") {
    switch (stage) {
      case "nudge":
        return `அன்புள்ள ${buyerName}, invoice ${invoiceNumber} தொகை ${principal} இன்னும் பெறப்படவில்லை. MSMED சட்டத்தின்படி 45 நாட்களுக்குள் செலுத்த வேண்டும். தயவுசெய்து விரைவில் செலுத்துங்கள். Accounts Desk (via Bakaya)`;
      case "tax_nudge":
        return `${buyerName}, invoice ${invoiceNumber} (${principal}) 45 நாட்களுக்கு மேல் நிலுவையில் உள்ளது. MSMED சட்டம் s.16 படி ₹${interestAmt} வட்டி தொடர்கிறது. Section 43B(h) படி, இந்த தொகை செலுத்தும் வரை உங்கள் வரி கணக்கில் கழிக்கப்பட மாட்டாது. Accounts Desk (via Bakaya)`;
      case "formal_demand":
        return `முறையான கோரிக்கை: ${buyerName}, invoice ${invoiceNumber} (${principal}) ${daysOverdue} நாட்கள் நிலுவையில் உள்ளது. RBI வட்டி விகிதம் × 3 = ${ratePct}% சேர்த்து மொத்த தொகை ${total}. 7 நாட்களுக்குள் செலுத்தவும், இல்லையெனில் ODR Portal-ல் புகார் செய்யப்படும். Accounts Desk (via Bakaya)`;
      default:
        return `ODR filing pack for invoice ${invoiceNumber} (${principal}, total due ${total}) is ready for submission to odr.msme.gov.in. Accounts Desk (via Bakaya)`;
    }
  }

  if (language === "hi") {
    switch (stage) {
      case "nudge":
        return `प्रिय ${buyerName}, invoice ${invoiceNumber} की राशि ${principal} अभी तक प्राप्त नहीं हुई है। MSMED Act के अनुसार 45 दिनों के भीतर भुगतान आवश्यक है। कृपया शीघ्र भुगतान करें। Accounts Desk (via Bakaya)`;
      case "tax_nudge":
        return `${buyerName}, invoice ${invoiceNumber} (${principal}) 45 दिनों से अधिक बकाया है। MSMED Act s.16 के तहत ${interestAmt} ब्याज जमा हो रहा है। Section 43B(h) के अनुसार यह राशि भुगतान तक tax में कटौती योग्य नहीं होगी। Accounts Desk (via Bakaya)`;
      case "formal_demand":
        return `औपचारिक मांग नोटिस: ${buyerName}, invoice ${invoiceNumber} (${principal}) ${daysOverdue} दिनों से बकाया है। RBI दर × 3 = ${ratePct}% प्रति वर्ष चक्रवृद्धि ब्याज सहित कुल देय ${total}। 7 दिनों में भुगतान न करने पर ODR Portal पर मामला दर्ज किया जाएगा। Accounts Desk (via Bakaya)`;
      default:
        return `ODR filing pack for invoice ${invoiceNumber} (${principal}, total due ${total}) is ready for submission to odr.msme.gov.in. Accounts Desk (via Bakaya)`;
    }
  }

  // English
  switch (stage) {
    case "nudge":
      return `Dear ${buyerName}, a gentle reminder that invoice ${invoiceNumber} for ${principal} remains unpaid. The MSMED Act requires settlement within 45 days of acceptance. We would appreciate prompt payment to maintain our good working relationship. Accounts Desk (via Bakaya)`;
    case "tax_nudge":
      return `Dear ${buyerName}, invoice ${invoiceNumber} (${principal}) is now ${daysOverdue} days past the MSMED 45-day limit. Statutory interest of ${interestAmt} is accruing at ${ratePct}% p.a. (3× RBI bank rate, MSMED Act s.16). Under Section 43B(h) of the Income Tax Act, this outstanding amount cannot be claimed as a tax deduction until paid — settling promptly protects your own deduction. Accounts Desk (via Bakaya)`;
    case "formal_demand":
      return `FORMAL DEMAND NOTICE — MSMED Act 2006: Invoice ${invoiceNumber} for ${principal} has been outstanding for ${daysOverdue} days past the statutory limit. Compound interest at ${ratePct}% p.a. (3× RBI bank rate) with monthly rests is accruing per s.16. Total now payable: ${total}. Please remit within 7 days to avoid filing with the MSME Online Dispute Resolution Portal (odr.msme.gov.in). Accounts Desk (via Bakaya)`;
    case "odr_ready":
      return `FINAL NOTICE — ODR filing pack for invoice ${invoiceNumber} (${principal}) is fully assembled. The matter has been outstanding ${daysOverdue} days past the MSMED limit; total payable is ${total} including compound interest at ${ratePct}% p.a. (s.16). All documents — purchase orders, delivery logs, interest workings — are ready for submission to odr.msme.gov.in. Accounts Desk (via Bakaya)`;
    default:
      return `Invoice ${invoiceNumber} — ${buyerName}.`;
  }
}
