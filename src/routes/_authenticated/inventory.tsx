import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useDrugs, useBatches, useApiMutation, qk } from "@/lib/queries";
import { drugsApi, type Drug, type DosageForm, type CreateDrugRequest, ApiError } from "@/api";
import { PageHeader } from "@/components/app/AppShell";
import { TableSkeleton } from "@/components/app/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/inventory")({
  component: InventoryPage,
});

const DOSAGE_FORMS: DosageForm[] = ["Tablet", "Capsule", "Syrup", "Injection", "Cream", "Other"];

function InventoryPage() {
  const { user } = useAuth();
  const { data: drugs = [], isLoading } = useDrugs();
  const { data: batches = [] } = useBatches();
  const [editing, setEditing] = useState<Drug | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const isAdmin = user!.role === "Admin";
  const canAdd = user!.role === "Technician" || user!.role === "Admin";

  const stockFor = (d: Drug) => {
    if (typeof d.quantityInStock === "number") return d.quantityInStock;
    return batches.filter((b) => b.drug?.id === d.id).reduce((s, b) => s + b.quantityInStock, 0);
  };

  return (
    <div>
      <PageHeader
        title="Drug Inventory"
        description="All drugs stocked at Adom Community Pharmacy"
        actions={canAdd && <Button onClick={() => setShowAdd(true)}>Add drug</Button>}
      />

      <div className="bg-background border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Generic</TableHead>
              <TableHead>Form</TableHead>
              <TableHead>Strength</TableHead>
              <TableHead className="text-right">Price (GHS)</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton columns={8} />}
            {!isLoading && drugs.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No drugs in inventory.</TableCell></TableRow>}
            {drugs.map((d) => {
              const stock = stockFor(d);
              const low = stock < d.reorderThreshold;
              return (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-muted-foreground">{d.genericName}</TableCell>
                  <TableCell>{d.dosageForm}</TableCell>
                  <TableCell>{d.strength}</TableCell>
                  <TableCell className="text-right">{d.unitPrice.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {low ? <Badge variant="destructive">{stock} low</Badge> : stock}
                  </TableCell>
                  <TableCell>
                    {d.isControlledSubstance && <Badge variant="outline" className="border-amber-500 text-amber-700">Controlled</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>Edit</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {showAdd && <AddDrugDialog onClose={() => setShowAdd(false)} isAdmin={isAdmin} />}
      {editing && <EditDrugDialog drug={editing} onClose={() => setEditing(null)} isAdmin={isAdmin} />}
    </div>
  );
}

function AddDrugDialog({ onClose, isAdmin }: { onClose: () => void; isAdmin: boolean }) {
  const [form, setForm] = useState<CreateDrugRequest>({
    name: "",
    genericName: "",
    dosageForm: "Tablet",
    strength: "",
    unitPrice: 0,
    isControlledSubstance: false,
    reorderThreshold: 20,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const create = useApiMutation((data: CreateDrugRequest) => drugsApi.create(data), {
    invalidate: [qk.drugs],
    successMessage: "Drug added",
    onSuccess: () => onClose(),
    onError: (e) => { if (e instanceof ApiError && e.isFieldError && e.fieldErrors) setFieldErrors(e.fieldErrors); },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add new drug</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Name" error={fieldErrors.name}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Generic name" error={fieldErrors.genericName}><Input value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dosage form">
              <Select value={form.dosageForm} onValueChange={(v) => setForm({ ...form, dosageForm: v as DosageForm })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOSAGE_FORMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Strength" error={fieldErrors.strength}><Input value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} placeholder="500mg" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Unit price (GHS)${isAdmin ? "" : " · Admin only"}`} error={fieldErrors.unitPrice}>
              <Input type="number" step="0.01" disabled={!isAdmin} value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })} />
            </Field>
            <Field label="Reorder threshold" error={fieldErrors.reorderThreshold}>
              <Input type="number" value={form.reorderThreshold} onChange={(e) => setForm({ ...form, reorderThreshold: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="flex items-center justify-between pt-2">
            <Label>Controlled substance {isAdmin ? "" : "(Admin only)"}</Label>
            <Switch disabled={!isAdmin} checked={form.isControlledSubstance} onCheckedChange={(v) => setForm({ ...form, isControlledSubstance: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate(form)} loading={create.isPending} disabled={!form.name || !form.genericName}>Add drug</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDrugDialog({ drug, onClose, isAdmin }: { drug: Drug; onClose: () => void; isAdmin: boolean }) {
  const [form, setForm] = useState<Drug>(drug);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      // Basics: name, genericName, form/strength, reorderThreshold
      const basicsChanged =
        form.name !== drug.name ||
        form.genericName !== drug.genericName ||
        form.dosageForm !== drug.dosageForm ||
        form.strength !== drug.strength ||
        form.reorderThreshold !== drug.reorderThreshold;
      if (basicsChanged) {
        await drugsApi.updateBasics(drug.id, {
          name: form.name,
          genericName: form.genericName,
          dosageForm: form.dosageForm,
          strength: form.strength,
          reorderThreshold: form.reorderThreshold,
        });
      }
      if (isAdmin && form.unitPrice !== drug.unitPrice) {
        await drugsApi.updatePrice(drug.id, form.unitPrice);
      }
      if (isAdmin && form.isControlledSubstance !== drug.isControlledSubstance) {
        await drugsApi.updateControlled(drug.id, form.isControlledSubstance);
      }
      const { toast } = await import("sonner");
      toast.success("Drug updated");
      onClose();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit drug</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Generic name"><Input value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dosage form">
              <Select value={form.dosageForm} onValueChange={(v) => setForm({ ...form, dosageForm: v as DosageForm })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOSAGE_FORMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Strength"><Input value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Unit price (GHS)${isAdmin ? "" : " · Admin only"}`}>
              <Input type="number" step="0.01" disabled={!isAdmin} value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })} />
            </Field>
            <Field label="Reorder threshold">
              <Input type="number" value={form.reorderThreshold} onChange={(e) => setForm({ ...form, reorderThreshold: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="flex items-center justify-between pt-2">
            <Label>Controlled substance {isAdmin ? "" : "(Admin only)"}</Label>
            <Switch disabled={!isAdmin} checked={form.isControlledSubstance} onCheckedChange={(v) => setForm({ ...form, isControlledSubstance: v })} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
