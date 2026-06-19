import { Link } from "wouter";
import { ArrowLeft, Building2, Phone, Mail, Globe, Hash } from "lucide-react";
import {
  useGetBuyer,
  useListInvoices,
  getGetBuyerQueryKey,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate, getStatusColor, getStageLabel, getStageColor, getLanguageLabel } from "@/lib/utils";

export function BuyerDetail({ id }: { id: number }) {
  const { data: buyer, isLoading: buyerLoading } = useGetBuyer(id, {
    query: { queryKey: getGetBuyerQueryKey(id) },
  });
  const { data: invoices, isLoading: invLoading } = useListInvoices(
    { buyerId: id },
    { query: { queryKey: getListInvoicesQueryKey({ buyerId: id }) } }
  );

  if (buyerLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse bg-muted rounded" />
        <div className="h-48 animate-pulse bg-muted rounded-lg" />
      </div>
    );
  }

  if (!buyer) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Buyer not found</p>
        <Link href="/buyers"><button className="mt-4 text-primary text-sm hover:underline">Back to buyers</button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/buyers">
          <button data-testid="btn-back-buyers" className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground" data-testid="buyer-detail-name">{buyer.name}</h1>
          <p className="text-sm text-muted-foreground">{buyer.contactName}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{buyer.name}</p>
              <p className="text-xs text-muted-foreground">{getLanguageLabel(buyer.language)}</p>
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground">{buyer.phone}</span>
            </div>
            {buyer.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-foreground">{buyer.email}</span>
              </div>
            )}
            {buyer.city && (
              <div className="flex items-center gap-2 text-sm">
                <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-foreground">{buyer.city}</span>
              </div>
            )}
            {buyer.gstNumber && (
              <div className="flex items-center gap-2 text-sm">
                <Hash className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-foreground font-mono text-xs">{buyer.gstNumber}</span>
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className={`text-base font-bold ${(buyer.totalOutstanding ?? 0) > 0 ? "text-orange-600" : "text-green-600"}`}>
                {formatCurrency(buyer.totalOutstanding ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Invoices</p>
              <p className="text-base font-bold text-foreground">{buyer.invoiceCount ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Invoices</h2>
            <Link href={`/add-invoice?buyerId=${id}`}>
              <button data-testid="btn-add-invoice-for-buyer" className="text-xs text-primary hover:underline">Add invoice</button>
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Invoice</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Days</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Stage</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {invLoading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-4 animate-pulse bg-muted rounded" />
                    </td>
                  </tr>
                ))
              ) : !invoices?.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No invoices for this buyer yet
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} data-testid={`buyer-inv-row-${inv.id}`} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(inv.invoiceDate)}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(inv.amount)}</td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      {inv.daysOverdue > 0 ? (
                        <span className={`text-sm font-semibold ${inv.daysOverdue > 90 ? "text-red-600" : inv.daysOverdue > 45 ? "text-orange-600" : "text-yellow-600"}`}>
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
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(inv.escalationStage)}`}>
                        {getStageLabel(inv.escalationStage)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/invoices/${inv.id}`}>
                        <span className="text-xs text-primary hover:underline cursor-pointer">View</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
