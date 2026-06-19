"""
Bakaya AI - Rules Engine
========================
This is the deterministic core of the product. NO LLM is involved here.
Every number this file produces is computed in plain Python and is auditable.

This file is the answer to the judges' question:
"Why can't the user just paste this into ChatGPT?"
Answer: because ChatGPT cannot reliably do THIS math, does not know the live
RBI rate, and has no concept of an escalation state. This file does.

Legal basis:
- MSMED Act 2006, Section 15: payment due within 45 days of acceptance.
- MSMED Act 2006, Section 16: on default, COMPOUND interest with monthly
  rests at 3x the RBI bank rate.
- Section 16 protection applies ONLY if the supplier was registered on the
  Udyam portal on/before the invoice date (Silpi Industries, SC 2021).
- Income Tax Act Section 43B(h): the BUYER can deduct the expense only in the
  year they actually pay, if the supplier is a registered micro/small unit.
"""

from datetime import date
from dataclasses import dataclass


# ---------------------------------------------------------------------------
# CONFIG: the one number that changes over time. Kept as a named constant so
# it is NEVER hardcoded deep inside the math. As of June 2026 the RBI bank
# rate is 5.50%, so the statutory rate is 3 x 5.50% = 16.50% per annum.
# (If RBI changes the bank rate, you change ONLY this line.)
# ---------------------------------------------------------------------------
RBI_BANK_RATE = 0.055          # 5.50% -- RBI bank rate, June 2026
STATUTORY_MULTIPLIER = 3       # MSMED Act Section 16: "three times the bank rate"
STATUTORY_RATE = RBI_BANK_RATE * STATUTORY_MULTIPLIER   # = 0.165 (16.5% p.a.)

PAYMENT_LIMIT_DAYS = 45        # MSMED Act Section 15


@dataclass
class Invoice:
    """A single invoice the supplier is chasing."""
    buyer_name: str
    amount: float                 # principal, in rupees
    invoice_date: date            # when goods/services were accepted
    udyam_date: date              # when the supplier registered on Udyam
    language: str = "English"     # output language for the notice
    today: date = None            # lets us 'pretend' a date for demos

    def __post_init__(self):
        if self.today is None:
            self.today = date.today()


# ---------------------------------------------------------------------------
# 1. DAYS OVERDUE
# ---------------------------------------------------------------------------
def days_overdue(inv: Invoice) -> int:
    """How many days past the 45-day statutory limit are we?
    Returns 0 if still within the limit (not yet overdue)."""
    days_since_invoice = (inv.today - inv.invoice_date).days
    overdue = days_since_invoice - PAYMENT_LIMIT_DAYS
    return max(0, overdue)


def days_since_invoice(inv: Invoice) -> int:
    return (inv.today - inv.invoice_date).days


# ---------------------------------------------------------------------------
# 2. ELIGIBILITY  (the rule almost no MSME owner knows)
# ---------------------------------------------------------------------------
def is_eligible(inv: Invoice) -> bool:
    """Section 16 protection applies ONLY if the supplier was registered on
    Udyam on or before the invoice date. Retrospective registration gives no
    retrospective rights (Silpi Industries v. KSRTC, Supreme Court 2021)."""
    return inv.udyam_date <= inv.invoice_date


def eligibility_reason(inv: Invoice) -> str:
    if is_eligible(inv):
        return ("Eligible: Udyam registration ("
                f"{inv.udyam_date}) predates the invoice date "
                f"({inv.invoice_date}), so MSMED Act statutory protection applies.")
    return ("NOT eligible for statutory interest: Udyam registration ("
            f"{inv.udyam_date}) is AFTER the invoice date ({inv.invoice_date}). "
            "Retrospective registration confers no retrospective rights.")


# ---------------------------------------------------------------------------
# 3. INTEREST  (compound, monthly rests -- Section 16)
# ---------------------------------------------------------------------------
def statutory_interest(inv: Invoice) -> float:
    """Compound interest with monthly rests at 3x the RBI bank rate.
    Formula (MSMED Act Section 16): A = P * (1 + r/12)^n
    where r = statutory annual rate, n = number of months overdue.
    Interest owed = A - P.

    Returns 0 if not eligible or not yet overdue."""
    if not is_eligible(inv):
        return 0.0
    overdue_days = days_overdue(inv)
    if overdue_days <= 0:
        return 0.0
    months_overdue = overdue_days / 30.44       # avg days per month
    amount_due = inv.amount * (1 + STATUTORY_RATE / 12) ** months_overdue
    interest = amount_due - inv.amount
    return round(interest, 2)


