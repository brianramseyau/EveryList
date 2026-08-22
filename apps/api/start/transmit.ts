import transmit from '@adonisjs/transmit/services/main'
import type { HttpContext } from '@adonisjs/core/http'
import ListPolicy from '#policies/list_policy'

/**
 * A user may subscribe to a list's channel iff they have an accepted
 * `ListMember` row on it — see PLAN.md §8. Extracted as a plain function so
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
    return role !== null
  } catch {
    return false
  }
}

// Registers the actual __transmit/events (SSE), __transmit/subscribe, and
// __transmit/unsubscribe HTTP routes — without this call the routes never
// exist, so GET __transmit/events falls through to the SPA catch-all route
// in start/routes.ts and returns the HTML shell instead of an event stream.
transmit.registerRoutes()

transmit.authorize<{ id: string }>('list/:id', authorizeListChannel)
