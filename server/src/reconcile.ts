/**
 * Last-write-wins decision, isolated + pure so it's easy to test.
 * A push is accepted when there's no current row, or when the incoming edit
 * time is not older than the stored one (ties go to the writer).
 */
export function shouldAccept(
  current: { updatedAt: number } | undefined,
  incomingUpdatedAt: number,
): boolean {
  if (!current) return true;
  return incomingUpdatedAt >= current.updatedAt;
}