def total_payable(inv: Invoice) -> float:
    """Principal + statutory interest."""
    return round(inv.amount + statutory_interest(inv), 2)


# ---------------------------------------------------------------------------
# 4. ESCALATION STAGE  (the state machine ChatGPT does not have)
# ---------------------------------------------------------------------------
# Stages, in order:
#   PRE_DUE        -> not yet 45 days; nothing owed legally
#   NUDGE          -> just crossed 45 days; friendly reminder
#   TAX_WARNING    -> well overdue; mention 43B(h) + interest accruing
#   FORMAL_DEMAND  -> serious delay; formal demand notice
#   ODR_READY      -> 90+ days overdue; ready to file on MSME ODR Portal
STAGES = ["PRE_DUE", "NUDGE", "FORMAL_DEMAND", "ODR_READY"]

STAGE_LABELS = {
    "PRE_DUE":       "Pre-Due (within 45 days)",
    "NUDGE":         "Stage 1 - Friendly Nudge",
    "FORMAL_DEMAND": "Stage 2 - Formal Demand",
    "ODR_READY":     "Stage 3 - ODR Filing Ready",
}


def escalation_stage(inv: Invoice) -> str:
    """Decide which stage this invoice is in, purely from the overdue clock.

    Thresholds are in DAYS OVERDUE (days past the 45-day statutory limit),
    kept consistent with the collection-timeline milestones:
      - within 45 days of invoice        -> PRE_DUE
      - 1-14 days overdue   (day 46-59)  -> NUDGE
      - 15-44 days overdue  (day 60-89)  -> FORMAL_DEMAND
      - 45+ days overdue    (day 90+)    -> ODR_READY
    The TAX_WARNING/43B(h) concern opens the moment interest starts (day 46)
    and is surfaced via the 43B(h) flag rather than as a separate stage.
    """
    overdue = days_overdue(inv)
    since = days_since_invoice(inv)
    if since <= PAYMENT_LIMIT_DAYS:
        return "PRE_DUE"
    if overdue < 15:        # day 46-59
        return "NUDGE"
    if overdue < 45:        # day 60-89
        return "FORMAL_DEMAND"
    return "ODR_READY"      # day 90+


# ---------------------------------------------------------------------------
# 5. 43B(h) FLAG  (leverage-as-helpfulness)
# ---------------------------------------------------------------------------
def flag_43bh(inv: Invoice) -> bool:
    """True once the delay is big enough that the buyer's tax deduction is at
    risk under Section 43B(h). Triggers as soon as the invoice is overdue and
    eligible (i.e. interest has begun accruing)."""
    if not is_eligible(inv):
        return False
    return escalation_stage(inv) in ("NUDGE", "FORMAL_DEMAND", "ODR_READY")


# ---------------------------------------------------------------------------
# 6. THE ONE FUNCTION THE APP CALLS
# ---------------------------------------------------------------------------
def analyse(inv: Invoice) -> dict:
    """Run the full deterministic analysis and return a plain dict.
    This dict is what gets handed to the LLM layer -- the LLM only writes
    prose around these already-computed numbers; it never computes them."""
    stage = escalation_stage(inv)
    return {
        "buyer_name": inv.buyer_name,
        "amount": round(inv.amount, 2),
        "language": inv.language,
        "invoice_date": str(inv.invoice_date),
        "today": str(inv.today),
        "days_since_invoice": days_since_invoice(inv),
        "days_overdue": days_overdue(inv),
        "eligible": is_eligible(inv),
        "eligibility_reason": eligibility_reason(inv),
        "statutory_rate_pct": round(STATUTORY_RATE * 100, 2),
        "interest": statutory_interest(inv),
        "total_payable": total_payable(inv),
        "stage": stage,
        "stage_label": STAGE_LABELS[stage],
        "flag_43bh": flag_43bh(inv),
    }