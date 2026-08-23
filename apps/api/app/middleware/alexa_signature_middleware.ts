import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { alexaSignatureVerifier } from '#services/alexa/signature_verifier'

/**
 * Verifies that a request to the Alexa skill endpoint actually came from
 * Amazon (PHASE16_PLAN.md Stage 2) — required because this skill uses a
 * direct HTTPS endpoint instead of Lambda, which would otherwise do this via
 * IAM. Must read the raw body (`request.raw()`, populated by the bodyparser
 * middleware alongside its parsed JSON — see @adonisjs/bodyparser's
 * `updateRawBody`) rather than re-serializing the parsed body, since
 * re-serializing wouldn't byte-for-byte match what Amazon signed.
 *
 * Reads the `signature-256` header, not the plain `signature` header — Amazon
 * sends both, but `signature` carries a legacy (non-SHA-256) value that will
 * never verify against `alexa-verifier`'s RSA-SHA256 check. `signature-256`
 * is the one meant to pair with it. Confirmed by reproducing a real failing
 * request with plain `openssl dgst -sha256 -verify`, independent of Node.
 */
export default class AlexaSignatureMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const certUrl = ctx.request.header('signaturecertchainurl')
    const signature = ctx.request.header('signature-256')
    const rawBody = ctx.request.raw()

    if (!certUrl || !signature || !rawBody) {
      ctx.logger.warn(
        { certUrl: Boolean(certUrl), signature: Boolean(signature), rawBody: Boolean(rawBody) },
        'Alexa request missing signature headers'
      )
      return ctx.response.unauthorized({ message: 'Missing Alexa request signature headers' })
    }

    try {
      await alexaSignatureVerifier.verify(certUrl, signature, rawBody)
    } catch (error) {
      ctx.logger.warn({ err: error, certUrl }, 'Alexa request signature verification failed')
      return ctx.response.unauthorized({ message: 'Invalid Alexa request signature' })
    }

    return next()
  }
}
