import vine from '@vinejs/vine'

export const emailExportValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email(),
  })
)
