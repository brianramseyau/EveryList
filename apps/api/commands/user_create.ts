import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import vine from '@vinejs/vine'

// Deliberately not imported at module scope — see #commands/demo_seed for why
// a top-level `#models/user` import here would permanently break password
// hashing for the rest of the process. Loaded inside run(), after startApp
// has booted the app.

/** Same starter lists a real signup gets — see #controllers/new_account_controller. */
const TODOS_LIST = { name: 'Todos', icon: 'formatListChecks', color: '#1d4ed8' } as const
const STARTER_LIST = { name: 'Shopping List', icon: 'basket', color: '#c2410c' } as const

const emailValidator = vine.compile(vine.string().trim().toLowerCase().email().maxLength(254))
const passwordValidator = vine.compile(vine.string().minLength(8).maxLength(32))

/**
 * Creates a user from the command line, following the same flow as a real
 * signup (see #controllers/new_account_controller) — including the two
 * starter lists — but bypassing `PUBLIC_SIGNUP_ENABLED` and invite checks
 * entirely, since this command is only ever run by whoever already has
 * shell access to the production container.
 *
 * Meant for provisioning the first account on an instance that has public
 * signup disabled and demo seeding off:
 *
 *   node ace user:create --email you@example.com --full-name "Your Name"
 *
 * Any of --email/--password/--full-name left off are prompted for
 * interactively (password is prompted with masked input + confirmation).
 */
export default class UserCreate extends BaseCommand {
  static commandName = 'user:create'
  static description = 'Create a user from the command line, with the same starter lists as signup'

  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Email address' })
  declare email?: string

  @flags.string({ description: 'Password (8-32 characters); omit to be prompted securely' })
  declare password?: string

  @flags.string({ description: 'Full name' })
  declare fullName?: string

  async run() {
    const { default: User } = await import('#models/user')
    const { createOwnedList } = await import('#services/list_creation')

    const email = await this.resolveEmail(User)
    if (email === null) return

    const password = await this.resolvePassword()
    if (password === null) return

    const fullName =
      this.fullName ?? (await this.prompt.ask('Full name (optional)', { default: '' })) ?? ''

    const user = await User.create({
      fullName: fullName.trim().length > 0 ? fullName.trim() : null,
      email,
      password,
    })

    await createOwnedList({
      ownerId: user.id,
      ...TODOS_LIST,
      useCategories: false,
      useShops: false,
      useFavorites: false,
      useRecent: false,
      useQuantity: false,
      usePrice: false,
      seedStarterTodoItems: true,
    })
    await createOwnedList({ ownerId: user.id, ...STARTER_LIST, seedStarterCategories: true })

    this.logger.success(`user:create: created ${user.email} (id ${user.id}) with starter lists`)
  }

  /**
   * A value passed via flag is validated once and fails the command outright
   * on rejection (it came from a script/one-liner, so silently falling back
   * to an interactive prompt would be surprising). A value left off the flag
   * is prompted for, and re-prompted on rejection since a human is right
   * there to correct it.
   */
  private async resolveEmail(User: typeof import('#models/user').default): Promise<string | null> {
    if (this.email !== undefined) {
      let email: string
      try {
        email = await emailValidator.validate(this.email)
      } catch {
        this.logger.error(`"${this.email}" is not a valid email address`)
        this.exitCode = 1
        return null
      }

      const existing = await User.findBy('email', email)
      if (existing) {
        this.logger.error(`A user with email ${email} already exists`)
        this.exitCode = 1
        return null
      }
      return email
    }

    while (true) {
      const raw = await this.prompt.ask('Email address', { validate: (v) => v.length > 0 })
      let email: string
      try {
        email = await emailValidator.validate(raw)
      } catch {
        this.logger.warning('Enter a valid email address')
        continue
      }

      const existing = await User.findBy('email', email)
      if (existing) {
        this.logger.warning(`A user with email ${email} already exists`)
        continue
      }

      return email
    }
  }

  private async resolvePassword(): Promise<string | null> {
    if (this.password !== undefined) {
      try {
        return await passwordValidator.validate(this.password)
      } catch {
        this.logger.error('Password must be 8-32 characters')
        this.exitCode = 1
        return null
      }
    }

    while (true) {
      const raw = await this.prompt.secure('Password (8-32 characters)')
      try {
        const password = await passwordValidator.validate(raw)
        const confirmation = await this.prompt.secure('Confirm password')
        if (confirmation !== password) {
          this.logger.warning('Passwords did not match')
          continue
        }
        return password
      } catch {
        this.logger.warning('Password must be 8-32 characters')
      }
    }
  }
}
