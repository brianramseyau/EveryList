import logger from '@adonisjs/core/services/logger'

/** Reads `process.env` directly (rather than the validated `#start/env` service) so the test
 * suite can toggle these per-call — same convention as `mail_configured.ts`'s SMTP2GO check. */
function requiredEnv(
  name:
    | 'AUTHENTIK_TOKEN_URL'
    | 'AUTHENTIK_USERINFO_URL'
    | 'AUTHENTIK_CLIENT_ID'
    | 'AUTHENTIK_CLIENT_SECRET'
): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

/**
 * Bridges Alexa's account-linking "Access Token URI" call to Authentik, the household's existing
 * IdP (PLAN_16_PHASE_VOICE_ASSISTANT_INTEGRATION.md Stage 2 — Authentik is a hard requirement, not one OIDC provider among
 * several). Exported as a plain object, not called directly from the controller, so functional
 * tests can monkey-patch both methods instead of reaching a real Authentik instance over the
 * network — mirroring `signature_verifier.ts`'s seam for `alexa-verifier`.
 */
export const authentikClient = {
  /** Exchanges the authorization code Amazon received from Authentik's own `/authorize` for an
   * Authentik access token, authenticating as EveryList's own confidential OAuth2 client
   * (`AUTHENTIK_CLIENT_ID`/`SECRET`, registered in Authentik for this purpose — a different
   * client than the one Amazon presents to `alexa_oauth_controller.ts`). `redirectUri` must be
   * byte-identical to the one used in the original `/authorize` redirect (Alexa's own callback
   * URL) or Authentik will reject the exchange. */
  async exchangeCode(code: string, redirectUri: string): Promise<string> {
    const tokenUrl = requiredEnv('AUTHENTIK_TOKEN_URL')
    logger.debug({ tokenUrl, redirectUri }, 'exchanging Alexa account-link code with Authentik')

    // Never log `code` or the response body — the code is a one-time-use
    // authorization grant and the body carries the access token itself.
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: requiredEnv('AUTHENTIK_CLIENT_ID'),
        client_secret: requiredEnv('AUTHENTIK_CLIENT_SECRET'),
      }),
    })

    if (!response.ok) {
      logger.warn(
        { tokenUrl, status: response.status },
        'Authentik token exchange rejected the request'
      )
      throw new Error(`Authentik token exchange failed: ${response.status}`)
    }

    const body = (await response.json()) as { access_token?: string }
    if (!body.access_token) {
      logger.warn({ tokenUrl }, 'Authentik token response had no access_token')
      throw new Error('Authentik token response had no access_token')
    }
    return body.access_token
  },

  /** Resolves the linked EveryList account's email via Authentik's userinfo endpoint — calling
   * this directly (rather than decoding the id_token ourselves) means this endpoint never has to
   * verify a JWT signature against Authentik's JWKS: the access token only has any value at all
   * if Authentik itself will vouch for it right now. */
  async fetchEmail(authentikAccessToken: string): Promise<string> {
    const userinfoUrl = requiredEnv('AUTHENTIK_USERINFO_URL')
    logger.debug({ userinfoUrl }, 'fetching Alexa account-link user email from Authentik')

    const response = await fetch(userinfoUrl, {
      headers: { Authorization: `Bearer ${authentikAccessToken}` },
    })

    if (!response.ok) {
      logger.warn({ userinfoUrl, status: response.status }, 'Authentik userinfo request failed')
      throw new Error(`Authentik userinfo request failed: ${response.status}`)
    }

    const body = (await response.json()) as { email?: string }
    if (!body.email) {
      logger.warn({ userinfoUrl }, 'Authentik userinfo response had no email')
      throw new Error('Authentik userinfo response had no email')
    }
    return body.email
  },
}
