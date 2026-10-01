/** Response shape of `GET /api/v1/meta` — describes the running image, not the request. See PLAN_00_FOUNDATIONAL_PLAN.md §8. */
export interface MetaResponse {
  /**
   * The running image's version — the release tag it was built from (`APP_VERSION`), or
   * `develop` for a rolling main-branch build. This is "which release am I running?", which is
   * deliberately *not* the same as the API contract version (see `apiVersion`).
   */
  version: string
  /**
   * The HTTP contract major — the `/api/v1` segment, from the shared `API_VERSION` constant.
   * Only changes if the whole route prefix moves (`/api/v2`), which
   * `foundational/PLAN_34_PHASE_API_VERSIONING.md` reserves for a break that can't be staged as a
   * documented deprecation. See that plan for the additive/breaking policy; the API package's own
   * version (the OpenAPI document's `info.version` and the MCP `serverInfo.version`) is the
   * *granular* API version, bumped only when the API changes.
   */
  apiVersion: string
  commit: string
  builtAt: string
  /** Mirrors the API's `PUBLIC_SIGNUP_ENABLED` env var, so the frontend can hide the
   * self-service signup flow entirely instead of showing a form that then 403s on submit.
   * Invite-token signup is unaffected either way — see NewAccountController. */
  publicSignupEnabled: boolean
}
