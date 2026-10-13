/**
 * Parse a comma-separated id list from a query parameter: undefined if the parameter is absent, otherwise the
 * set of non-empty, trimmed, de-duplicated ids - which is empty for `?ids=` and for `?ids=,,`.
 *
 * "Absent" and "present but empty" mean different things to a filter and must stay different: no filter at all
 * versus restrict to nobody. A rivals-only view for a player with no rivals sends the second, and treating it
 * as the first would show them everyone's activity. The check is therefore `=== undefined`, never truthiness,
 * since an empty string is falsy.
 */
export function parseIdFilter(raw: string | undefined): Set<string> | undefined {
  if (raw === undefined) return undefined;
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}
