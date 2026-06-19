import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateBuyer, getListBuyersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  name: z.string().min(1, "Company name required"),
  contactName: z.string().min(1, "Contact name required"),
  phone: z.string().min(10, "Valid phone number required"),
  email: z.string().email("Valid email required").optional().or(z.literal("")),
  language: z.string().min(1, "Language required"),
  gstNumber: z.string().optional(),
  city: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function AddBuyer() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createBuyer = useCreateBuyer();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { language: "en" },
  });

  function onSubmit(data: FormData) {
    createBuyer.mutate(
      {
        data: {
          name: data.name,
          contactName: data.contactName,
          phone: data.phone,
          email: data.email || null,
          language: data.language,
          gstNumber: data.gstNumber || null,
          city: data.city || null,
        },
      },
      {
        onSuccess: (buyer) => {
          toast({ title: "Buyer added", description: `${buyer.name} has been added` });
          queryClient.invalidateQueries({ queryKey: getListBuyersQueryKey() });
          setLocation("/buyers");
        },
        onError: () => toast({ title: "Error", description: "Failed to add buyer", variant: "destructive" }),
      }
    );
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/buyers">
          <button data-testid="btn-back-buyers" className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">New Buyer</h1>
          <p className="text-sm text-muted-foreground">Add a buyer to track payments from</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-card border border-card-border rounded-lg p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-foreground mb-1.5">Company Name *</label>
            <input
              data-testid="input-buyer-name"
              {...register("name")}
              placeholder="Sunrise Exports Pvt Ltd"
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-foreground mb-1.5">Contact Person *</label>
            <input
              data-testid="input-contact-name"
              {...register("contactName")}
              placeholder="Ramesh Kumar"
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.contactName && <p className="text-xs text-destructive mt-1">{errors.contactName.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Phone *</label>
            <input
              data-testid="input-phone"
              {...register("phone")}
              placeholder="+91 98765 43210"
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Language *</label>
            <select
              data-testid="select-language"
              {...register("language")}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="ta">Tamil</option>
            </select>
            {errors.language && <p className="text-xs text-destructive mt-1">{errors.language.message}</p>}
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-foreground mb-1.5">Email</label>
            <input
              data-testid="input-email"
              type="email"
              {...register("email")}
              placeholder="accounts@sunrise.co.in"
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">City</label>
            <input
              data-testid="input-city"
              {...register("city")}
              placeholder="Tirupur"
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">GST Number</label>
            <input
              data-testid="input-gst"
              {...register("gstNumber")}
              placeholder="33AABCU9603R1ZX"
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono text-xs"
            />
          </div>
        </div>

        <div className="pt-2 flex gap-3">
          <button
            data-testid="btn-submit-buyer"
            type="submit"
            disabled={createBuyer.isPending}
            className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {createBuyer.isPending ? "Adding..." : "Add Buyer"}
          </button>
          <Link href="/buyers">
            <button type="button" className="px-4 py-2.5 border border-input text-sm text-muted-foreground rounded-md hover:bg-muted transition-colors">
              Cancel
            </button>
          </Link>
        </div>
      </form>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5">
        <p className="text-xs text-blue-800 font-medium mb-1">Language matters</p>
        <p className="text-xs text-blue-700">Bakaya drafts payment reminders in the buyer's preferred language — Tamil, Hindi, or English — so communications feel natural, not adversarial.</p>
      </div>
    </div>
  );
}
