"""
Bakaya AI - Email dispatch layer
================================
Sends the (already approved) recovery notice by email via Gmail SMTP.

DESIGN PRINCIPLE (matches the whole product): nothing is ever sent
automatically. The agent drafts; the human reviews; the human clicks send and
chooses the recipient. This module only fires when explicitly called from a
button press, with a recipient the user typed in.

Credentials live in Streamlit secrets / environment, NEVER in code:
    GMAIL_ADDRESS      e.g. you@gmail.com
    GMAIL_APP_PASSWORD the 16-char Google App Password (not your real password)

If credentials are absent, send_email() returns a 'simulated' result so the
demo still shows the full flow without crashing.
"""

import os
import smtplib
from email.message import EmailMessage


def _credentials():
    """Fetch Gmail credentials from Streamlit secrets first, then env vars."""
    addr = pwd = None
    # Streamlit secrets (preferred on the deployed app)
    try:
        import streamlit as st
        addr = st.secrets.get("GMAIL_ADDRESS")
        pwd = st.secrets.get("GMAIL_APP_PASSWORD")
    except Exception:
        pass
    # Environment fallback (for local running via .env)
    addr = addr or os.environ.get("GMAIL_ADDRESS")
    pwd = pwd or os.environ.get("GMAIL_APP_PASSWORD")
    return addr, pwd


def email_configured() -> bool:
    """True if real sending is possible (both credentials present)."""
    addr, pwd = _credentials()
    return bool(addr and pwd)


def send_email(to_address: str, subject: str, body: str,
               owner_name: str = "", owner_email: str = "") -> dict:
    """Send the notice on the owner's behalf.

    The buyer should see the SUPPLIER's identity, not Bakaya's mailbox:
      - Display name shows "<Business> via Bakaya"
      - Reply-To is the owner's email, so any reply reaches the supplier,
        not the technical sending account.
    (Gmail forces the real account into the raw 'From' for anti-spoofing, but
    display name + Reply-To is the standard, honest way to represent the owner.
    Production would use per-owner authenticated sending.)

    Returns a result dict the UI can display.
    """
    to_address = (to_address or "").strip()
    if not to_address or "@" not in to_address:
        return {"ok": False, "simulated": False,
                "message": "Please enter a valid recipient email address."}

    addr, pwd = _credentials()

    # Build a friendly display name for the sender.
    biz = (owner_name or "").strip()
    display = f"{biz} (via Bakaya)" if biz else "Accounts Desk (via Bakaya)"

    # No credentials -> safe simulation so the demo flow still works.
    if not (addr and pwd):
        seen_as = f'"{display}"'
        reply = (owner_email or "").strip()
        reply_note = f", replies routed to {reply}" if reply else ""
        return {
            "ok": True, "simulated": True,
            "message": (f"Simulated send to {to_address}. The buyer would see it "
                        f"from {seen_as}{reply_note}. (Email credentials are not "
                        "configured, so no real email was sent.)"),
        }

    # Real send via Gmail SMTP over SSL.
    try:
        from email.utils import formataddr

        msg = EmailMessage()
        # Display name shows the supplier; the address is the sending mailbox.
        msg["From"] = formataddr((display, addr))
        msg["To"] = to_address
        msg["Subject"] = subject
        # Replies go to the business owner, not the technical sender.
        if (owner_email or "").strip():
            msg["Reply-To"] = owner_email.strip()
        msg.set_content(body)

        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as server:
            server.login(addr, pwd)
            server.send_message(msg)

        seen_as = f'"{display}"'
        reply = (owner_email or "").strip()
        reply_note = f"; replies go to {reply}" if reply else ""
        return {"ok": True, "simulated": False,
                "message": f"Email sent to {to_address}, shown as {seen_as}{reply_note}."}
    except smtplib.SMTPAuthenticationError:
        return {"ok": False, "simulated": False,
                "message": ("Gmail rejected the login. Check that GMAIL_ADDRESS "
                            "is correct and GMAIL_APP_PASSWORD is a valid 16-char "
                            "App Password (not your normal password).")}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "simulated": False,
                "message": f"Could not send email: {e}"}