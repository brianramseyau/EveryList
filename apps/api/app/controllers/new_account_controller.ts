import User from '#models/user'
import { signupValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import UserTransformer from '#transformers/user_transformer'
import env from '#start/env'
import { findActiveInvite } from '#services/invite_lookup'
import { createOwnedList } from '#services/list_creation'

/** Every new account starts with one list so signup doesn't land on an empty index. */
const STARTER_LIST = { name: 'Shopping List', icon: 'basket', color: '#f97316' } as const

export default class NewAccountController {
  async store({ request, response, serialize }: HttpContext) {
    const { fullName, email, password, inviteToken } = await request.validateUsing(signupValidator)

    const publicSignupEnabled = env.get('PUBLIC_SIGNUP_ENABLED', true)
    if (!publicSignupEnabled) {
      const invite = inviteToken ? await findActiveInvite(inviteToken) : null
      if (!invite) {
        return response.forbidden({ message: 'Public signup is currently disabled' })
      }
    }

    const user = await User.create({ fullName, email, password })
    const token = await User.accessTokens.create(user)
    await createOwnedList({ ownerId: user.id, ...STARTER_LIST, seedStarterCategories: true })

    return serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
    })
  }
}
