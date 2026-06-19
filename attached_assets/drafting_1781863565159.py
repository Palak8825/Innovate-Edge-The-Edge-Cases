""""
Bakaya AI - LLM Drafting Layer (Groq, free tier)
=================================================
IMPORTANT DESIGN RULE:
The LLM does NOT compute any legal numbers. The rules engine already computed
days overdue, interest, stage, eligibility. The LLM receives those finished
numbers and only writes a polite, human-sounding message in the right language
and tone. This separation is the heart of "value beyond a generic LLM".

Free tier: uses Groq's free API (no credit card needed).
Get a key at https://console.groq.com -> API Keys.
"""

import os
from groq import Groq

MODEL_NAME = "llama-3.3-70b-versatile"

TONE_BY_STAGE = {
    "NUDGE":         "warm and friendly, assumes good faith; gently mentions "
                     "the buyer's own tax-deduction risk as a helpful heads-up",
    "FORMAL_DEMAND": "formal and firm but professional; a clear demand with the "
                     "exact amount and interest, mentions next steps",
    "ODR_READY":     "formal final notice; states the matter is ready to be "
                     "filed with the MSME Facilitation Council via the ODR Portal",
}


def _get_client():
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Put it in a .env file or your "
            "environment. Get one free at https://console.groq.com"
        )
    return Groq(api_key=key)


def build_prompt(analysis: dict) -> str:
    tone = TONE_BY_STAGE.get(analysis["stage"], "polite and professional")

    interest_line = (
        f"Statutory interest accrued so far: Rs {analysis['interest']:,.2f} "
        f"(compound, at {analysis['statutory_rate_pct']}% per annum, "
        f"3x the RBI bank rate, per Section 16 of the MSMED Act)."
        if analysis["interest"] > 0
        else "No statutory interest yet."
    )

    tax_line = (
        "Helpfully remind the buyer that under Section 43B(h) of the Income "
        "Tax Act, they can only claim this expense as a tax deduction in the "
        "year they actually pay it -- so clearing it soon protects their own "
        "deduction."
        if analysis["flag_43bh"]
        else "Do NOT mention tax deductions."
    )

    return f"""You are drafting a payment-reminder message that an Indian small
business is sending to a buyer who owes them money. You write ONLY the message
text -- no preamble, no explanation, no markdown.

Write the message in this language: {analysis['language']}.
Tone required: {tone}.

USE THESE EXACT FACTS. Do not invent or change any number:
- Buyer name: {analysis['buyer_name']}
- Invoice amount (principal): Rs {analysis['amount']:,.2f}
- Days overdue (past the 45-day legal limit): {analysis['days_overdue']}
- {interest_line}
- Total now payable (principal + interest): Rs {analysis['total_payable']:,.2f}

Instructions:
- {tax_line}
- The message is sent "on behalf of the supplier's accounts desk", so it should
  feel like it comes from a back-office system, not an angry owner. This keeps
  the business relationship intact.
- Keep it concise (under 130 words).
- Sign off as "Accounts Desk (via Bakaya)".
- Output ONLY the message text in {analysis['language']}.
"""


def draft_notice(analysis: dict) -> str:
    if analysis["stage"] == "PRE_DUE":
        return ("(No notice generated: this invoice is still within the 45-day "
                "statutory window, so nothing is legally due yet.)")

    import time
    last_error = None
    for attempt in range(2):
        try:
            client = _get_client()
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "user", "content": build_prompt(analysis)}
                ],
                max_tokens=300,
                temperature=0.4,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            last_error = e
            if "429" in str(e) and attempt == 0:
                time.sleep(3)
                continue
            break

    return _fallback_notice(analysis, last_error)


def _fallback_notice(analysis: dict, error=None) -> str:
    interest = (f" Statutory interest of Rs {analysis['interest']:,.2f} has "
                f"accrued." if analysis["interest"] > 0 else "")
    return (
        f"Dear {analysis['buyer_name']},\n\n"
        f"This is a reminder that an amount of Rs {analysis['amount']:,.2f} "
        f"towards our invoice is now {analysis['days_overdue']} days past the "
        f"45-day limit under the MSMED Act.{interest} The total currently "
        f"payable is Rs {analysis['total_payable']:,.2f}. We would be grateful "
        f"for settlement at the earliest.\n\n"
        f"Accounts Desk (via Bakaya)"
    )