/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // Auth — when false, blocks new self-service signups while leaving
  // list-invite signups (which carry a valid invite token) unaffected.
  // Defaults to enabled.
  PUBLIC_SIGNUP_ENABLED: Env.schema.boolean.optional(),

  // Outbound email (SMTP2GO) — optional: unset in local dev, so the app
  // boots with no config and email export simply reports "not configured"
  // rather than failing to start (see PLAN.md's zero-config startup rule).
  SMTP2GO_HOST: Env.schema.string.optional(),
  SMTP2GO_PORT: Env.schema.number.optional(),
  SMTP2GO_USERNAME: Env.schema.string.optional(),
  SMTP2GO_PASSWORD: Env.schema.string.optional(),
  SMTP2GO_FROM_ADDRESS: Env.schema.string.optional(),
  SMTP2GO_FROM_NAME: Env.schema.string.optional(),

  // Build/image metadata (baked in by docker/Dockerfile at build time — see
  // GET /api/v1/meta and PLAN.md §8). Absent in local dev, hence optional.
  APP_VERSION: Env.schema.string.optional(),
  GIT_SHA: Env.schema.string.optional(),
  BUILD_DATE: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the limiter package
  |----------------------------------------------------------
  */
  LIMITER_STORE: Env.schema.enum(['database', 'memory'] as const),

  // Alexa custom skill (PHASE16_PLAN.md Stage 2) — all optional: the skill
  // endpoint responds with "link your account" until account linking is
  // configured, and app/ boots with no Alexa config at all otherwise (see
  // PLAN.md's zero-config startup rule).
  //
  // The skill's own Alexa developer-console application id, checked against
  // every request as a defense-in-depth measure alongside signature
  // verification (skips the check when unset).
  ALEXA_SKILL_ID: Env.schema.string.optional(),
  // Authentik's OAuth2/OIDC endpoints and the confidential client EveryList
  // registers with it for account linking — used both for the server-side
  // half of the exchange (app/services/alexa/authentik_client.ts) and to
  // authenticate Amazon's own call to our token-bridge endpoint
  // (alexa_oauth_controller.ts): Alexa's account-linking config carries only
  // one client id/secret pair, presented at both the `/authorize` redirect
  // straight to Authentik and the "Access Token URI" call to us, so it must
  // be this same Authentik-registered client rather than a second invented
  // one — see alexa/README.md.
  AUTHENTIK_TOKEN_URL: Env.schema.string.optional(),
  AUTHENTIK_USERINFO_URL: Env.schema.string.optional(),
  AUTHENTIK_CLIENT_ID: Env.schema.string.optional(),
  AUTHENTIK_CLIENT_SECRET: Env.schema.string.optional(),
})
