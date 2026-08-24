import ListInvite from '#models/list_invite'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'

/** Looks up a join-link invite by token, treating revoked/expired invites as not found. */
export async function findActiveInvite(token: string) {
  const invite = await ListInvite.query().where('token', token).whereNull('revokedAt').first()
  if (!invite) {
    logger.debug('list invite lookup found no active invite for token')
    return null
  }
  if (invite.expiresAt && invite.expiresAt < DateTime.now()) {
    logger.debug(
      { inviteId: invite.id, listId: invite.listId },
      'list invite lookup found an expired invite'
    )
    return null
  }
  logger.debug(
    { inviteId: invite.id, listId: invite.listId },
    'list invite lookup found an active invite'
  )
  return invite
}
