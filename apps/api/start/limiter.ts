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

/**
 * Applied to the `lists/:listId/*` route group — the first surface exposing
 * bearer tokens to always-on external clients (Home Assistant, Alexa). Keyed
 * per-token rather than per-user: a runaway integration exhausts only its
 * own token's quota, not the interactive session sharing the same account.
 * Must run after the auth middleware so `ctx.auth.user` is populated.
 */
export const listsThrottle = limiter.define('lists', (ctx) => {
  const key = ctx.auth.user?.currentAccessToken?.identifier ?? ctx.request.ip()
  return limiter.allowRequests(60).every('1 minute').usingKey(String(key))
})
