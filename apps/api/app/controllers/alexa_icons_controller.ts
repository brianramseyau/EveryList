import type { HttpContext } from '@adonisjs/core/http'
import { renderIcon } from '#services/alexa/icon_renderer'

const NAME_PATTERN = /^[a-zA-Z0-9]+$/
const COLOR_PATTERN = /^[0-9a-fA-F]{6}$/
const DEFAULT_COLOR = 'edeae3'

/**
 * Serves category/list icons as PNGs for the Alexa APL visual display (PHASE16_PLAN.md
 * Stage 3) — a plain public URL, deliberately outside the `alexaSignature()`-guarded skill
 * endpoint and any session/PAT auth, since Alexa's cloud renderer fetches `Image` sources
 * directly and unauthenticated, the same way a browser would fetch an `<img src>`.
 */
export default class AlexaIconsController {
  async show({ params, request, response, logger }: HttpContext) {
    const name = params.name as string
    const color = (request.input('color') as string | undefined) ?? DEFAULT_COLOR

    if (!NAME_PATTERN.test(name) || !COLOR_PATTERN.test(color)) {
      logger.warn({ name, color }, 'rejected alexa icon request with invalid name or color')
      return response.badRequest({ message: 'Invalid icon name or color' })
    }

    const png = renderIcon(name, color)
    response.header('Content-Type', 'image/png')
    response.header('Cache-Control', 'public, max-age=604800, immutable')
    logger.debug({ name, color }, 'rendered alexa icon')
    return response.send(png)
  }
}
