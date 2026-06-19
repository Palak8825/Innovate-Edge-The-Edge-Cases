/**
 * Email dispatch layer.
 *
 * EMAIL_MODE env var (default: "simulation"):
 *   "real"       — sends via Gmail SMTP (needs GMAIL_ADDRESS + GMAIL_APP_PASSWORD)
 *   "simulation" — logs the send, returns simulated status, no mail server hit
 *
 * DEMO_RECIPIENT_EMAIL env var: when set, overrides the `to` address on every
 * outbound message so you never accidentally email a real buyer during demos.
 */

import nodemailer from "nodemailer";
import { logger } from "./logger.js";

export type NoticeMeta = {
  invoiceNumber: string;
  buyerName: string;
  stage: string;
  principal: number;
  interestAccrued: number;
  totalDue: number;
  daysOverdue: number;
};

export type NoticePayload = {
  to: string;
  subject: string;
  body: string;
  senderName?: string;
  meta?: NoticeMeta;
};

export type NotifyResult = {
  status: "sent" | "simulated" | "failed";
  detail: string;
};

export async function sendNotice(payload: NoticePayload): Promise<NotifyResult> {
  const recipient = process.env.DEMO_RECIPIENT_EMAIL || payload.to;
  const mode = process.env.EMAIL_MODE ?? "simulation";

  if (mode === "real") {
    return sendViaGmail(payload, recipient);
  }

  return simulateSend(recipient, payload.subject);
}

// ── HTML template ─────────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<string, { label: string; accent: string; badgeBg: string; badgeText: string }> = {
  nudge:         { label: "Friendly Reminder",    accent: "#2563eb", badgeBg: "#eff6ff", badgeText: "#1d4ed8" },
  tax_nudge:     { label: "Overdue — Tax Alert",  accent: "#d97706", badgeBg: "#fffbeb", badgeText: "#92400e" },
  formal_demand: { label: "Formal Demand Notice", accent: "#dc2626", badgeBg: "#fef2f2", badgeText: "#991b1b" },
  odr_ready:     { label: "Final Notice",         accent: "#7c3aed", badgeBg: "#f5f3ff", badgeText: "#4c1d95" },
};

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function buildHtml(payload: NoticePayload): string {
  const { body, meta } = payload;
  const cfg = (meta && STAGE_CONFIG[meta.stage]) ?? STAGE_CONFIG["nudge"];

  const metaRows = meta
    ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:24px;border-top:1px solid #e5e7eb;">
      <tr>
        <td style="padding:10px 0;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Invoice</td>
        <td style="padding:10px 0;font-size:13px;font-weight:600;color:#111827;text-align:right;border-bottom:1px solid #f3f4f6;">${meta.invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Buyer</td>
        <td style="padding:10px 0;font-size:13px;font-weight:600;color:#111827;text-align:right;border-bottom:1px solid #f3f4f6;">${meta.buyerName}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Principal</td>
        <td style="padding:10px 0;font-size:13px;font-weight:600;color:#111827;text-align:right;border-bottom:1px solid #f3f4f6;">${fmtINR(meta.principal)}</td>
      </tr>
      ${meta.interestAccrued > 0 ? `
      <tr>
        <td style="padding:10px 0;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Interest Accrued (MSMED s.16)</td>
        <td style="padding:10px 0;font-size:13px;font-weight:600;color:#dc2626;text-align:right;border-bottom:1px solid #f3f4f6;">+ ${fmtINR(meta.interestAccrued)}</td>
      </tr>` : ""}
      <tr>
        <td style="padding:12px 0;font-size:14px;font-weight:700;color:#111827;">Total Now Due</td>
        <td style="padding:12px 0;font-size:14px;font-weight:700;color:#111827;text-align:right;">${fmtINR(meta.totalDue)}</td>
      </tr>
    </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${payload.subject}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px 32px;">
              <span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Bakaya</span>
              <span style="font-size:12px;color:#94a3b8;margin-left:8px;">MSME Payment Recovery</span>
              <div style="margin-top:12px;">
                <span style="display:inline-block;background:${cfg.badgeBg};color:${cfg.badgeText};font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:0.5px;text-transform:uppercase;">${cfg.label}</span>
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px;">

              <!-- Notice message -->
              <div style="background:#f8fafc;border-left:4px solid ${cfg.accent};border-radius:0 8px 8px 0;padding:20px 24px;font-size:15px;line-height:1.7;color:#1e293b;">
                ${body.replace(/\n/g, "<br/>")}
              </div>

              ${metaRows}

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-radius:0 0 12px 12px;border-top:1px solid #e5e7eb;padding:16px 32px;">
              <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;">
                This is an automated notice generated by <strong>Bakaya</strong> under the MSMED Act 2006.
                Interest computed at 3× RBI bank rate per Section 16. For disputes, contact the MSME Facilitation Council
                at <a href="https://odr.msme.gov.in" style="color:#6366f1;">odr.msme.gov.in</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Transports ────────────────────────────────────────────────────────────────

async function sendViaGmail(
  payload: NoticePayload,
  recipient: string,
): Promise<NotifyResult> {
  const gmailAddress = process.env.GMAIL_ADDRESS;
  const appPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailAddress || !appPassword) {
    logger.warn(
      "EMAIL_MODE=real but GMAIL_ADDRESS or GMAIL_APP_PASSWORD not set — falling back to simulation",
    );
    return simulateSend(recipient, payload.subject);
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailAddress, pass: appPassword },
    });

    const displayName = payload.senderName ?? "Accounts Desk";
    const info = await transporter.sendMail({
      from: `"${displayName} (via Bakaya)" <${gmailAddress}>`,
      replyTo: gmailAddress,
      to: recipient,
      subject: payload.subject,
      text: payload.body,
      html: buildHtml(payload),
    });

    logger.info({ messageId: info.messageId, to: recipient }, "Email dispatched");
    return { status: "sent", detail: info.messageId ?? "no-message-id" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "SMTP send failed");
    return { status: "failed", detail };
  }
}

function simulateSend(to: string, subject: string): NotifyResult {
  logger.info({ to, subject }, "[SIMULATED] Email dispatch — set EMAIL_MODE=real to send for real");
  return {
    status: "simulated",
    detail: `Would send to ${to}: "${subject}"`,
  };
}
