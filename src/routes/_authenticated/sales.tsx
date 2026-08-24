import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useSales, usePrescriptions, useDrugs, useBatches, useApiMutation, qk } from "@/lib/queries";
import { salesApi, PAYMENT_LABEL, type PaymentMethod, type CreateSaleItem, type CreateSaleRequest, ApiError } from "@/api";
import { PageHeader } from "@/components/app/AppShell";
import { RefText, refLabel } from "@/components/app/RefText";
import { TableSkeleton } from "@/components/app/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesPage,
});

function SalesPage() {
  const { user } = useAuth();
  const { data: sales = [], isLoading } = useSales();
  const [showNew, setShowNew] = useState(false);
  const canCreate = user!.role === "Pharmacist";

  return (
    <div>
      <PageHeader title="Sales" description="Every dispensed prescription is recorded here" actions={canCreate && <Button onClick={() => setShowNew(true)}>New sale</Button>} />
      <div className="bg-background border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead><TableHead>Prescription</TableHead><TableHead>Cashier</TableHead><TableHead>Dispensing pharmacist</TableHead><TableHead>Payment</TableHead><TableHead className="text-right">Total (GHS)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton columns={6} />}
            {!isLoading && sales.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No sales yet.</TableCell></TableRow>}
            {sales.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{new Date(s.saleDate).toLocaleString()}</TableCell>
                <TableCell className="font-medium"><RefText value={s.prescription} max={24} /></TableCell>
                <TableCell><RefText value={s.cashier} /></TableCell>
                <TableCell><RefText value={s.dispensingPharmacist} /></TableCell>
                <TableCell>{PAYMENT_LABEL[s.paymentMethod]}</TableCell>
                <TableCell className="text-right font-medium">{s.totalAmount.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {showNew && canCreate && <NewSaleDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewSaleDialog({ onClose }: { onClose: () => void }) {
  const { data: prescriptions = [] } = usePrescriptions();
  const { data: drugs = [] } = useDrugs();
  const { data: batches = [] } = useBatches();

  const available = useMemo(
    () => prescriptions.filter((p) => p.approvalStatus === "Approved" && !p.sold),
    [prescriptions],
  );

  const [prescriptionId, setRx] = useState<string>(available[0]?.id ?? "");
  const [paymentMethod, setPayment] = useState<PaymentMethod>("Cash");
  const [itemBatches, setItemBatches] = useState<Record<string, string>>({});

  const rx = prescriptions.find((p) => p.id === prescriptionId);

  const sellableBatchesFor = (drugId: string) =>
    batches.filter(
      (b) => b.drug?.id === drugId && !b.isExpired && b.quantityInStock > 0 &&
        (!b.isControlledSubstance || b.verifiedByPharmacist),
    );

  const create = useApiMutation((data: CreateSaleRequest) => salesApi.create(data), {
    invalidate: [qk.sales, qk.prescriptions, qk.batches, qk.drugs, qk.auditLog],
    successMessage: "Sale completed",
    onSuccess: () => onClose(),
  });

  const submit = () => {
    if (!rx) return;
    const items: CreateSaleItem[] = rx.items.map((it) => ({
      drugId: it.drug.id,
      batchId: itemBatches[it.drug.id] ?? "",
      quantity: it.quantityPrescribed,
    }));
    if (items.some((it) => !it.batchId)) return;
    create.mutate({ prescriptionId, paymentMethod, items });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New sale</DialogTitle></DialogHeader>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">No approved, unsold prescriptions available.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Approved prescription</Label>
              <Select value={prescriptionId} onValueChange={setRx}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {available.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{refLabel(p.customer)} · {p.dateIssued}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {rx && (
              <div className="rounded-md border p-3 text-sm space-y-3">
                {rx.items.map((it, i) => {
                  const options = sellableBatchesFor(it.drug.id);
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{refLabel(it.drug)}</span>
                        <span className="text-muted-foreground">× {it.quantityPrescribed}</span>
                      </div>
                      <Select value={itemBatches[it.drug.id] ?? ""} onValueChange={(v) => setItemBatches({ ...itemBatches, [it.drug.id]: v })}>
                        <SelectTrigger><SelectValue placeholder={options.length ? "Select batch" : "No sellable batch available"} /></SelectTrigger>
                        <SelectContent>
                          {options.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.batchNumber} · exp {b.expiryDate} · qty {b.quantityInStock}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground pt-1 border-t">Total is computed server-side from each drug's current unit price.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Payment method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPayment(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="MobileMoney">Mobile Money</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={create.isPending}
            disabled={
              !rx ||
              rx.items.some((it) => !itemBatches[it.drug.id])
            }
            onClick={submit}
          >Complete sale</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
