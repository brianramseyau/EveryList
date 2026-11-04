import User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import { signupValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import UserTransformer from '#transformers/user_transformer'
import { serverConfigValue } from '#services/server_config'
import { findActiveInvite } from '#services/invite_lookup'
import { createOwnedList, STARTER_LIST, TODOS_LIST } from '#services/list_creation'

/**
 * Every new account starts with two lists (see #services/list_creation for the shared
 * TODOS_LIST/STARTER_LIST constants) so signup doesn't land on an empty index, and so a
 * non-shopping user isn't stuck with shopping-only features. TODOS_LIST is created *before*
 * STARTER_LIST so it lands above "Shopping List" in the new user's list order (createOwnedList
 * assigns each list the next ListMember.sortOrder — see #services/list_member_sort). Its
 * shopping-oriented features are all off, and it's seeded with a few onboarding items that
 * teach the core item interactions by describing them.
 */
export default class NewAccountController {
  async store({ request, response, serialize, logger }: HttpContext) {
    const { fullName, email, password, inviteToken } = await request.validateUsing(signupValidator)

    const publicSignupEnabled = serverConfigValue('PUBLIC_SIGNUP_ENABLED', true)
    if (!publicSignupEnabled) {
      const invite = inviteToken ? await findActiveInvite(inviteToken) : null
      if (!invite) {
        logger.warn('signup rejected: public signup disabled and no valid invite token')
        return response.forbidden({ message: 'Public signup is currently disabled' })
      }
    }

    // The account and both starter lists (including their seeded learned-model keywords) commit
    // together. Without this, a failure partway through seeding leaves a real account with a
    // half-built model, and retrying signup then fails on the unique email index — this PR has no
    // backfill for that case. Token minting stays outside, as in setup_controller.ts.
    const user = await db.transaction(async (trx) => {
      const created = await User.create({ fullName, email, password }, { client: trx })
      await createOwnedList({
        ownerId: created.id,
        ...TODOS_LIST,
        useCategories: false,
        useShops: false,
        useFavorites: false,
        useRecent: false,
        useQuantity: false,
        usePrice: false,
        seedStarterTodoItems: true,
        client: trx,
      })
      await createOwnedList({
        ownerId: created.id,
        ...STARTER_LIST,
        seedStarterCategories: true,
        client: trx,
      })
      return created
    })
    const token = await User.accessTokens.create(user)

    logger.debug({ userId: user.id }, 'created new account')

    return serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
    })
  }
}
