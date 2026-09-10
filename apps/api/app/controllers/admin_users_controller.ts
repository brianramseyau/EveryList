import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import AdminUserTransformer from '#transformers/admin_user_transformer'
import { adminCreateUserValidator, adminUpdateUserValidator } from '#validators/admin_user'
import { createOwnedList, STARTER_LIST, TODOS_LIST } from '#services/list_creation'

/**
 * User management for the instance's primary account. There's no admin role in this app (see
 * routes.ts's backup-settings comment and debug_controller.ts) so, same as /debug, every action
 * here hard-codes the caller to user id 1 — the account that necessarily created this instance's
 * first list — rather than any role/permission flag that could be granted away by mistake.
 */
export default class AdminUsersController {
  /** Shared 403 guard — any authenticated user can reach these routes (see routes.ts), this is
   * the actual authorization check. Returns the caller when they're allowed through. */
  private requireAdmin({ auth, response, logger }: HttpContext): User | null {
    const user = auth.getUserOrFail()
    if (user.id !== 1) {
      logger.warn({ userId: user.id }, 'admin users endpoint access denied')
      response.forbidden({ message: 'Not authorized' })
      return null
    }
    return user
  }

  async index(ctx: HttpContext) {
    if (!this.requireAdmin(ctx)) return
    const users = await User.query().orderBy('id', 'asc')
    return ctx.serialize(AdminUserTransformer.transform(users))
  }

  /** Creates a plain user record. Defaults to also creating the same starter lists a real
   * signup gets (new_account_controller.ts) — an admin-created account that lands on an empty
   * index is a bug users hit and had to be told to ignore, not a real "household member joining
   * existing lists" case; `createDefaultLists: false` opts back out of that. Wrapped in one
   * transaction (same as setup_controller.ts#store) so a failure partway through the starter
   * lists can't leave a half-provisioned user behind that the admin can't retry (the duplicate
   * email would reject a resubmit). */
  async store(ctx: HttpContext) {
    if (!this.requireAdmin(ctx)) return
    const { fullName, email, password, createDefaultLists } =
      await ctx.request.validateUsing(adminCreateUserValidator)
    const shouldCreateDefaultLists = createDefaultLists ?? true

    const user = await db.transaction(async (trx) => {
      // `disabledAt` explicitly null (rather than omitted) so the in-memory model returned below
      // has it hydrated — Lucid only populates attributes that were actually assigned, and this
      // response skips the extra round-trip a `.refresh()` would cost.
      const created = await User.create(
        { fullName, email, password, disabledAt: null },
        { client: trx }
      )

      if (shouldCreateDefaultLists) {
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
      }

      return created
    })

    ctx.logger.info(
      { userId: user.id, createDefaultLists: shouldCreateDefaultLists },
      'admin created user'
    )

    return ctx.response.created(await ctx.serialize(AdminUserTransformer.transform(user)))
  }

  async update(ctx: HttpContext) {
    const admin = this.requireAdmin(ctx)
    if (!admin) return

    const target = await User.findOrFail(ctx.request.param('id'))
    const { fullName, email, password, disabled } = await ctx.request.validateUsing(
      adminUpdateUserValidator,
      { meta: { userId: target.id } }
    )

    if (fullName !== undefined) target.fullName = fullName
    if (email !== undefined) target.email = email

    if (disabled !== undefined) {
      // A locked-out primary account has no other way to regain access — there's no other
      // admin to undo it.
      if (disabled && target.id === 1) {
        return ctx.response.unprocessableEntity({
          message: 'The primary account cannot be disabled.',
        })
      }
      target.disabledAt = disabled ? DateTime.now() : null
    }

    if (password !== undefined) {
      target.password = password
    }
    await target.save()

    if (password !== undefined) {
      // Same as a self-service password reset (password_reset_controller.ts#reset) — an
      // admin-issued password change must kill any session using the old credentials.
      await User.accessTokens.deleteAll(target)
      ctx.logger.info({ userId: target.id }, 'admin reset user password, access tokens revoked')
    }

    ctx.logger.info({ userId: target.id }, 'admin updated user')
    return ctx.serialize(AdminUserTransformer.transform(target))
  }

  /** Deleting a user cascades (via the `owner_id ... onDelete('CASCADE')` FK on `lists`) to
   * every list they own and everything under those lists — this is real, intentional
   * destructive behavior, not a bug to guard against. */
  async destroy(ctx: HttpContext) {
    if (!this.requireAdmin(ctx)) return

    const target = await User.findOrFail(ctx.request.param('id'))
    if (target.id === 1) {
      return ctx.response.unprocessableEntity({
        message: 'The primary account cannot be deleted.',
      })
    }

    await target.delete()
    ctx.logger.info({ userId: target.id }, 'admin deleted user')
    return ctx.response.noContent()
  }
}
