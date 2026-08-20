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

export interface VersionConflictInfo {
  entity: string
  id: number
  /** The client's optimistic-lock version — always a number in practice, since
   * `hasVersionConflict` is only true when it's defined. */
  expectedVersion: number | undefined
  actualVersion: number
  userId: number
}

/**
 * Emits a `warn`-level record to the container log whenever a write 409s on a
 * version conflict, so the silent-merge path leaves an auditable trail of the
 * exact expected-vs-actual version delta (see PHASE14_PLAN.md). Call it from a
 * controller's `hasVersionConflict(...)` branch just before the 409 response.
 */
export function reportVersionConflict(
  request: HttpContext['request'],
  logger: HttpContext['logger'],
  info: VersionConflictInfo
): void {
  logger.warn(
    {
      entity: info.entity,
      id: info.id,
      expectedVersion: info.expectedVersion,
      actualVersion: info.actualVersion,
      userId: info.userId,
      method: request.method(),
      url: request.url(),
    },
    'version conflict'
  )
}
