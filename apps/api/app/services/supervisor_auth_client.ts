import logger from '@adonisjs/core/services/logger'

/**
 * Thrown when Supervisor's `auth_api` can't be reached or reports something other than a plain
 * valid/invalid-credentials result (e.g. this isn't actually running under Supervisor, or
 * Supervisor itself is unreachable) — callers should surface this as "Home Assistant sign-in is
 * not available right now", distinct from "wrong password".
 */
export class SupervisorAuthUnavailableError extends Error {}

/** A hung Supervisor (rather than one that responds with an error) shouldn't stall a login
 *  request indefinitely — same reasoning as any other outbound call on a request path a user is
 *  actively waiting on. */
const SUPERVISOR_AUTH_TIMEOUT_MS = 5_000

/**
 * Validates a submitted username/password against Home Assistant's own user accounts via
 * Supervisor's internal `auth_api` (`ha-addon/everylist/config.yaml`'s `auth_api: true` — the
 * same flag `addon-adguard-home` sets for its own "sign in with Home Assistant" form). Exported as
 * a plain object, not called directly from the controller, so functional tests can monkey-patch it
 * instead of reaching a real Supervisor over the network — mirroring
 * `services/alexa/authentik_client.ts`'s seam.
 *
 * Wire format confirmed against Home Assistant's own developer docs
 * (developers.home-assistant.io/docs/api/supervisor/endpoints — the `/auth` endpoint), not
 * guessed: `POST http://supervisor/auth`, Supervisor authenticates the *caller* (this add-on) via
 * the `X-Supervisor-Token` header (not `Authorization: Bearer` — that's for authenticating the
 * submitted user credentials in the Basic-auth variant this client doesn't use), and accepts the
 * credentials being validated as a JSON body (`{ username, password }`). See
 * PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md.
 */
export const supervisorAuthClient = {
  /**
   * `SUPERVISOR_TOKEN` is injected directly into the container by Supervisor itself (not routed
   * through `/data/options.json` or this app's own `#start/env` schema, unlike `APP_URL`/`APP_KEY`
   * — see `docker/root/etc/cont-init.d/05-ha-options`) — reading `process.env` directly here is
   * correct, not a shortcut around validation. Absent on every non-Supervisor deployment.
   */
  async validateCredentials(username: string, password: string): Promise<boolean> {
    const token = process.env.SUPERVISOR_TOKEN
    if (!token) {
      throw new SupervisorAuthUnavailableError('SUPERVISOR_TOKEN is not set')
    }

    let response: Response
    try {
      response = await fetch('http://supervisor/auth', {
        method: 'POST',
        headers: {
          'X-Supervisor-Token': token,
          'Content-Type': 'application/json',
        },
        // Never log `password` — same reasoning as authentik_client.ts never logging an
        // authorization code or access token.
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(SUPERVISOR_AUTH_TIMEOUT_MS),
      })
    } catch (error) {
      logger.warn({ err: error }, 'Supervisor auth_api request failed')
      throw new SupervisorAuthUnavailableError('Supervisor auth_api request failed')
    }

    if (response.ok) return true
    if (response.status === 401) return false

    logger.warn({ status: response.status }, 'Supervisor auth_api returned an unexpected status')
    throw new SupervisorAuthUnavailableError(`Supervisor auth_api returned ${response.status}`)
  },
}
