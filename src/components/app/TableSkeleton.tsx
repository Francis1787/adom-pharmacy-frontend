import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

/** Consistent placeholder rows matching the real table's column structure. */
export function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r} className="pointer-events-none">
          {Array.from({ length: columns }).map((__, c) => (
            <TableCell key={c} className="py-3">
              <Skeleton className="h-4 w-full max-w-[160px]" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
