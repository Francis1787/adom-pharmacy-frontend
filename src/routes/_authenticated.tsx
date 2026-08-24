import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { ready, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    if (!user) navigate({ to: "/login", replace: true });
    else if (user.mustResetPassword) navigate({ to: "/reset-password", replace: true });
  }, [ready, user, navigate]);

  if (!ready || !user || user.mustResetPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
