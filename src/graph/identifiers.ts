export function createUniqueId(value: string, existingIds: Iterable<string>, fallback = "item") {
  const base = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || fallback;
  const ids = new Set(existingIds);
  let id = base;
  let suffix = 2;
  while (ids.has(id)) id = `${base.slice(0, 60 - String(suffix).length)}-${String(suffix++)}`;
  return id;
}
