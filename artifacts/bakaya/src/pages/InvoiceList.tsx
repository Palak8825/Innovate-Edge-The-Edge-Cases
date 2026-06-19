import { useState } from "react";
import { Link } from "wouter";
import { Search, Plus, ChevronRight, ArrowUpDown } from "lucide-react";
import { useListInvoices } from "@workspace/api-client-react";
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  getStageColor,
  getStageLabel,
} from "@/lib/utils";

const STATUS_OPTIONS = ["", "pending", "overdue", "escalating", "paid", "disputed"];
const STATUS_LABELS: Record<string, string> = {
  "": "All",
  pending: "Pending",
  overdue: "Overdue",
  escalating: "Escalating",
  paid: "Paid",
  disputed: "Disputed",
};

export function InvoiceList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: invoices, isLoading } = useListInvoices(
    statusFilter ? { status: statusFilter } : undefined
  );

  const filtered = (invoices ?? []).filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.buyerName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{invoices?.length ?? 0} total invoices</p>
        </div>
        <Link href="/add-invoice">
          <button data-testid="btn-new-invoice" className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" />
            New Invoice
          </button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            data-testid="input-search-invoices"
            type="search"
            placeholder="Search invoice or buyer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              data-testid={`filter-status-${s || "all"}`}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-input hover:bg-muted"
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Invoice</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Buyer</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Interest</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Days</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Stage</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-border">
                  <td colSpan={8} className="px-4 py-3">
                    <div className="h-4 animate-pulse bg-muted rounded w-full" />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {search || statusFilter ? "No matching invoices" : "No invoices yet — add your first invoice"}
                </td>
              </tr>
            ) : (
              filtered.map((inv) => (
                <tr key={inv.id} data-testid={`row-invoice-${inv.id}`} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{inv.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(inv.invoiceDate)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{inv.buyerName}</p>
                    {inv.poNumber && <p className="text-xs text-muted-foreground">PO: {inv.poNumber}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-semibold text-foreground">{formatCurrency(inv.amount)}</p>
                    <p className="text-xs text-muted-foreground">Due {formatDate(inv.dueDate)}</p>
                  </td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    {(inv.interestAccrued ?? 0) > 0 ? (
                      <p className="text-orange-600 font-medium">{formatCurrency(inv.interestAccrued ?? 0)}</p>
                    ) : (
                      <p className="text-muted-foreground text-xs">—</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    {inv.daysOverdue > 0 ? (
                      <span className={`text-sm font-semibold ${inv.status === "paid" ? "text-muted-foreground" : inv.daysOverdue > 90 ? "text-red-600" : inv.daysOverdue > 45 ? "text-orange-600" : "text-yellow-600"}`}>
                        {inv.daysOverdue}d
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(inv.status)}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center hidden lg:table-cell">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(inv.escalationStage)}`}>
                      {getStageLabel(inv.escalationStage)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/invoices/${inv.id}`}>
                      <ChevronRight data-testid={`link-invoice-${inv.id}`} className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-pointer transition-colors" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
