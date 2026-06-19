const RBI_RATE = 0.065;
const MULTIPLIER = 3;
const LEGAL_DAYS_LIMIT = 45;

export function calculateInterest(principalAmount: number, daysOverdue: number) {
  const applicableRate = RBI_RATE * MULTIPLIER;
  const isLegallyOverdue = daysOverdue > LEGAL_DAYS_LIMIT;
  const effectiveDays = Math.max(0, daysOverdue - LEGAL_DAYS_LIMIT);

  const dailyRate = applicableRate / 365;
  const totalInterest = isLegallyOverdue
    ? principalAmount * (Math.pow(1 + dailyRate, effectiveDays) - 1)
    : 0;

  const dailyInterest = isLegallyOverdue ? principalAmount * dailyRate : 0;

  return {
    principalAmount,
    daysOverdue,
    rbiRate: RBI_RATE,
    applicableRate,
    dailyInterest,
    totalInterest,
    totalDue: principalAmount + totalInterest,
    isLegallyOverdue,
    section43bhApplies: isLegallyOverdue,
  };
}

export function getDaysOverdue(dueDateStr: string): number {
  const dueDate = new Date(dueDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  const diff = today.getTime() - dueDate.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function getEscalationStageForDays(daysOverdue: number): string {
  if (daysOverdue >= 90) return "odr_ready";
  if (daysOverdue >= 75) return "formal_demand";
  if (daysOverdue >= 46) return "tax_nudge";
  if (daysOverdue >= 30) return "nudge";
  return "none";
}

export function generateEscalationMessage(
  stage: string,
  invoiceNumber: string,
  amount: number,
  buyerName: string,
  daysOverdue: number,
  language: string = "en"
): string {
  const amountFormatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

  const interest = calculateInterest(amount, daysOverdue);
  const totalDueFormatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(interest.totalDue);

  if (language === "ta") {
    switch (stage) {
      case "nudge":
        return `அன்புள்ள ${buyerName}, invoice ${invoiceNumber} தொகை ${amountFormatted} இன்னும் பெறப்படவில்லை. தயவுசெய்து விரைவில் செலுத்துங்கள். நன்றி.`;
      case "tax_nudge":
        return `${buyerName}, invoice ${invoiceNumber} (${amountFormatted}) 45 நாட்களுக்கு மேல் நிலுவையில் உள்ளது. Section 43B(h) படி, இந்த தொகை உங்கள் வரி கணக்கில் கழிக்கப்பட மாட்டாது. தயவுசெய்து உடனடியாக செலுத்துங்கள்.`;
      case "formal_demand":
        return `முறையான கோரிக்கை: ${buyerName}, invoice ${invoiceNumber} தொகை ${amountFormatted}, MSMED சட்டத்தின் படி ${daysOverdue} நாட்கள் நிலுவையில் உள்ளது. வட்டி உட்பட மொத்த தொகை ${totalDueFormatted}. 7 நாட்களுக்குள் செலுத்தவும், இல்லையெனில் ODR Portal-ல் புகார் செய்யப்படும்.`;
      default:
        return `ODR filing pack for invoice ${invoiceNumber} (${amountFormatted}) is ready for submission to odr.msme.gov.in.`;
    }
  }

  if (language === "hi") {
    switch (stage) {
      case "nudge":
        return `प्रिय ${buyerName}, invoice ${invoiceNumber} की राशि ${amountFormatted} अभी तक प्राप्त नहीं हुई है। कृपया शीघ्र भुगतान करें। धन्यवाद।`;
      case "tax_nudge":
        return `${buyerName}, invoice ${invoiceNumber} (${amountFormatted}) 45 दिनों से अधिक समय से बकाया है। Section 43B(h) के अनुसार, यह राशि आपके कर खाते में कटौती के लिए पात्र नहीं होगी। कृपया तुरंत भुगतान करें।`;
      case "formal_demand":
        return `औपचारिक मांग: ${buyerName}, invoice ${invoiceNumber} की राशि ${amountFormatted}, MSMED Act के तहत ${daysOverdue} दिनों से बकाया है। ब्याज सहित कुल देय राशि ${totalDueFormatted}। 7 दिनों के भीतर भुगतान न करने पर ODR Portal पर शिकायत दर्ज की जाएगी।`;
      default:
        return `ODR filing pack for invoice ${invoiceNumber} (${amountFormatted}) is ready for submission to odr.msme.gov.in.`;
    }
  }

  switch (stage) {
    case "nudge":
      return `Dear ${buyerName}, a gentle reminder that invoice ${invoiceNumber} for ${amountFormatted} remains unpaid. We would appreciate prompt settlement. Thank you for your continued partnership.`;
    case "tax_nudge":
      return `Dear ${buyerName}, invoice ${invoiceNumber} (${amountFormatted}) is now overdue by ${daysOverdue} days — beyond the 45-day MSMED statutory limit. Please note that under Section 43B(h) of the Income Tax Act, this outstanding amount will not qualify as a deductible expense in your tax returns until paid. We urge prompt payment to avoid further implications.`;
    case "formal_demand":
      return `FORMAL DEMAND NOTICE: This notice is issued under the Micro, Small and Medium Enterprises Development Act, 2006. Invoice ${invoiceNumber} for ${amountFormatted} has been outstanding for ${daysOverdue} days. Compound interest at three times the RBI bank rate is accruing on this amount. Total amount now due: ${totalDueFormatted}. Please remit payment within 7 days to avoid filing with the MSME Online Dispute Resolution Portal (odr.msme.gov.in).`;
    case "odr_ready":
      return `ODR filing pack for invoice ${invoiceNumber} (${amountFormatted}) — outstanding ${daysOverdue} days, total due ${totalDueFormatted} — is assembled and ready for submission to odr.msme.gov.in. All documents including purchase orders, delivery logs, and interest workings have been compiled.`;
    default:
      return `Invoice ${invoiceNumber} notice for ${buyerName}.`;
  }
}
