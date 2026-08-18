import { randomBytes } from 'node:crypto'
import hash from '@adonisjs/core/services/hash'
import PasswordResetToken from '#models/password_reset_token'
import { DateTime } from 'luxon'
import type User from '#models/user'

const TOKEN_TTL_MINUTES = 60

function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Creates a reset token for a user (hashed at rest, like auth access tokens)
 * and returns the plaintext so the caller can put it in a reset-link email.
 */
export async function createPasswordResetToken(user: User): Promise<string> {
  const token = generateToken()
  await PasswordResetToken.create({
    userId: user.id,
    tokenHash: await hash.make(token),
    expiresAt: DateTime.now().plus({ minutes: TOKEN_TTL_MINUTES }),
    revokedAt: null,
  })
  return token
}

/**
 * Looks up an unexpired, non-revoked reset token by comparing the plaintext
 * against each active row's stored hash — the token is never queryable by
 * value. Returns null when nothing matches.
 */
export async function findActivePasswordResetToken(
  token: string
): Promise<PasswordResetToken | null> {
  const resetTokens = await PasswordResetToken.query()
    .whereNull('revokedAt')
    .where('expiresAt', '>', DateTime.now().toSQL())

  for (const resetToken of resetTokens) {
    if (await hash.verify(resetToken.tokenHash, token)) return resetToken
  }

  return null
}
