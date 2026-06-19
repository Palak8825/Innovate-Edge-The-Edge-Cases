import { Link, useLocation } from "wouter";
import { LayoutDashboard, FileText, Users, PlusCircle, UserPlus, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/buyers", label: "Buyers", icon: Users },
];

const actionItems = [
  { href: "/add-invoice", label: "New Invoice", icon: PlusCircle },
  { href: "/add-buyer", label: "New Buyer", icon: UserPlus },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="flex flex-col h-full w-56 bg-sidebar text-sidebar-foreground border-r border-sidebar-border fixed left-0 top-0 bottom-0 z-30">
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-sidebar-foreground">Bakaya</p>
            <p className="text-xs text-sidebar-foreground/50 leading-none">AR Desk</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="px-2 py-1 text-xs font-medium text-sidebar-foreground/40 uppercase tracking-wider mb-1">Navigation</p>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href}>
              <div
                data-testid={`nav-${label.toLowerCase()}`}
                className={cn(
                  "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm cursor-pointer transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </div>
            </Link>
          );
        })}

        <div className="mt-4 pt-3 border-t border-sidebar-border">
          <p className="px-2 py-1 text-xs font-medium text-sidebar-foreground/40 uppercase tracking-wider mb-1">Quick Add</p>
          {actionItems.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link key={href} href={href}>
                <div
                  data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm cursor-pointer transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </div>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="px-5 py-4 border-t border-sidebar-border">
        <p className="text-xs text-sidebar-foreground/30">MSME AR Automation</p>
        <p className="text-xs text-sidebar-foreground/20 mt-0.5">MSMED Act · ODR Ready</p>
      </div>
    </div>
  );
}
