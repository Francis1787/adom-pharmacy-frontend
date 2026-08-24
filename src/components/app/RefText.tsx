// Safe renderer for API reference values that may arrive as a raw string
// or as a { id, label } summary object. Never renders a raw object.

export type RefLike = string | number | { id?: string; label?: string; name?: string; fullName?: string } | null | undefined;

export function refLabel(value: RefLike): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return value.label ?? value.fullName ?? value.name ?? value.id ?? "";
}

export function refId(value: RefLike): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return value.id ?? "";
}

export function truncate(text: string, max = 24) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function RefText({
  value,
  max = 24,
  fallback = "—",
  className,
}: {
  value: RefLike;
  max?: number;
  fallback?: string;
  className?: string;
}) {
  const label = refLabel(value);
  if (!label) return <span className={className}>{fallback}</span>;
  return (
    <span className={className} title={label}>
      {truncate(label, max)}
    </span>
  );
}
