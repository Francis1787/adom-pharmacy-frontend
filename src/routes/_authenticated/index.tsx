import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useDrugs, useBatches, usePrescriptions, useSales } from "@/lib/queries";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Pill, ClipboardList, DollarSign, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const { data: drugs = [] } = useDrugs();
  const { data: batches = [] } = useBatches();
  const { data: prescriptions = [] } = usePrescriptions();
  const { data: sales = [] } = useSales();

  // Prefer server-provided quantityInStock when present; otherwise sum sellable batches.
  const stockFor = (drugId: string) => {
    const d = drugs.find((x) => x.id === drugId);
    if (d && typeof d.quantityInStock === "number") return d.quantityInStock;
    return batches
      .filter((b) => b.drug?.id === drugId && !b.isExpired && (!b.isControlledSubstance || b.verifiedByPharmacist))
      .reduce((sum, b) => sum + b.quantityInStock, 0);
  };

  const lowStock = drugs.filter((d) => stockFor(d.id) < d.reorderThreshold);
  const pending = prescriptions.filter((p) => p.approvalStatus === "Pending");
  const today = new Date().toISOString().slice(0, 10);
  const todaysTotal = sales
    .filter((s) => s.saleDate.slice(0, 10) === today)
    .reduce((sum, s) => sum + s.totalAmount, 0);
  const awaitingVerification = batches.filter((b) => b.isControlledSubstance && !b.verifiedByPharmacist && !b.isExpired);

  return (
    <div>
      <PageHeader title={`Welcome back, ${user!.fullName.split(" ")[0]}`} description="Operational snapshot for Adom Community Pharmacy" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Pill} label="Total drugs" value={drugs.length.toString()} />
        <StatCard icon={AlertTriangle} label="Low-stock alerts" value={lowStock.length.toString()} tone={lowStock.length > 0 ? "warn" : undefined} />
        <StatCard icon={ClipboardList} label="Pending prescriptions" value={pending.length.toString()} />
        <StatCard icon={DollarSign} label="Today's sales (GHS)" value={todaysTotal.toFixed(2)} />
      </div>

      {user!.role === "Pharmacist" && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Batches awaiting your verification
            </CardTitle>
          </CardHeader>
          <CardContent>
            {awaitingVerification.length === 0 ? (
              <p className="text-sm text-muted-foreground">All controlled-substance batches are verified.</p>
            ) : (
              <ul className="divide-y">
                {awaitingVerification.map((b) => (
                  <li key={b.id} className="py-2 flex items-center justify-between text-sm">
                    <span>
                      <span className="font-medium">{b.drug?.label}</span>
                      <span className="text-muted-foreground"> · batch {b.batchNumber} · qty {b.quantityInStock}</span>
                    </span>
                    <Badge variant="outline" className="border-amber-500 text-amber-700">Pending Verification</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {lowStock.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Low stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {lowStock.map((d) => (
                <li key={d.id} className="py-2 flex items-center justify-between text-sm">
                  <span className="font-medium">{d.name} <span className="text-muted-foreground font-normal">({d.strength})</span></span>
                  <span className="text-muted-foreground">{stockFor(d.id)} in stock · reorder at {d.reorderThreshold}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof Pill; label: string; value: string; tone?: "warn" }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`text-2xl font-semibold mt-1 ${tone === "warn" ? "text-amber-600" : ""}`}>{value}</p>
          </div>
          <Icon className={`h-5 w-5 ${tone === "warn" ? "text-amber-600" : "text-muted-foreground"}`} />
        </div>
      </CardContent>
    </Card>
  );
}
