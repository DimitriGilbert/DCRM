import { Button } from "@DCRM/ui/components/button";
import { Separator } from "@DCRM/ui/components/separator";
import {
  LayoutDashboard,
  Users,
  Target,
  FolderKanban,
  Ticket,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const session = await getUser();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: AuthenticatedLayout,
});

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/leads", label: "Leads", icon: Target },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/tickets", label: "Tickets", icon: Ticket },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AuthenticatedLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const routerState = useRouterState();
  const { data: session } = authClient.useSession();

  const currentPath = routerState.location.pathname;

  return (
    <div className="grid h-svh grid-cols-[1fr] md:grid-cols-[220px_1fr]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col border-r bg-card transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo / Brand */}
        <div className="flex h-12 items-center justify-between px-4">
          <Link
            to="/dashboard"
            className="text-sm font-semibold tracking-tight"
            onClick={() => setSidebarOpen(false)}
          >
            DCRM
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
        <Separator />

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const isActive =
              currentPath === to ||
              (to !== "/dashboard" && currentPath.startsWith(to + "/"));
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-2 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <Separator />
        {/* User info at bottom */}
        <div className="p-3">
          <p className="truncate text-xs text-muted-foreground">
            {session?.user.name ?? session?.user.email ?? "User"}
          </p>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-12 items-center gap-3 border-b px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
          <h1 className="text-sm font-medium">
            {NAV_ITEMS.find(
              (item) =>
                currentPath === item.to ||
                (item.to !== "/dashboard" &&
                  currentPath.startsWith(item.to + "/")),
            )?.label ?? "DCRM"}
          </h1>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
