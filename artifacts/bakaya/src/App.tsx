import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/Sidebar";
import { Dashboard } from "@/pages/Dashboard";
import { InvoiceList } from "@/pages/InvoiceList";
import { InvoiceDetail } from "@/pages/InvoiceDetail";
import { BuyerList } from "@/pages/BuyerList";
import { BuyerDetail } from "@/pages/BuyerDetail";
import { AddInvoice } from "@/pages/AddInvoice";
import { AddBuyer } from "@/pages/AddBuyer";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-56 p-6 min-h-screen">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/invoices" component={InvoiceList} />
          <Route path="/invoices/:id">
            {(params) => <InvoiceDetail id={parseInt(params.id, 10)} />}
          </Route>
          <Route path="/buyers" component={BuyerList} />
          <Route path="/buyers/:id">
            {(params) => <BuyerDetail id={parseInt(params.id, 10)} />}
          </Route>
          <Route path="/add-invoice" component={AddInvoice} />
          <Route path="/add-buyer" component={AddBuyer} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
