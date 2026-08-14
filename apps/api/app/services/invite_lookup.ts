import ListInvite from '#models/list_invite'
import { DateTime } from 'luxon'

/** Looks up a join-link invite by token, treating revoked/expired invites as not found. */
export async function findActiveInvite(token: string) {
  const invite = await ListInvite.query().where('token', token).whereNull('revokedAt').first()
  if (!invite) return null
  if (invite.expiresAt && invite.expiresAt < DateTime.now()) return null
  return invite
}
