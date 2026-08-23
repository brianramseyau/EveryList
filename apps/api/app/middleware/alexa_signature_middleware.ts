import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { alexaSignatureVerifier } from '#services/alexa/signature_verifier'
import { writeFile } from 'node:fs/promises'

/**
 * Verifies that a request to the Alexa skill endpoint actually came from
 * Amazon (PHASE16_PLAN.md Stage 2) — required because this skill uses a
 * direct HTTPS endpoint instead of Lambda, which would otherwise do this via
 * IAM. Must read the raw body (`request.raw()`, populated by the bodyparser
 * middleware alongside its parsed JSON — see @adonisjs/bodyparser's
 * `updateRawBody`) rather than re-serializing the parsed body, since
 * re-serializing wouldn't byte-for-byte match what Amazon signed.
 */
export default class AlexaSignatureMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const certUrl = ctx.request.header('signaturecertchainurl')
    const signature = ctx.request.header('signature')
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
      ctx.logger.warn(
        {
          err: error,
          certUrl,
          rawBodyLength: Buffer.byteLength(rawBody, 'utf8'),
          contentLengthHeader: ctx.request.header('content-length'),
          contentEncodingHeader: ctx.request.header('content-encoding'),
          transferEncodingHeader: ctx.request.header('transfer-encoding'),
        },
        'Alexa request signature verification failed'
      )
      // TEMPORARY: dumps the exact failing payload to disk (never to logs/chat) so it can be
      // replayed locally against alexa-verifier to isolate whether corruption happens in transit
      // or in verification itself. Remove once the real cause is found (see PHASE16_PLAN.md).
      if (process.env.ALEXA_DEBUG_DUMP_SIGNATURE_FAILURES === 'true') {
        await writeFile(
          '/tmp/alexa-signature-failure.json',
          JSON.stringify({ certUrl, signature, rawBody })
          /* c8 ignore next -- disk-write failure isn't worth a contrived test for throwaway debug code */
        ).catch(() => {})
      }
      return ctx.response.unauthorized({ message: 'Invalid Alexa request signature' })
    }

    return next()
  }
}
