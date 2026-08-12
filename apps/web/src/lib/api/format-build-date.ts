/** Renders an ISO build timestamp for the Settings footer, falling back to
 * the raw string (e.g. "unknown") when it isn't a parseable date. */
export function formatBuildDate(builtAt: string): string {
	const date = new Date(builtAt);
	if (Number.isNaN(date.getTime())) {
		return builtAt;
	}
	return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
