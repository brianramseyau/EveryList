import vine from '@vinejs/vine'

export const subscribePushValidator = vine.create({
  // `endpoint` is a trust-boundary input the server later POSTs to (web-push) — require an
  // https URL rather than an arbitrary string, closing an SSRF-shaped hole where an
  // authenticated client could point the server at an arbitrary internal https URL. No
  // `.normalizeUrl()` — the endpoint must round-trip byte-for-byte to match what the
  // browser's push service expects.
  endpoint: vine
    .string()
    .trim()
    .maxLength(2000)
    .url({ protocols: ['https'], require_protocol: true }),
  p256dh: vine.string().trim().minLength(1),
  auth: vine.string().trim().minLength(1),
})
