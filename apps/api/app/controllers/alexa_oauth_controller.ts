import User from '#models/user'
import ListMember from '#models/list_member'
import type { HttpContext } from '@adonisjs/core/http'
import { alexaOAuthTokenValidator } from '#validators/alexa_oauth'
import { authentikClient } from '#services/alexa/authentik_client'
import type { ListRole } from '#models/list_member'

/** OAuth2 clients authenticate with either HTTP Basic auth or client_id/client_secret in the
 * body — Amazon's account-linking config lets you pick either, so both are accepted. */
function extractClientCredentials(request: HttpContext['request']): {
  clientId?: string
  clientSecret?: string
} {
  const header = request.header('authorization')
  if (header?.startsWith('Basic ')) {
    const [clientId, clientSecret] = Buffer.from(header.slice('Basic '.length), 'base64')
      .toString('utf8')
      .split(':')
    return { clientId, clientSecret }
  }

  return {
    clientId: request.input('client_id'),
    clientSecret: request.input('client_secret'),
  }
}

export default class AlexaOAuthController {
  /**
   * Bridges Alexa's account-linking token exchange to Authentik and, on success, mints a
   * Stage-0 Personal Access Token as the OAuth2 "access token" handed back to Alexa
   * (PLAN_16_PHASE_VOICE_ASSISTANT_INTEGRATION.md Stage 2's account-linking design). This is a public endpoint reached
   * directly by Amazon's servers, not a user's browser.
   *
   * Amazon's account-linking config carries exactly one client id/secret pair, used both to
   * build the `/authorize` redirect straight to Authentik *and* to authenticate this call — so
   * the credential Amazon presents here is the same confidential client EveryList registered
   * with Authentik (`AUTHENTIK_CLIENT_ID`/`SECRET`), not a separate invented pair. Reads
   * `process.env` directly (rather than the validated `#start/env` service) so the "not
   * configured" case is a plain runtime check the test suite can toggle per-call — same
   * convention as `mail_configured.ts`'s SMTP2GO check.
   */
  async token({ request, response, logger }: HttpContext) {
    const { clientId, clientSecret } = extractClientCredentials(request)
    const expectedId = process.env.AUTHENTIK_CLIENT_ID
    if (
      !expectedId ||
      clientId !== expectedId ||
      clientSecret !== process.env.AUTHENTIK_CLIENT_SECRET
    ) {
      logger.warn({ clientId }, 'Alexa OAuth token request had invalid client credentials')
      return response.unauthorized({ error: 'invalid_client' })
    }

    const payload = await request.validateUsing(alexaOAuthTokenValidator)

    let email: string
    try {
      const authentikToken = await authentikClient.exchangeCode(payload.code, payload.redirect_uri)
      email = await authentikClient.fetchEmail(authentikToken)
    } catch (error) {
      // This was previously a bare `catch { ... }` — whatever Authentik
      // rejected the exchange for (expired code, redirect_uri mismatch,
      // Authentik itself down) was indistinguishable from any other cause
      // once it reached this 400, matching the disposable-logging pattern
      // this pass is meant to replace: `authentikClient` now logs the
      // specific HTTP failure itself, but log here too so a failed
      // account-link attempt is visible even if it fails before reaching
      // either of those calls.
      logger.warn({ err: error }, 'Alexa account-link token exchange failed')
      return response.badRequest({ error: 'invalid_grant' })
    }

    const user = await User.query().where('email', email.trim().toLowerCase()).first()
    if (!user) {
      logger.warn(
        { email },
        'Alexa account-link succeeded with Authentik but no matching EveryList user exists'
      )
      return response.badRequest({ error: 'invalid_grant' })
    }

    // Every list the user has accepted membership on, capped at editor — the same ceiling
    // Stage 0's own minting endpoint enforces, applied here directly since this flow mints on
    // the user's behalf rather than through their own explicit list-picker request.
    const memberships = await ListMember.query().where('userId', user.id).whereNotNull('acceptedAt')
    const abilities = memberships.map((membership) => {
      const role: ListRole = membership.role === 'viewer' ? 'viewer' : 'editor'
      return `list:${membership.listId}:${role}`
    })

    const token = await User.personalAccessTokens.create(user, abilities, { name: 'Alexa' })
    logger.debug({ userId: user.id, listCount: abilities.length }, 'Alexa account-link completed')

    return response.ok({ access_token: token.value!.release(), token_type: 'bearer' })
  }
}
