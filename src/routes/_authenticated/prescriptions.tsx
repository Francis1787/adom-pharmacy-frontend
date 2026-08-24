import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePrescriptions, useCustomers, useDoctors, useDrugs, useApiMutation, qk } from "@/lib/queries";
import { prescriptionsApi, type CreatePrescriptionRequest, type CreatePrescriptionItem, ApiError } from "@/api";
import { PageHeader } from "@/components/app/AppShell";
import { RefText, refLabel } from "@/components/app/RefText";
import { TableSkeleton } from "@/components/app/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/prescriptions")({
  component: PrescriptionsPage,
});

function PrescriptionsPage() {
  const { user } = useAuth();
  const { data: prescriptions = [], isLoading } = usePrescriptions();
  const [showNew, setShowNew] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const canCreate = user!.role === "Technician" || user!.role === "Pharmacist";
  const canApprove = user!.role === "Pharmacist";

  const approve = useApiMutation((id: string) => prescriptionsApi.approve(id), {
    invalidate: [qk.prescriptions, qk.auditLog],
    successMessage: "Prescription approved",
  });

  return (
    <div>
      <PageHeader
        title="Prescriptions"
        description="Prescriptions received, awaiting approval, and completed"
        actions={canCreate && <Button onClick={() => setShowNew(true)}>New prescription</Button>}
      />
      <div className="bg-background border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Doctor</TableHead>
              <TableHead>Date issued</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Approving pharmacist</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton columns={6} />}
            {!isLoading && prescriptions.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No prescriptions yet.</TableCell></TableRow>}
            {prescriptions.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium"><RefText value={p.customer} /></TableCell>
                <TableCell><RefText value={p.doctor} /></TableCell>
                <TableCell>{p.dateIssued}</TableCell>
                <TableCell>
                  {p.approvalStatus === "Approved" && <Badge variant="outline" className="border-emerald-500 text-emerald-700">Approved{p.sold ? " · dispensed" : ""}</Badge>}
                  {p.approvalStatus === "Pending" && <Badge variant="outline" className="border-amber-500 text-amber-700">Pending</Badge>}
                  {p.approvalStatus === "Rejected" && <Badge variant="destructive">Rejected</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground"><RefText value={p.approvingPharmacist} /></TableCell>
                <TableCell className="text-right space-x-1">
                  {canApprove && p.approvalStatus === "Pending" && (
                    <>
                      <Button size="sm" onClick={() => approve.mutate(p.id)} loading={approve.isPending && approve.variables === p.id}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => setRejecting(p.id)}>Reject</Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {showNew && <NewPrescriptionDialog onClose={() => setShowNew(false)} />}
      {rejecting && <RejectDialog id={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  );
}

function RejectDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const reject = useApiMutation(() => prescriptionsApi.reject(id, reason), {
    invalidate: [qk.prescriptions, qk.auditLog],
    successMessage: "Prescription rejected",
    onSuccess: () => onClose(),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reject prescription</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">Reason (required)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Explain why this prescription is being rejected" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={!reason.trim()} loading={reject.isPending} onClick={() => reject.mutate()}>Reject</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewPrescriptionDialog({ onClose }: { onClose: () => void }) {
  const { data: customers = [] } = useCustomers();
  const { data: doctors = [] } = useDoctors();
  const { data: drugs = [] } = useDrugs();
  const [form, setForm] = useState<CreatePrescriptionRequest>({
    customerId: "",
    doctorId: "",
    dateIssued: new Date().toISOString().slice(0, 10),
    notes: "",
    items: [{ drugId: "", dosageInstructions: "", quantityPrescribed: 1 }],
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const create = useApiMutation((data: CreatePrescriptionRequest) => prescriptionsApi.create(data), {
    invalidate: [qk.prescriptions],
    successMessage: "Prescription created",
    onSuccess: () => onClose(),
    onError: (e) => { if (e instanceof ApiError && e.isFieldError && e.fieldErrors) setFieldErrors(e.fieldErrors); },
  });

  const setItems = (items: CreatePrescriptionItem[]) => setForm({ ...form, items });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New prescription</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer" error={fieldErrors.customerId}>
              <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Doctor" error={fieldErrors.doctorId}>
              <Select value={form.doctorId} onValueChange={(v) => setForm({ ...form, doctorId: v })}>
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>{doctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.fullName}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Date issued" error={fieldErrors.dateIssued}><Input type="date" value={form.dateIssued} onChange={(e) => setForm({ ...form, dateIssued: e.target.value })} /></Field>
          <div>
            <Label className="text-xs">Items</Label>
            <div className="space-y-2 mt-1.5">
              {form.items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_80px_auto] gap-2 items-start">
                  <Select value={it.drugId} onValueChange={(v) => setItems(form.items.map((x, j) => j === i ? { ...x, drugId: v } : x))}>
                    <SelectTrigger><SelectValue placeholder="Drug" /></SelectTrigger>
                    <SelectContent>{drugs.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} · {d.strength}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input placeholder="Dosage instructions" value={it.dosageInstructions} onChange={(e) => setItems(form.items.map((x, j) => j === i ? { ...x, dosageInstructions: e.target.value } : x))} />
                  <Input type="number" min={1} value={it.quantityPrescribed} onChange={(e) => setItems(form.items.map((x, j) => j === i ? { ...x, quantityPrescribed: Number(e.target.value) } : x))} />
                  <Button size="icon" variant="ghost" onClick={() => setItems(form.items.filter((_, j) => j !== i))} disabled={form.items.length === 1}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setItems([...form.items, { drugId: "", dosageInstructions: "", quantityPrescribed: 1 }])}>Add item</Button>
            </div>
          </div>
          <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => create.mutate(form)}
            disabled={create.isPending || !form.customerId || !form.doctorId || form.items.some((it) => !it.drugId)}
          >Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}{error && <p className="text-xs text-destructive">{error}</p>}</div>;
}
