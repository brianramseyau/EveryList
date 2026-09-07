/**
 * Longest a deadline notification's body (the item's notes) is shown before being
 * truncated with an ellipsis — a conservative cut well under any platform's own
 * notification-body limit, so the truncation is ours and consistent rather than an
 * OS-specific mid-word cutoff. Shared by the API (Web Push) and the web client
 * (native/Electron local notifications) so both platforms agree on the same cut.
 */
const MAX_BODY_LENGTH = 150

/**
 * Truncates `notes` for use as a deadline notification's body, or '' when there are
 * none — an empty string collapses to no second line rather than a blank one. Slices
 * by Unicode code point (`Array.from`, not `string.slice`) so a surrogate-pair
 * character (an emoji, say) right at the cut point is dropped whole rather than
 * split into an unpaired half.
 */
export function notificationBody(notes: string | null): string {
  if (!notes) return ''
  const codePoints = Array.from(notes)
  if (codePoints.length <= MAX_BODY_LENGTH) return notes
  return `${codePoints.slice(0, MAX_BODY_LENGTH - 1).join('')}…`
}
