/** A migration file must be `<digits>_<name>.sql`. */
const MIGRATION_RE = /^(\d+)_.*\.sql$/;

/**
 * Pure: returns only valid migration filenames, sorted ascending by their
 * numeric prefix (so `010_*` sorts after `002_*`, unlike a lexical sort of the
 * raw strings when widths differ). Non-matching entries are dropped.
 */
export function orderMigrations(files: string[]): string[] {
  return files
    .filter((f) => MIGRATION_RE.test(f))
    .map((f) => {
      const m = MIGRATION_RE.exec(f);
      // m is non-null here because filter already matched the same regex.
      return { file: f, order: Number(m?.[1] ?? '0') };
    })
    .sort((a, b) => a.order - b.order)
    .map((e) => e.file);
}
