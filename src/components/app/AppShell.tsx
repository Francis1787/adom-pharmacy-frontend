import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Pill, Boxes, ClipboardList, Users, Stethoscope, Receipt, PackageSearch, UserCog, ScrollText, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof Pill; roles: Role[] };

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["Pharmacist", "Technician", "Admin"] },
  { to: "/inventory", label: "Drug Inventory", icon: Pill, roles: ["Pharmacist", "Technician", "Admin"] },
  { to: "/batches", label: "Batches", icon: Boxes, roles: ["Pharmacist", "Technician", "Admin"] },
  { to: "/prescriptions", label: "Prescriptions", icon: ClipboardList, roles: ["Pharmacist", "Technician", "Admin"] },
  { to: "/customers", label: "Customers", icon: Users, roles: ["Pharmacist", "Technician"] },
  { to: "/doctors", label: "Doctors", icon: Stethoscope, roles: ["Pharmacist", "Technician"] },
  { to: "/sales", label: "Sales", icon: Receipt, roles: ["Pharmacist", "Technician", "Admin"] },
  { to: "/purchase-orders", label: "Purchase Orders", icon: PackageSearch, roles: ["Technician", "Admin"] },
  { to: "/staff", label: "Staff", icon: UserCog, roles: ["Admin"] },
  { to: "/audit-log", label: "Audit Log", icon: ScrollText, roles: ["Admin"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!user) return null;

  const items = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-64 border-r bg-background flex flex-col">
        <div className="h-16 px-6 flex items-center border-b">
          <div>
            <div className="text-sm font-semibold tracking-tight">Adom Community</div>
            <div className="text-xs text-muted-foreground">Pharmacy</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {items.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-background flex items-center justify-end px-6 gap-4">
          <div className="text-right">
            <div className="text-sm font-medium leading-tight">{user.fullName}</div>
            <div className="text-xs text-muted-foreground">{user.role}</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            Log out
          </Button>
        </header>
        <main className="flex-1 p-6 md:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
