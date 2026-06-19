import { useState } from "react";
import { Link } from "wouter";
import { Search, Plus, ChevronRight, Building2 } from "lucide-react";
import { useListBuyers } from "@workspace/api-client-react";
import { formatCurrency, getLanguageLabel } from "@/lib/utils";

export function BuyerList() {
  const [search, setSearch] = useState("");
  const { data: buyers, isLoading } = useListBuyers();

  const filtered = (buyers ?? []).filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return b.name.toLowerCase().includes(q) || b.contactName.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Buyers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{buyers?.length ?? 0} buyers</p>
        </div>
        <Link href="/add-buyer">
          <button data-testid="btn-new-buyer" className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" />
            New Buyer
          </button>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          data-testid="input-search-buyers"
          type="search"
          placeholder="Search buyer name or contact..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse bg-muted rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-card-border rounded-lg py-16 text-center">
          <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {search ? "No matching buyers" : "No buyers yet — add your first buyer"}
          </p>
          {!search && (
            <Link href="/add-buyer">
              <button className="mt-3 text-sm text-primary hover:underline">Add buyer</button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((buyer) => (
            <Link key={buyer.id} href={`/buyers/${buyer.id}`}>
              <div
                data-testid={`card-buyer-${buyer.id}`}
                className="bg-card border border-card-border rounded-lg p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                      {getLanguageLabel(buyer.language)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>
                <p className="font-semibold text-foreground" data-testid={`buyer-name-${buyer.id}`}>{buyer.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{buyer.contactName}</p>
                {buyer.city && <p className="text-xs text-muted-foreground">{buyer.city}</p>}
                <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Outstanding</p>
                    <p className={`text-sm font-bold ${(buyer.totalOutstanding ?? 0) > 0 ? "text-orange-600" : "text-green-600"}`}>
                      {formatCurrency(buyer.totalOutstanding ?? 0)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Invoices</p>
                    <p className="text-sm font-bold text-foreground">{buyer.invoiceCount ?? 0}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
