/** Response shape of `GET /api/v1/ping` — a liveness probe with no auth and no
 * cache, used by the frontend connectivity check (see PHASE14_PLAN.md). */
export interface PingResponse {
  pong: true
}
