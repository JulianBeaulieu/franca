/**
 * COURSES_DIR_PATH may be a single directory or a colon-separated list of
 * directories (PATH-style), e.g. `/app/courses:/data/courses`. Each existing
 * directory is scanned; later directories may ADD courses, and on a duplicate
 * course code the LAST directory wins — so a user-mounted courses dir overrides
 * the courses baked into the published image.
 *
 * Pure: splits on ':', trims entries, drops empties. Order is preserved so the
 * caller can apply last-wins semantics.
 */
export function parseCoursesDirs(value: string): string[] {
  return value
    .split(':')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
