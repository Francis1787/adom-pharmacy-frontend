import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePurchaseOrders, useDrugs, useApiMutation, qk } from "@/lib/queries";
import { purchaseOrdersApi, type CreatePurchaseOrderRequest, type CreatePurchaseOrderItem, ApiError } from "@/api";
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
import { X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/purchase-orders")({
  component: POPage,
});

function POPage() {
  const { user } = useAuth();
  const { data: purchaseOrders = [], isLoading } = usePurchaseOrders();
  const [showNew, setShowNew] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const canCreate = user!.role === "Admin";
  const canMark = user!.role === "Admin" || user!.role === "Technician";

  return (
    <div>
      <PageHeader title="Purchase Orders" description="Orders placed with suppliers" actions={canCreate && <Button onClick={() => setShowNew(true)}>New purchase order</Button>} />
      <div className="bg-background border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Order date</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Line items</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton columns={6} />}
            {!isLoading && purchaseOrders.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No purchase orders yet.</TableCell></TableRow>}
            {purchaseOrders.map((po) => (
              <TableRow key={po.id}>
                <TableCell className="font-medium"><RefText value={po.supplier} /></TableCell>
                <TableCell>{po.orderDate}</TableCell>
                <TableCell className={po.isOverdue ? "text-destructive" : ""}>{po.expectedDeliveryDate}{po.isOverdue && " (overdue)"}</TableCell>
                <TableCell>
                  {po.status === "Pending" && <Badge variant="outline" className="border-amber-500 text-amber-700">Pending</Badge>}
                  {po.status === "Received" && <Badge variant="outline" className="border-emerald-500 text-emerald-700">Received</Badge>}
                  {po.status === "Cancelled" && <Badge variant="destructive">Cancelled</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {po.items.map((it, i) => (
                    <div key={i}><RefText value={it.drug} /> × {it.quantityOrdered} @ GHS {Number(it.unitCost ?? 0).toFixed(2)}</div>
                  ))}
                </TableCell>
                <TableCell className="text-right">
                  {canMark && po.status === "Pending" && (
                    <Button size="sm" variant="outline" onClick={() => setMarking(po.id)}>Mark as Arrived</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {showNew && canCreate && <NewPODialog onClose={() => setShowNew(false)} />}
      {marking && <MarkDeliveredDialog id={marking} onClose={() => setMarking(null)} />}
    </div>
  );
}

function MarkDeliveredDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const mut = useApiMutation(() => purchaseOrdersApi.markDelivered(id), {
    invalidate: [qk.purchaseOrders, qk.auditLog],
    successMessage: "Marked as arrived",
    onSuccess: () => onClose(),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Mark order as arrived</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          This records the order as delivered. The arrival date is set by the server.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={mut.isPending} onClick={() => mut.mutate()}>Confirm arrival</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewPODialog({ onClose }: { onClose: () => void }) {
  const { data: drugs = [] } = useDrugs();
  const [form, setForm] = useState<CreatePurchaseOrderRequest>({
    supplier: "",
    expectedDeliveryDate: "",
    items: [{ drugId: "", quantityOrdered: 1, unitCost: 0 }],
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const setItems = (items: CreatePurchaseOrderItem[]) => setForm({ ...form, items });

  const create = useApiMutation((data: CreatePurchaseOrderRequest) => purchaseOrdersApi.create(data), {
    invalidate: [qk.purchaseOrders],
    successMessage: "Purchase order created",
    onSuccess: () => onClose(),
    onError: (e) => { if (e instanceof ApiError && e.isFieldError && e.fieldErrors) setFieldErrors(e.fieldErrors); },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New purchase order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Supplier</Label>
              <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
              {fieldErrors.supplier && <p className="text-xs text-destructive">{fieldErrors.supplier}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expected delivery</Label>
              <Input type="date" value={form.expectedDeliveryDate} onChange={(e) => setForm({ ...form, expectedDeliveryDate: e.target.value })} />
              {fieldErrors.expectedDeliveryDate && <p className="text-xs text-destructive">{fieldErrors.expectedDeliveryDate}</p>}
            </div>
          </div>
          <div>
            <Label className="text-xs">Items</Label>
            <div className="space-y-2 mt-1.5">
              {form.items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_100px_120px_auto] gap-2">
                  <Select value={it.drugId} onValueChange={(v) => setItems(form.items.map((x, j) => j === i ? { ...x, drugId: v } : x))}>
                    <SelectTrigger><SelectValue placeholder="Drug" /></SelectTrigger>
                    <SelectContent>{drugs.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" placeholder="Qty" value={it.quantityOrdered} onChange={(e) => setItems(form.items.map((x, j) => j === i ? { ...x, quantityOrdered: Number(e.target.value) } : x))} />
                  <Input type="number" step="0.01" placeholder="Unit cost" value={it.unitCost} onChange={(e) => setItems(form.items.map((x, j) => j === i ? { ...x, unitCost: Number(e.target.value) } : x))} />
                  <Button size="icon" variant="ghost" onClick={() => setItems(form.items.filter((_, j) => j !== i))} disabled={form.items.length === 1}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setItems([...form.items, { drugId: "", quantityOrdered: 1, unitCost: 0 }])}>Add item</Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={create.isPending}
            disabled={!form.supplier || !form.expectedDeliveryDate || form.items.some((i) => !i.drugId)}
            onClick={() => create.mutate(form)}
          >Create order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
