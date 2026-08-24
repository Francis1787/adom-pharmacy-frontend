import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useDoctors, useApiMutation, qk } from "@/lib/queries";
import { doctorsApi, type Doctor, ApiError } from "@/api";
import { PageHeader } from "@/components/app/AppShell";
import { TableSkeleton } from "@/components/app/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/doctors")({
  component: DoctorsPage,
});

function DoctorsPage() {
  const { user } = useAuth();
  const canEdit = user!.role === "Pharmacist";
  const { data: doctors = [], isLoading } = useDoctors();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  return (
    <div>
      <PageHeader title="Doctors" description="Prescribing doctors on file" actions={canEdit ? <Button onClick={() => setShowAdd(true)}>Add doctor</Button> : undefined} />
      <div className="bg-background border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>License #</TableHead><TableHead>Contact</TableHead>{canEdit && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton columns={canEdit ? 4 : 3} />}
            {!isLoading && doctors.length === 0 && <TableRow><TableCell colSpan={canEdit ? 4 : 3} className="text-center text-muted-foreground py-8">No doctors yet.</TableCell></TableRow>}
            {doctors.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.fullName}</TableCell>
                <TableCell>{d.licenseNumber}</TableCell>
                <TableCell className="text-muted-foreground">{d.contactInfo}</TableCell>
                {canEdit && <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(d)}>Edit</Button></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {canEdit && showAdd && <DoctorDialog onClose={() => setShowAdd(false)} />}
      {canEdit && editing && <DoctorDialog doctor={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DoctorDialog({ doctor, onClose }: { doctor?: Doctor; onClose: () => void }) {
  const [form, setForm] = useState({ fullName: doctor?.fullName ?? "", licenseNumber: doctor?.licenseNumber ?? "", contactInfo: doctor?.contactInfo ?? "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const mut = useApiMutation(
    () => doctor ? doctorsApi.update(doctor.id, form) : doctorsApi.create(form),
    {
      invalidate: [qk.doctors],
      successMessage: doctor ? "Doctor updated" : "Doctor added",
      onSuccess: () => onClose(),
      onError: (e) => { if (e instanceof ApiError && e.isFieldError && e.fieldErrors) setFieldErrors(e.fieldErrors); },
    },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{doctor ? "Edit doctor" : "Add doctor"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FieldRow label="Full name" error={fieldErrors.fullName}><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></FieldRow>
          <FieldRow label="License number" error={fieldErrors.licenseNumber}><Input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} /></FieldRow>
          <FieldRow label="Contact info" error={fieldErrors.contactInfo}><Input value={form.contactInfo} onChange={(e) => setForm({ ...form, contactInfo: e.target.value })} /></FieldRow>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} loading={mut.isPending} disabled={!form.fullName}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
