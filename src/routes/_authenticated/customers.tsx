import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useCustomers, useApiMutation, qk } from "@/lib/queries";
import { customersApi, type Customer, ApiError } from "@/api";
import { PageHeader } from "@/components/app/AppShell";
import { TableSkeleton } from "@/components/app/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const { user } = useAuth();
  const canEdit = user!.role === "Pharmacist";
  const { data: customers = [], isLoading } = useCustomers();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  return (
    <div>
      <PageHeader title="Customers" description="Customer records maintained by staff" actions={canEdit ? <Button onClick={() => setShowAdd(true)}>Add customer</Button> : undefined} />
      <div className="bg-background border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Address</TableHead>{canEdit && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton columns={canEdit ? 4 : 3} />}
            {!isLoading && customers.length === 0 && <TableRow><TableCell colSpan={canEdit ? 4 : 3} className="text-center text-muted-foreground py-8">No customers yet.</TableCell></TableRow>}
            {customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.fullName}</TableCell>
                <TableCell>{c.phoneNumber}</TableCell>
                <TableCell className="text-muted-foreground">{c.address}</TableCell>
                {canEdit && <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {canEdit && showAdd && <CustomerDialog onClose={() => setShowAdd(false)} />}
      {canEdit && editing && <CustomerDialog customer={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CustomerDialog({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const [form, setForm] = useState({ fullName: customer?.fullName ?? "", phoneNumber: customer?.phoneNumber ?? "", address: customer?.address ?? "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mut = useApiMutation(
    () => customer ? customersApi.update(customer.id, form) : customersApi.create(form),
    {
      invalidate: [qk.customers],
      successMessage: customer ? "Customer updated" : "Customer added",
      onSuccess: () => onClose(),
      onError: (e) => {
        if (e instanceof ApiError && e.isFieldError && e.fieldErrors) setFieldErrors(e.fieldErrors);
      },
    },
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{customer ? "Edit customer" : "Add customer"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FieldRow label="Full name" error={fieldErrors.fullName}><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></FieldRow>
          <FieldRow label="Phone number" error={fieldErrors.phoneNumber}><Input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} /></FieldRow>
          <FieldRow label="Address" error={fieldErrors.address}><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></FieldRow>
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
