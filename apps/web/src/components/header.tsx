import { Link } from "@tanstack/react-router";

import UserMenu from "./user-menu";

const primaryLinks = [
  { to: "/", label: "Home" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/clients", label: "Clients" },
  { to: "/leads", label: "Leads" },
  { to: "/projects", label: "Projects" },
  { to: "/tickets", label: "Tickets" },
] as const;

export default function Header() {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex min-h-14 flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center border bg-primary text-primary-foreground text-xs">D</span>
            <span>DCRM</span>
          </Link>
          <div className="lg:hidden">
            <UserMenu />
          </div>
        </div>
        <nav aria-label="Primary" className="flex gap-1 overflow-x-auto text-sm">
          {primaryLinks.map(({ to, label }) => {
            return (
              <Link
                key={to}
                to={to}
                className="inline-flex h-8 items-center border border-transparent px-3 text-muted-foreground hover:bg-muted hover:text-foreground"
                activeProps={{ className: "border-border bg-muted text-foreground" }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
