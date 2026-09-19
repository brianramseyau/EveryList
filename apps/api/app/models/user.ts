import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { type AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'

export default class User extends compose(UserSchema, withAuthFinder(hash)) {
  static accessTokens = DbAccessTokensProvider.forModel(User, { expiresIn: '30 days' })
  /**
   * Personal Access Tokens for third-party integrations (Home Assistant,
   * Alexa) — a separate bucket (own `type`/prefix) from login tokens so it
   * doesn't inherit their 30-day expiry and lists independently via `.all()`.
   * Each token's `abilities` encodes its list grants as `list:<id>:<role>`
   * strings — see ListPolicy for how those are enforced.
   */
  static personalAccessTokens = DbAccessTokensProvider.forModel(User, {
    type: 'pat',
    prefix: 'elt_',
  })
  declare currentAccessToken?: AccessToken

  /** Ability carried only by the short-lived login token an admin mints to act as another user
   * (see admin_users_controller.ts#impersonate). Keyed on an ability rather than the token's
   * `name` because names are user-supplied (a PAT can be called anything) whereas abilities are
   * always server-generated. */
  static IMPERSONATION_ABILITY = 'impersonated'

  /** True when this request was authenticated with an admin-minted impersonation token. */
  get isImpersonated() {
    return this.currentAccessToken?.abilities.includes(User.IMPERSONATION_ABILITY) ?? false
  }

  get initials() {
    const [first, last] = this.fullName ? this.fullName.split(' ') : this.email.split('@')
    if (first && last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }
    // `first` is always defined here: `.split()` on a non-empty fullName or
    // email always yields at least one element. The `?? ''` only satisfies
    // noUncheckedIndexedAccess's type, so it's unreachable at runtime.
    /* c8 ignore next */
    return `${(first ?? '').slice(0, 2)}`.toUpperCase()
  }
}
