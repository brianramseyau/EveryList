/** Response shape of `GET /api/v1/meta` — describes the running image, not the request. See PLAN_00_FOUNDATIONAL_PLAN.md §8. */
export interface MetaResponse {
  version: string
  commit: string
  builtAt: string
  /** Mirrors the API's `PUBLIC_SIGNUP_ENABLED` env var, so the frontend can hide the
   * self-service signup flow entirely instead of showing a form that then 403s on submit.
   * Invite-token signup is unaffected either way — see NewAccountController. */
  publicSignupEnabled: boolean
}
