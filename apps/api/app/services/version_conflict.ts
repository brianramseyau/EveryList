import type { HttpContext } from '@adonisjs/core/http'

export interface VersionedRow {
  version: number
}

/**
 * True when the client sent an `expectedVersion` and it no longer matches
 * the row's current version — the offline sync queue's optimistic-locking
 * check, see PLAN.md §7 and PHASE5_PLAN.md §1.
 */
export function hasVersionConflict(row: VersionedRow, expectedVersion?: number): boolean {
  return expectedVersion !== undefined && row.version !== expectedVersion
}

/**
 * `destroy` actions have no VineJS-validated body today, so `expectedVersion`
 * is read directly off the request (works for either a JSON body or a query
 * string param) rather than through a validator.
 */
export function parseExpectedVersion(request: HttpContext['request']): number | undefined {
  const raw = request.input('expectedVersion')
  return raw === undefined || raw === null ? undefined : Number(raw)
}
