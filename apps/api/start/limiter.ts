/*
|--------------------------------------------------------------------------
| Define HTTP limiters
|--------------------------------------------------------------------------
|
| The "limiter.define" method creates an HTTP middleware to apply rate
| limits on a route or a group of routes. Feel free to define as many
| throttle middleware as needed.
|
*/

import limiter from '@adonisjs/limiter/services/main'
import app from '@adonisjs/core/services/app'

/**
 * Applied to the `auth` route group (signup/login/forgot-password/reset-password) —
 * the only endpoints on the whole API that don't require a token, which makes them
 * the actual brute-force/credential-stuffing/signup-spam target. Keyed by IP since
 * there's no authenticated user yet.
 *
 * Skipped entirely under Japa (`app.inTest`): the functional suite signs up ~200
 * real users over HTTP across its test files (see `signupAndGetUser` in
 * tests/functional/helpers.ts) in well under a minute — a limit tight enough to
 * matter for brute force would fail the suite outright, not just flake it. E2E
 * (`node ace serve` under NODE_ENV=development, not `test`) still exercises the
 * real limit — it only signs up a handful of users per run.
 */
export const authThrottle = limiter.define('auth', (ctx) => {
  if (app.inTest) return limiter.noLimit()
  return limiter.allowRequests(20).every('1 minute').usingKey(ctx.request.ip())
})

/**
 * Applied to the `lists/:listId/*` route group — the surface exposing bearer
 * tokens to always-on external clients (Home Assistant, Alexa). Must run
 * after the auth middleware so `ctx.auth.user` is populated.
 *
 * This group also carries the SPA's own interactive traffic, authenticated
 * with an ordinary login token on the same `api` guard a PAT shares the
 * route with — but only a PAT (`type === 'pat'`) is external, unattended,
 * always-on client traffic; a login token is a real person's browser
 * session. Throttling only PAT traffic keeps a runaway integration from
 * exhausting its own quota without capping normal browsing at all — a
 * single list page mount fires ~5 parallel GETs (list, categories, items,
 * stores, store-category-order), and a real session hopping between a few
 * screens can legitimately burst well past any number that would still
 * meaningfully cap an integration.
 */
export const listsThrottle = limiter.define('lists', (ctx) => {
  const token = ctx.auth.user?.currentAccessToken
  if (token?.type !== 'pat') return limiter.noLimit()
  return limiter.allowRequests(60).every('1 minute').usingKey(String(token.identifier))
})
