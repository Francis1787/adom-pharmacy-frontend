import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set new password — Adom Pharmacy" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { user, ready, completeReset } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) navigate({ to: "/login", replace: true });
    else if (!user.mustResetPassword) navigate({ to: "/", replace: true });
  }, [ready, user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw1.length < 8) return setError("Password must be at least 8 characters");
    if (pw1 !== pw2) return setError("Passwords do not match");
    setBusy(true);
    const res = await completeReset(current, pw1);
    setBusy(false);
    if (!res.ok) return setError(res.error || "Password change failed");
    navigate({ to: "/", replace: true });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Set a new password</h1>
          <p className="text-sm text-muted-foreground mt-1">You must change your temporary password before continuing.</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cur">Current password</Label>
                <Input id="cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw1">New password</Label>
                <Input id="pw1" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} required minLength={8} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirm new password</Label>
                <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" loading={busy}>
                {busy ? "Saving…" : "Set password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
