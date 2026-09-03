import vine from '@vinejs/vine'

export const subscribePushValidator = vine.create({
  endpoint: vine.string().trim().minLength(1).maxLength(2000),
  p256dh: vine.string().trim().minLength(1),
  auth: vine.string().trim().minLength(1),
})
