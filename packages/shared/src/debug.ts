/** Response shape of `GET /api/v1/debug` — runtime/environment diagnostics for troubleshooting a
 * self-hosted deployment (e.g. confirming which APP_URL a container actually resolved, not just
 * which one its Docker/Unraid config claims). Restricted to user id 1 server-side — see
 * debug_controller.ts. */
export interface DebugResponse {
  app: {
    version: string
    commit: string
    builtAt: string
    nodeEnv: string
    appUrl: string
  }
  runtime: {
    nodeVersion: string
    platform: string
    arch: string
    pid: number
    uptimeSeconds: number
    memoryUsageMb: {
      rss: number
      heapTotal: number
      heapUsed: number
      external: number
    }
  }
  request: {
    hostHeader: string | undefined
    protocol: string
    ip: string
  }
  /** Resolved config values, not raw `process.env` — a fixed allowlist (see debug_controller.ts)
   * so adding an env var to the schema doesn't silently start exposing it here. Secret-valued
   * entries (passwords, client secrets) report `'set'`/`'not set'` rather than their value. */
  env: Record<string, string | number | boolean | null>
}
