import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, Zap, FileText, AlertCircle, Clock, MessageSquare, Mail, Cpu } from "lucide-react";
import {
  useGetInvoice,
  useGetInvoiceInterest,
  useEscalateInvoice,
  useMarkInvoicePaid,
  getGetInvoiceQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetOverdueBreakdownQueryKey,
  getGetRecentActivityQueryKey,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getStatusColor,
  getStageColor,
  getStageLabel,
  getChannelLabel,
  getLanguageLabel,
  getNextStage,
} from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const ESCALATION_STEPS = [
  { stage: "none", day: "Day 0", label: "Invoice Issued", description: "MSMED clock starts" },
  { stage: "nudge", day: "Day 30", label: "Relationship Nudge", description: "Polite reminder in trade language" },
  { stage: "tax_nudge", day: "Day 46", label: "Tax Nudge", description: "Section 43B(h) implication flagged" },
  { stage: "formal_demand", day: "Day 75", label: "Formal Demand", description: "Compound interest notice issued" },
  { stage: "odr_ready", day: "Day 90+", label: "ODR Pack Ready", description: "Filing pack assembled" },
];

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  whatsapp: MessageSquare,
  email: Mail,
  system: Cpu,
};

function InterestMeter({ invoiceId }: { invoiceId: number }) {
  const { data: interest, isLoading } = useGetInvoiceInterest(invoiceId, {
    query: { queryKey: ["interest", invoiceId] },
  });

  if (isLoading) return <div className="h-24 animate-pulse bg-muted rounded-lg" />;
  if (!interest) return null;

  const notEligible = !interest.eligible;
  const withinLimit = interest.eligible && !interest.isLegallyOverdue;
  const accruing = interest.eligible && interest.isLegallyOverdue;

  return (
    <div className={`rounded-lg p-4 border ${accruing ? "bg-orange-50 border-orange-200" : withinLimit ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className={`w-4 h-4 ${accruing ? "text-orange-600" : withinLimit ? "text-green-600" : "text-gray-500"}`} />
        <p className="text-sm font-semibold text-foreground">
          {accruing ? "Interest Accruing — 3× RBI Rate" : withinLimit ? "Within 45-Day Limit" : "Udyam Eligibility Not Confirmed"}
        </p>
      </div>

      {notEligible && (
        <div className="mb-3 text-xs text-gray-600 bg-gray-100 rounded p-2.5">
          Statutory interest does not apply — supplier Udyam registration postdates the invoice (Silpi Industries, SC 2021).
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Principal</p>
          <p className="text-base font-bold text-foreground" data-testid="interest-principal">{formatCurrency(interest.principalAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Interest (s.16)</p>
          <p className={`text-base font-bold ${interest.totalInterest > 0 ? "text-orange-600" : "text-foreground"}`} data-testid="interest-accrued">
            {formatCurrency(interest.totalInterest)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total Due</p>
          <p className="text-lg font-bold text-foreground" data-testid="interest-total-due">{formatCurrency(interest.totalDue)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Daily Accrual</p>
          <p className={`text-base font-medium ${accruing ? "text-orange-600" : "text-muted-foreground"}`}>
            {accruing ? `${formatCurrency(interest.dailyInterest)}/day` : "—"}
          </p>
        </div>
      </div>

      {accruing && (
        <div className="mt-3 pt-3 border-t border-orange-200 space-y-1.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-orange-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-orange-700">
              <strong>s.43B(h) —</strong> buyer cannot deduct this expense until paid. Rate: {(interest.applicableRate * 100).toFixed(1)}% p.a. ({(interest.rbiRate * 100).toFixed(1)}% RBI × 3), compound with monthly rests.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-orange-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-orange-700">
              <strong>Udyam eligible</strong> — supplier was registered before this invoice date (Silpi Industries, SC 2021).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function InvoiceDetail({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<"whatsapp" | "email" | "system">("whatsapp");

  const { data: invoice, isLoading } = useGetInvoice(id, {
    query: { queryKey: getGetInvoiceQueryKey(id) },
  });

  const escalate = useEscalateInvoice();
  const markPaid = useMarkInvoicePaid();

  const sendEmail = useMutation({
    mutationFn: async (vars: { invoiceId: number; stage: string }) => {
      const res = await fetch(`/api/invoices/${vars.invoiceId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: vars.stage }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Failed to send email");
      }
      return res.json() as Promise<{ stage: string; source: string; deliveryStatus: string; recipientEmail: string }>;
    },
  });

  const nextStage = invoice ? getNextStage(invoice.escalationStage) : null;

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetOverdueBreakdownQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  }

  function handleEscalate() {
    if (!nextStage) return;

    if (selectedChannel === "email") {
      sendEmail.mutate(
        { invoiceId: id, stage: nextStage },
        {
          onSuccess: (data) => {
            const sent = data.deliveryStatus === "sent";
            toast({
              title: sent ? "Email dispatched" : "Notice logged (simulated)",
              description: sent
                ? `Notice sent to ${data.recipientEmail}`
                : "Set EMAIL_MODE=real in Replit secrets to send real emails",
            });
            setEscalateOpen(false);
            invalidateAll();
          },
          onError: (err) =>
            toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to send email", variant: "destructive" }),
        }
      );
      return;
    }

    escalate.mutate(
      { id, data: { stage: nextStage as "nudge" | "tax_nudge" | "formal_demand" | "odr_ready", channel: selectedChannel, approvedByOwner: true } },
      {
        onSuccess: () => {
          toast({ title: "Escalation sent", description: `Invoice escalated to ${getStageLabel(nextStage)}` });
          setEscalateOpen(false);
          invalidateAll();
        },
        onError: () => toast({ title: "Error", description: "Failed to escalate", variant: "destructive" }),
      }
    );
  }

  function handleMarkPaid() {
    markPaid.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Marked as paid", description: "Invoice has been marked as paid" });
          invalidateAll();
        },
        onError: () => toast({ title: "Error", description: "Failed to mark as paid", variant: "destructive" }),
      }
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse bg-muted rounded" />
        <div className="h-64 animate-pulse bg-muted rounded-lg" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Invoice not found</p>
        <Link href="/invoices"><button className="mt-4 text-primary text-sm hover:underline">Back to invoices</button></Link>
      </div>
    );
  }

  const currentStepIdx = ESCALATION_STEPS.findIndex((s) => s.stage === invoice.escalationStage);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/invoices">
          <button data-testid="btn-back" className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">{invoice.invoiceNumber}</h1>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
              {invoice.status}
            </span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(invoice.escalationStage)}`}>
              {getStageLabel(invoice.escalationStage)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{invoice.buyerName}</p>
        </div>
        <div className="flex gap-2">
          {invoice.status !== "paid" && (
            <button
              data-testid="btn-mark-paid"
              onClick={handleMarkPaid}
              disabled={markPaid.isPending}
              className="flex items-center gap-1.5 border border-green-300 bg-green-50 text-green-800 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-green-100 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Mark Paid
            </button>
          )}
          {nextStage && invoice.status !== "paid" && (
            <button
              data-testid="btn-escalate"
              onClick={() => setEscalateOpen(!escalateOpen)}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
            >
              <Zap className="w-4 h-4" />
              Escalate to {getStageLabel(nextStage)}
            </button>
          )}
        </div>
      </div>

      {escalateOpen && nextStage && (
        <div className="bg-card border border-primary/30 rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-3">Confirm Escalation — {getStageLabel(nextStage)}</h3>
          <p className="text-xs text-muted-foreground mb-3">Choose the delivery channel. The message will be drafted in the buyer's preferred language.</p>
          <div className="flex gap-2 mb-4">
            {(["whatsapp", "email", "system"] as const).map((ch) => (
              <button
                key={ch}
                data-testid={`channel-${ch}`}
                onClick={() => setSelectedChannel(ch)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  selectedChannel === ch
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-input hover:bg-muted"
                }`}
              >
                {getChannelLabel(ch)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              data-testid="btn-confirm-escalate"
              onClick={handleEscalate}
              disabled={escalate.isPending || sendEmail.isPending}
              className="bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50"
            >
              {(escalate.isPending || sendEmail.isPending)
                ? selectedChannel === "email" ? "Sending email..." : "Sending..."
                : "Confirm & Send"}
            </button>
            <button
              onClick={() => setEscalateOpen(false)}
              className="text-sm text-muted-foreground border border-input px-4 py-2 rounded-md hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground mb-4">Invoice Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="text-xl font-bold text-foreground mt-0.5" data-testid="invoice-amount">{formatCurrency(invoice.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Days Overdue</p>
                <p className={`text-xl font-bold mt-0.5 ${invoice.daysOverdue > 90 ? "text-red-600" : invoice.daysOverdue > 45 ? "text-orange-600" : invoice.daysOverdue > 0 ? "text-yellow-600" : "text-green-600"}`} data-testid="invoice-days-overdue">
                  {invoice.daysOverdue > 0 ? `${invoice.daysOverdue} days` : "On time"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Invoice Date</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{formatDate(invoice.invoiceDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Due Date</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{formatDate(invoice.dueDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Buyer</p>
                <Link href={`/buyers/${invoice.buyerId}`}>
                  <p className="text-sm font-medium text-primary hover:underline cursor-pointer mt-0.5">{invoice.buyerName}</p>
                </Link>
              </div>
              {invoice.poNumber && (
                <div>
                  <p className="text-xs text-muted-foreground">PO Number</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">{invoice.poNumber}</p>
                </div>
              )}
            </div>
            {invoice.description && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="text-sm text-foreground mt-1">{invoice.description}</p>
              </div>
            )}
          </div>

          <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Escalation Ladder</h2>
              {invoice.escalationStage === "odr_ready" && (
                <a href="https://odr.msme.gov.in" target="_blank" rel="noopener noreferrer">
                  <button data-testid="btn-odr-portal" className="flex items-center gap-1.5 text-xs font-medium text-red-700 border border-red-300 bg-red-50 px-3 py-1.5 rounded-md hover:bg-red-100 transition-colors">
                    <FileText className="w-3.5 h-3.5" />
                    Submit to ODR Portal
                  </button>
                </a>
              )}
            </div>
            <div className="relative">
              <div className="absolute left-3.5 top-4 bottom-4 w-px bg-border" />
              <div className="space-y-4">
                {ESCALATION_STEPS.map((step, idx) => {
                  const done = currentStepIdx >= idx;
                  const active = currentStepIdx === idx;
                  return (
                    <div key={step.stage} className="flex gap-3 relative">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 transition-colors ${
                        done
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-card border-border text-muted-foreground"
                      }`}>
                        {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      </div>
                      <div className={`pb-1 ${active ? "opacity-100" : done ? "opacity-90" : "opacity-50"}`}>
                        <p className={`text-xs font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}>
                          {step.day} — {step.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {invoice.escalationEvents && invoice.escalationEvents.length > 0 && (
            <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground mb-4">Communication History</h2>
              <div className="space-y-4">
                {invoice.escalationEvents.map((ev) => {
                  const ChIcon = CHANNEL_ICONS[ev.channel] ?? Cpu;
                  return (
                    <div key={ev.id} data-testid={`escalation-event-${ev.id}`} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <ChIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(ev.stage)}`}>
                            {getStageLabel(ev.stage)}
                          </span>
                          <span className="text-xs text-muted-foreground">{getChannelLabel(ev.channel)}</span>
                          {ev.language && <span className="text-xs text-muted-foreground">{getLanguageLabel(ev.language)}</span>}
                          {ev.approvedByOwner && <span className="text-xs text-green-600 font-medium">Owner approved</span>}
                        </div>
                        <p className="text-xs text-foreground/80 mt-1.5 leading-relaxed bg-muted/40 rounded-md p-2.5">{ev.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{formatDateTime(ev.sentAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <InterestMeter invoiceId={id} />

          {invoice.escalationStage === "odr_ready" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-red-600" />
                <p className="text-sm font-semibold text-red-800">ODR Pack Assembled</p>
              </div>
              <p className="text-xs text-red-700 mb-3">
                Your filing pack is ready. The buyer must deposit 75% of any council award to appeal — making early settlement the rational choice.
              </p>
              <ul className="text-xs text-red-700 space-y-1 mb-3">
                <li>Purchase Orders</li>
                <li>Delivery Logs</li>
                <li>Interest Workings</li>
                <li>Escalation Timeline</li>
              </ul>
              <a href="https://odr.msme.gov.in" target="_blank" rel="noopener noreferrer">
                <button data-testid="btn-submit-odr" className="w-full text-sm font-medium text-red-800 border border-red-300 bg-red-100 py-2 rounded-md hover:bg-red-200 transition-colors">
                  Submit to odr.msme.gov.in
                </button>
              </a>
            </div>
          )}

          <div className="bg-card border border-card-border rounded-lg p-4 shadow-sm">
            <p className="text-xs font-semibold text-foreground mb-3">Quick Stats</p>
            <div className="space-y-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">MSMED Limit</span>
                <span className="font-medium text-foreground">45 days</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Days Overdue</span>
                <span className={`font-medium ${invoice.daysOverdue > 45 ? "text-red-600" : "text-foreground"}`}>{invoice.daysOverdue} days</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">RBI Rate (×3)</span>
                <span className="font-medium text-foreground">16.5% p.a.</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Formula</span>
                <span className="font-medium text-foreground">P(1+r/12)^months</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">43B(h) Applies</span>
                <span className={`font-medium ${invoice.daysOverdue > 0 ? "text-red-600" : "text-green-600"}`}>
                  {invoice.daysOverdue > 0 ? "Yes" : "No"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
