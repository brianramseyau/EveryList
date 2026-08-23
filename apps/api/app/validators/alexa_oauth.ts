import vine from '@vinejs/vine'

/**
 * Amazon's account-linking "Access Token URI" call — always an authorization_code exchange in
 * this skill, since the token handed back is a Stage-0 PAT (see alexa_oauth_controller.ts),
 * which doesn't expire and so has no refresh flow to support.
 */
export const alexaOAuthTokenValidator = vine.create({
  grant_type: vine.literal('authorization_code'),
  code: vine.string().trim().minLength(1),
  redirect_uri: vine.string().trim().minLength(1),
  client_id: vine.string().trim().optional(),
  client_secret: vine.string().trim().optional(),
})
