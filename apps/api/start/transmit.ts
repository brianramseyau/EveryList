import transmit from '@adonisjs/transmit/services/main'
import type { HttpContext } from '@adonisjs/core/http'
import ListPolicy from '#policies/list_policy'
import logger from '@adonisjs/core/services/logger'

/**
 * A user may subscribe to a list's channel iff they have an accepted
 * `ListMember` row on it — see PLAN_00_FOUNDATIONAL_PLAN.md §8. Extracted as a plain function so
 * it's directly unit-testable outside Transmit's own subscribe route, which
 * isn't reachable through Japa's `ApiClient`.
 */
export async function authorizeListChannel(
  ctx: HttpContext,
  params: { id: string }
): Promise<boolean> {
  try {
    // Accepts either a login session token or a Personal Access Token — a
    // PAT scoped to this list must be able to subscribe to its channel too,
    // or it gets full REST access but no realtime push. `roleFor` reduces
    // the role down to what the token actually grants either way.
    await ctx.auth.authenticateUsing(['api', 'pat'])
    const user = ctx.auth.getUserOrFail()
    const role = await ListPolicy.roleFor(user, params.id)
    if (role === null) {
      ctx.logger.debug(
        { listId: params.id, userId: user.id },
        'transmit channel authorization denied: no role on list'
      )
    }
    return role !== null
  } catch (error) {
    // Swallowing here is intentional — an unauthenticated/invalid subscribe
    // attempt must resolve to "not authorized", not a 500 — but it was
    // previously silent either way, which is exactly the kind of gap that
    // makes a subscribe-side bug (like the still-open "first broadcast after
    // boot" issue in AGENTS.md) hard to tell apart from a routine auth
    // failure after the fact.
    ctx.logger.debug({ err: error, listId: params.id }, 'transmit channel authorization failed')
    return false
  }
}

// Registers the actual __transmit/events (SSE), __transmit/subscribe, and
// __transmit/unsubscribe HTTP routes — without this call the routes never
// exist, so GET __transmit/events falls through to the SPA catch-all route
// in start/routes.ts and returns the HTML shell instead of an event stream.
transmit.registerRoutes()

transmit.authorize<{ id: string }>('list/:id', authorizeListChannel)

// Lifecycle logging for the full SSE connection lifecycle — connect,
// subscribe/unsubscribe, disconnect, and broadcast. There was previously no
// visibility into any of this, which is exactly the blind spot behind the
// still-open "first broadcast after boot" investigation in AGENTS.md: it
// needs to be possible to see, from logs alone, whether a subscriber was
// actually connected+subscribed at the moment a broadcast went out.
transmit.on('connect', ({ uid }) => {
  logger.debug({ uid }, 'transmit client connected')
})

transmit.on('disconnect', ({ uid }) => {
  logger.debug({ uid }, 'transmit client disconnected')
})

transmit.on('subscribe', ({ uid, channel }) => {
  logger.debug({ uid, channel }, 'transmit client subscribed')
})

transmit.on('unsubscribe', ({ uid, channel }) => {
  logger.debug({ uid, channel }, 'transmit client unsubscribed')
})

transmit.on('broadcast', ({ channel }) => {
  logger.debug(
    { channel, subscriberCount: transmit.getSubscribersFor(channel).length },
    'transmit broadcast sent'
  )
})
