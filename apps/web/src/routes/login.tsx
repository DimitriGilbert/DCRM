import { isOwnerBootstrapOpen } from "@DCRM/auth";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

const getBootstrapStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { canCreateOwner: await isOwnerBootstrapOpen() };
});

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    return getBootstrapStatus();
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { canCreateOwner } = Route.useRouteContext();
  const [showSignIn, setShowSignIn] = useState(!canCreateOwner);

  return showSignIn ? (
    <SignInForm allowSignUp={canCreateOwner} onSwitchToSignUp={() => setShowSignIn(false)} />
  ) : (
    <SignUpForm canCreateOwner={canCreateOwner} onSwitchToSignIn={() => setShowSignIn(true)} />
  );
}
