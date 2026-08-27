/** Response shape of `GET /api/v1/ping` — a liveness probe with no auth and no
 * cache, used by the frontend connectivity check (see PLAN_14_PHASE_SYNC_STATUS_OBSERVABILITY.md). */
export interface PingResponse {
  pong: true
}
