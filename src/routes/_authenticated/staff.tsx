import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStaff, useApiMutation, qk } from "@/lib/queries";
import { staffApi, type Staff, type Role, type CreateStaffRequest, type CreateStaffResponse, ApiError } from "@/api";
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

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffPage,
});

function StaffPage() {
  const { data: staff = [], isLoading } = useStaff();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  return (
    <div>
      <PageHeader title="Staff" description="Manage staff accounts and access" actions={<Button onClick={() => setShowAdd(true)}>Add staff</Button>} />
      <div className="bg-background border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Email</TableHead><TableHead>Hire date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton columns={6} />}
            {!isLoading && staff.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No staff accounts yet.</TableCell></TableRow>}
            {staff.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.fullName}</TableCell>
                <TableCell>{s.role}</TableCell>
                <TableCell className="text-muted-foreground">{s.email}</TableCell>
                <TableCell>{s.hireDate}</TableCell>
                <TableCell>
                  {s.activeStatus ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                  {s.mustResetPassword && <Badge variant="outline" className="ml-1 border-amber-500 text-amber-700">Reset required</Badge>}
                </TableCell>
                <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Edit</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {showAdd && <StaffDialog onClose={() => setShowAdd(false)} />}
      {editing && <StaffDialog staff={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StaffDialog({ staff, onClose }: { staff?: Staff; onClose: () => void }) {
  const isEdit = !!staff;
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: staff?.fullName ?? "",
    role: (staff?.role ?? "Technician") as Role,
    licenseNumber: staff?.licenseNumber ?? "",
    phoneNumber: staff?.phoneNumber ?? "",
    email: staff?.email ?? "",
    hireDate: staff?.hireDate ?? new Date().toISOString().slice(0, 10),
    activeStatus: staff?.activeStatus ?? true,
    password: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mut = useApiMutation(
    async () => {
      if (isEdit) {
        return staffApi.update(staff!.id, {
          fullName: form.fullName,
          role: form.role,
          licenseNumber: form.licenseNumber || undefined,
          phoneNumber: form.phoneNumber,
          email: form.email,
          hireDate: form.hireDate,
          activeStatus: form.activeStatus,
        });
      }
      const payload: CreateStaffRequest = {
        fullName: form.fullName,
        role: form.role,
        licenseNumber: form.licenseNumber || undefined,
        phoneNumber: form.phoneNumber,
        email: form.email,
        password: form.password,
        mustResetPassword: true,
        hireDate: form.hireDate,
        activeStatus: form.activeStatus,
      };
      return staffApi.create(payload);
    },
    {
      invalidate: [qk.staff],
      successMessage: isEdit ? "Staff updated" : "Staff added",
      onSuccess: (res) => {
        const temp = (res as CreateStaffResponse | Staff | undefined) as CreateStaffResponse | undefined;
        if (!isEdit && temp && typeof temp.tempPassword === "string") {
          setTempPassword(temp.tempPassword);
          return;
        }
        onClose();
      },
      onError: (e) => { if (e instanceof ApiError && e.isFieldError && e.fieldErrors) setFieldErrors(e.fieldErrors); },
    },
  );

  if (tempPassword) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader><DialogTitle>Staff account created</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Share this temporary password with {form.fullName}. It is shown once and must be reset on first login.
            </p>
            <div className="rounded-md border bg-muted px-3 py-2 font-mono text-sm select-all">{tempPassword}</div>
          </div>
          <DialogFooter>
            <Button onClick={() => { navigator.clipboard?.writeText(tempPassword); }} variant="outline">Copy</Button>
            <Button onClick={onClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Edit staff" : "Add staff"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <F label="Full name" error={fieldErrors.fullName}><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Role">
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pharmacist">Pharmacist</SelectItem>
                  <SelectItem value="Technician">Technician</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </F>
            <F label="Hire date" error={fieldErrors.hireDate}><Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} /></F>
          </div>
          {form.role === "Pharmacist" && (
            <F label="License number" error={fieldErrors.licenseNumber}>
              <Input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
            </F>
          )}
          <div className="grid grid-cols-2 gap-3">
            <F label="Phone" error={fieldErrors.phoneNumber}><Input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} /></F>
            <F label="Email" error={fieldErrors.email}><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></F>
          </div>
          {!isEdit && (
            <F label="Temporary password" error={fieldErrors.password}>
              <div className="flex gap-2">
                <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Enter or generate" />
                <Button type="button" variant="outline" onClick={() => setForm({ ...form, password: staffApi.generatePassword() })}>Generate</Button>
              </div>
              <p className="text-xs text-muted-foreground">Staff member will be forced to reset this on first login.</p>
            </F>
          )}
          <div className="flex items-center justify-between pt-2">
            <Label>Active</Label>
            <Switch checked={form.activeStatus} onCheckedChange={(v) => setForm({ ...form, activeStatus: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={mut.isPending}
            disabled={!form.fullName || !form.email || (!isEdit && !form.password)}
            onClick={() => mut.mutate()}
          >Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
