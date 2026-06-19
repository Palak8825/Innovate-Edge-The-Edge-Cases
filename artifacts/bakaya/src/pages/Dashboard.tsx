import { Link } from "wouter";
import { AlertCircle, CheckCircle2, Clock, TrendingUp, ArrowUpRight, FileText, Zap } from "lucide-react";
import {
  useGetDashboardSummary,
  useGetOverdueBreakdown,
  useGetRecentActivity,
} from "@workspace/api-client-react";
import { formatCurrency, formatDateTime, getStageLabel, getChannelLabel } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const STAGE_COLORS: Record<string, string> = {
  none: "#94a3b8",
  nudge: "#3b82f6",
  tax_nudge: "#eab308",
  formal_demand: "#f97316",
  odr_ready: "#ef4444",
};

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  "data-testid": testId,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  "data-testid"?: string;
}) {
  return (
    <div data-testid={testId} className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconColor}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { data: summary, isLoading: sumLoading } = useGetDashboardSummary();
  const { data: breakdown, isLoading: breakLoading } = useGetOverdueBreakdown();
  const { data: activity, isLoading: actLoading } = useGetRecentActivity();

  const chartData = breakdown?.map((b) => ({
    label: b.label,
    amount: b.amount,
    count: b.count,
    stage: b.stage,
  })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your AR desk overview</p>
        </div>
        <Link href="/add-invoice">
          <button data-testid="btn-add-invoice" className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md hover:opacity-90 transition-opacity">
            <FileText className="w-4 h-4" />
            Add Invoice
          </button>
        </Link>
      </div>

      {sumLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-card-border rounded-lg p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Outstanding"
            value={formatCurrency(summary?.totalOutstanding ?? 0)}
            sub={`${summary?.totalInvoices ?? 0} invoices`}
            icon={TrendingUp}
            iconColor="bg-primary/10 text-primary"
            data-testid="stat-total-outstanding"
          />
          <StatCard
            label="Overdue"
            value={formatCurrency(summary?.overdueAmount ?? 0)}
            sub={`${summary?.overdueCount ?? 0} invoices · avg ${Math.round(summary?.avgDaysOverdue ?? 0)} days`}
            icon={AlertCircle}
            iconColor="bg-red-100 text-red-600"
            data-testid="stat-overdue"
          />
          <StatCard
            label="Escalating"
            value={String(summary?.escalatingCount ?? 0)}
            sub={`${summary?.odrReadyCount ?? 0} ODR ready`}
            icon={Zap}
            iconColor="bg-orange-100 text-orange-600"
            data-testid="stat-escalating"
          />
          <StatCard
            label="Recovered"
            value={formatCurrency(summary?.recoveredAmount ?? 0)}
            sub={`${summary?.paidCount ?? 0} invoices paid`}
            icon={CheckCircle2}
            iconColor="bg-green-100 text-green-600"
            data-testid="stat-recovered"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-card border border-card-border rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">Overdue by Escalation Stage</h2>
          {breakLoading ? (
            <div className="h-48 animate-pulse bg-muted rounded" />
          ) : chartData.every((d) => d.amount === 0) ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No overdue invoices</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), "Amount"]}
                  contentStyle={{ fontSize: 12, border: "1px solid hsl(var(--border))", borderRadius: 6, background: "hsl(var(--card))" }}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={STAGE_COLORS[entry.stage] ?? "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(STAGE_COLORS).map(([stage, color]) => (
              <div key={stage} className="flex items-center gap-1 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {getStageLabel(stage)}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-card border border-card-border rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            <Link href="/invoices">
              <span className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-0.5">
                All invoices <ArrowUpRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
          {actLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse bg-muted rounded" />
              ))}
            </div>
          ) : !activity?.length ? (
            <div className="text-sm text-muted-foreground text-center py-8">No activity yet</div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {activity.map((item) => (
                <Link key={item.id} href={`/invoices/${item.invoiceId}`}>
                  <div data-testid={`activity-item-${item.id}`} className="flex gap-3 p-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.buyerName} · {item.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">{getStageLabel(item.stage)} via {getChannelLabel(item.channel)}</p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">{formatDateTime(item.sentAt)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {!sumLoading && (summary?.odrReadyCount ?? 0) > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800">{summary!.odrReadyCount} invoice{summary!.odrReadyCount > 1 ? "s" : ""} ready for ODR filing</p>
              <p className="text-xs text-red-700">These invoices have exceeded 90 days — ODR packs are assembled and ready to submit to odr.msme.gov.in</p>
            </div>
          </div>
          <Link href="/invoices?status=escalating">
            <button data-testid="btn-view-odr" className="text-sm font-medium text-red-700 border border-red-300 bg-red-100 px-3 py-1.5 rounded-md hover:bg-red-200 transition-colors whitespace-nowrap">
              View invoices
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
