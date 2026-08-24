import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useBatches, useDrugs, usePurchaseOrders, useApiMutation, qk } from "@/lib/queries";
import { batchesApi, type CreateBatchRequest } from "@/api";
import { PageHeader } from "@/components/app/AppShell";
import { RefText, refLabel } from "@/components/app/RefText";
import { TableSkeleton } from "@/components/app/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/batches")({
  component: BatchesPage,
});

function BatchesPage() {
  const { user } = useAuth();
  const { data: batches = [], isLoading } = useBatches();
  const [showAdd, setShowAdd] = useState(false);

  const canLog = user!.role === "Technician" || user!.role === "Pharmacist";
  const canVerify = user!.role === "Pharmacist";

  const verify = useApiMutation((id: string) => batchesApi.verify(id), {
    invalidate: [qk.batches, qk.auditLog],
    successMessage: "Batch verified",
  });

  return (
    <div>
      <PageHeader
        title="Batches & Stock Receiving"
        description="Track each delivered batch and verification status"
        actions={canLog && <Button onClick={() => setShowAdd(true)}>Log new delivery</Button>}
      />
      <div className="bg-background border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Drug</TableHead>
              <TableHead>Batch #</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton columns={7} />}
            {!isLoading && batches.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No batches recorded yet.</TableCell></TableRow>}
            {batches.map((b) => {
              const needsVerification = b.isControlledSubstance && !b.verifiedByPharmacist;
              return (
                <TableRow key={b.id}>
                  <TableCell className="font-medium"><RefText value={b.drug} /></TableCell>
                  <TableCell>{b.batchNumber}</TableCell>
                  <TableCell className="text-right">{b.quantityInStock}</TableCell>
                  <TableCell className={b.isExpired ? "text-destructive" : ""}>{b.expiryDate}{b.isExpired && " (expired)"}</TableCell>
                  <TableCell><RefText value={b.supplier} /></TableCell>
                  <TableCell>
                    {b.isExpired ? (
                      <Badge variant="destructive">Expired</Badge>
                    ) : needsVerification ? (
                      <Badge variant="outline" className="border-amber-500 text-amber-700">Pending Verification</Badge>
                    ) : b.isControlledSubstance ? (
                      <Badge variant="outline" className="border-emerald-500 text-emerald-700">Verified</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canVerify && needsVerification && !b.isExpired && (
                      <Button size="sm" onClick={() => verify.mutate(b.id)} loading={verify.isPending && verify.variables === b.id}>Verify</Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {showAdd && <LogDeliveryDialog onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function LogDeliveryDialog({ onClose }: { onClose: () => void }) {
  const { data: drugs = [] } = useDrugs();
  const { data: purchaseOrders = [] } = usePurchaseOrders();
  const [form, setForm] = useState<CreateBatchRequest>({
    drugId: drugs[0]?.id ?? "",
    batchNumber: "",
    quantityInStock: 0,
    expiryDate: "",
    supplier: "",
    purchaseOrderItemId: null,
  });

  const create = useApiMutation((data: CreateBatchRequest) => batchesApi.create(data), {
    invalidate: [qk.batches, qk.drugs, qk.auditLog],
    successMessage: "Delivery logged",
    onSuccess: () => onClose(),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Log new delivery</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Drug">
            <Select value={form.drugId} onValueChange={(v) => setForm({ ...form, drugId: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{drugs.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} · {d.strength}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Batch number"><Input value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} /></Field>
            <Field label="Quantity"><Input type="number" value={form.quantityInStock} onChange={(e) => setForm({ ...form, quantityInStock: Number(e.target.value) })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expiry date"><Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></Field>
            <Field label="Supplier"><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></Field>
          </div>
          <Field label="Link to purchase order (optional)">
            <Select value={form.purchaseOrderItemId || "none"} onValueChange={(v) => setForm({ ...form, purchaseOrderItemId: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {purchaseOrders.map((po) => <SelectItem key={po.id} value={po.id}>{refLabel(po.supplier)} · {po.orderDate}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => create.mutate(form)}
            loading={create.isPending}
            disabled={!form.drugId || !form.batchNumber || !form.expiryDate || form.quantityInStock <= 0}
          >Log delivery</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
