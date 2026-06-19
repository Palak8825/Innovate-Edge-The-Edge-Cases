"""
Bakaya AI - Recommendation & Timeline layer
===========================================
This sits on top of the rules engine and is STILL deterministic (no LLM).
It turns the computed stage into:
  (a) a recommended action + the reasoning behind it
  (b) a collection-timeline structure for the UI to draw.

This is where the "relationship-preservation" insight becomes visible:
the engine recommends HOW HARD to push, not just WHAT is owed.
"""

from bakaya.rules_engine import Invoice, analyse, PAYMENT_LIMIT_DAYS


RECOMMENDATION = {
    "PRE_DUE": {
        "action": "No action needed yet.",
        "why": [
            "Invoice is still within the 45-day statutory window.",
            "Nothing is legally due yet."
        ],
        "relationship_safe": True,
    },

    "NUDGE": {
        "action": "Send a friendly payment reminder.",
        "why": [
            "Recently crossed the 45-day payment limit.",
            "Statutory interest has begun accruing.",
            "A gentle follow-up is usually sufficient at this stage."
        ],
        "relationship_safe": True,
    },

    "FORMAL_DEMAND": {
        "action": "Send a formal payment notice.",
        "why": [
            "The delay is now significant.",
            "Interest liability is growing.",
            "Professional escalation is appropriate."
        ],
        "relationship_safe": True,
    },

    "ODR_READY": {
        "action": "Prepare for MSME ODR filing.",
        "why": [
            "The invoice is severely overdue.",
            "Recovery should now take priority.",
            "Supporting documentation can be assembled for escalation."
        ],
        "relationship_safe": False,
    },
}


def recommend(analysis: dict) -> dict:
    """Return the recommendation block for the current stage."""
    rec = RECOMMENDATION[analysis["stage"]]

    why = list(rec["why"])

    if analysis["days_overdue"] > 0:
        why.insert(
            0,
            f"Buyer is {analysis['days_overdue']} days overdue."
        )

    if analysis["interest"] > 0:
        why.append(
            f"Interest liability so far: Rs {analysis['interest']:,.2f}."
        )

    return {
        "action": rec["action"],
        "why": why,
        "relationship_safe": rec["relationship_safe"],
    }


def recommendation_summary(analysis: dict) -> str:
    stage = analysis["stage"]

    if stage == "PRE_DUE":
        return (
            "Within the 45-day payment window • "
            "No statutory interest applies • "
            "Monitor only"
        )

    if stage == "NUDGE":
        return (
            "Recently overdue • "
            "Statutory interest has started accruing • "
            "Gentle follow-up recommended"
        )

    if stage == "FORMAL_DEMAND":
        return (
            f"{analysis['days_overdue']} days overdue • "
            f"Rs {analysis['interest']:,.0f} interest accrued • "
            "Professional escalation recommended"
        )

    return (
        "90+ days overdue • "
        "Recovery should take priority • "
        "Documentation ready for escalation"
    )


def timeline(analysis: dict) -> list:
    """Return the collection timeline."""

    days_since = analysis["days_since_invoice"]
    stage = analysis["stage"]

    stage_to_step = {
        "PRE_DUE": 0,
        "NUDGE": 2,
        "FORMAL_DEMAND": 3,
        "ODR_READY": 4,
    }

    current_step = stage_to_step.get(stage, 0)

    steps = [
        (
            0,
            "Eligibility Check",
            "Match invoice dates against Udyam registration to confirm the MSMED clock applies."
        ),
        (
            30,
            "Relationship-Safe Nudge",
            "A polite vernacular reminder, sent under the business's name — not the owner's."
        ),
        (
            46,
            "The Tax Nudge",
            "Flags that statutory interest is accruing and reminds the buyer of the Section 43B(h) cost of paying late."
        ),
        (
            75,
            "Formal Demand",
            "A formal demand notice setting out the exact dues plus compound interest at 3x the RBI rate."
        ),
        (
            90,
            "ODR Preparation",
            "Assembles a full filing pack — POs, delivery logs, interest workings — ready for the MSME ODR portal."
        ),
    ]

    rows = []

    for idx, (day_offset, title, desc) in enumerate(steps):
        day_label = (
            f"Day {day_offset}+"
            if day_offset == 90
            else f"Day {day_offset}"
        )

        rows.append({
            "n": idx + 1,
            "day": day_label,
            "title": title,
            "desc": desc,
            "reached": days_since >= day_offset,
            "current": idx == current_step,
        })

    return rows
