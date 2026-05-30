import { createFileRoute, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getUser();
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="max-w-md space-y-4 px-4 text-center">
        <h1 className="text-xl font-semibold tracking-tight">DCRM</h1>
        <p className="text-sm text-muted-foreground">
          Micro CRM for independent contractors.
        </p>
      </div>
    </div>
  );
}
