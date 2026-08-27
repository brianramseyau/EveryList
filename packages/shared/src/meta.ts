/** Response shape of `GET /api/v1/meta` — describes the running image, not the request. See PLAN_00_FOUNDATIONAL_PLAN.md §8. */
export interface MetaResponse {
  version: string
  commit: string
  builtAt: string
}
