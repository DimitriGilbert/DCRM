import { createTranslator, DEFAULT_LOCALE } from "@DCRM/i18n";
import { Link } from "@tanstack/react-router";

import UserMenu from "./user-menu";

const t = createTranslator(DEFAULT_LOCALE);

const primaryLinks = [
  { to: "/", label: t("appShell.navigation.home") },
  { to: "/dashboard", label: t("appShell.navigation.dashboard") },
  { to: "/clients", label: t("appShell.navigation.clients") },
  { to: "/leads", label: t("appShell.navigation.leads") },
  { to: "/projects", label: t("appShell.navigation.projects") },
  { to: "/tickets", label: t("appShell.navigation.tickets") },
  { to: "/search", label: t("appShell.navigation.search") },
  { to: "/data", label: t("appShell.navigation.data") },
  { to: "/onboarding/language", label: t("appShell.navigation.onboarding") },
] as const;

export default function Header() {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex min-h-14 flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center border bg-primary text-primary-foreground text-xs">D</span>
            <span>{t("appShell.productName")}</span>
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
