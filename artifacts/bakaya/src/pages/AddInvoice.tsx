import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useCreateInvoice,
  useListBuyers,
  getListInvoicesQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number required"),
  buyerId: z.coerce.number().min(1, "Please select a buyer"),
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  invoiceDate: z.string().min(1, "Invoice date required"),
  dueDate: z.string().min(1, "Due date required"),
  description: z.string().optional(),
  poNumber: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function AddInvoice() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: buyers } = useListBuyers();
  const createInvoice = useCreateInvoice();

  const today = new Date().toISOString().split("T")[0];
  const defaultDue = new Date(Date.now() + 45 * 86400000).toISOString().split("T")[0];

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      invoiceDate: today,
      dueDate: defaultDue,
    },
  });

  function onSubmit(data: FormData) {
    createInvoice.mutate(
      {
        data: {
          invoiceNumber: data.invoiceNumber,
          buyerId: data.buyerId,
          amount: data.amount,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          description: data.description || null,
          poNumber: data.poNumber || null,
        },
      },
      {
        onSuccess: (inv) => {
          toast({ title: "Invoice created", description: `${inv.invoiceNumber} added successfully` });
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          setLocation(`/invoices/${inv.id}`);
        },
        onError: () => toast({ title: "Error", description: "Failed to create invoice", variant: "destructive" }),
      }
    );
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/invoices">
          <button data-testid="btn-back-invoices" className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">New Invoice</h1>
          <p className="text-sm text-muted-foreground">Add a receivable to track</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-card border border-card-border rounded-lg p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-foreground mb-1.5">Invoice Number *</label>
            <input
              data-testid="input-invoice-number"
              {...register("invoiceNumber")}
              placeholder="INV-001"
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.invoiceNumber && <p className="text-xs text-destructive mt-1">{errors.invoiceNumber.message}</p>}
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-foreground mb-1.5">Buyer *</label>
            <select
              data-testid="select-buyer"
              {...register("buyerId")}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select buyer...</option>
              {buyers?.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {errors.buyerId && <p className="text-xs text-destructive mt-1">{errors.buyerId.message}</p>}
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-foreground mb-1.5">Amount (INR) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
              <input
                data-testid="input-amount"
                type="number"
                {...register("amount")}
                placeholder="0"
                className="w-full pl-7 pr-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {errors.amount && <p className="text-xs text-destructive mt-1">{errors.amount.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Invoice Date *</label>
            <input
              data-testid="input-invoice-date"
              type="date"
              {...register("invoiceDate")}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.invoiceDate && <p className="text-xs text-destructive mt-1">{errors.invoiceDate.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Due Date *</label>
            <input
              data-testid="input-due-date"
              type="date"
              {...register("dueDate")}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.dueDate && <p className="text-xs text-destructive mt-1">{errors.dueDate.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">PO Number</label>
            <input
              data-testid="input-po-number"
              {...register("poNumber")}
              placeholder="PO-2026-001"
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Description</label>
            <input
              data-testid="input-description"
              {...register("description")}
              placeholder="Garment supply, Mar 2026"
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="pt-2 flex gap-3">
          <button
            data-testid="btn-submit-invoice"
            type="submit"
            disabled={createInvoice.isPending}
            className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {createInvoice.isPending ? "Creating..." : "Create Invoice"}
          </button>
          <Link href="/invoices">
            <button type="button" className="px-4 py-2.5 border border-input text-sm text-muted-foreground rounded-md hover:bg-muted transition-colors">
              Cancel
            </button>
          </Link>
        </div>
      </form>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5">
        <p className="text-xs text-blue-800 font-medium mb-1">MSMD Timeline</p>
        <p className="text-xs text-blue-700">The MSMED Act requires payment within 45 days. Bakaya tracks this automatically and will prompt escalation steps as the clock runs.</p>
      </div>
    </div>
  );
}
