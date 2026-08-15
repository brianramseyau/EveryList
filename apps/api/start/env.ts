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
})
