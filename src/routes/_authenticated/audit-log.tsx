import { createFileRoute } from "@tanstack/react-router";
import { useAuditLog } from "@/lib/queries";
import { PageHeader } from "@/components/app/AppShell";
import { RefText, refLabel } from "@/components/app/RefText";
import { TableSkeleton } from "@/components/app/TableSkeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/audit-log")({
  component: AuditLogPage,
});

function AuditLogPage() {
  const { data: entries = [], isLoading } = useAuditLog();
  return (
    <div>
      <PageHeader title="Audit Log" description="Every prescription approval, dispensing, and stock verification" />
      <div className="bg-background border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead><TableHead>Staff</TableHead><TableHead>Action</TableHead><TableHead>Reference</TableHead><TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton columns={5} />}
            {!isLoading && entries.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No audit entries yet.</TableCell></TableRow>}
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-sm">{new Date(e.timestamp).toLocaleString()}</TableCell>
                <TableCell className="font-medium"><RefText value={e.staff} /></TableCell>
                <TableCell><Badge variant="outline">{e.actionType}</Badge></TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground"><RefText value={e.reference} max={12} /></TableCell>
                <TableCell className="text-muted-foreground text-sm">{e.notes}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
