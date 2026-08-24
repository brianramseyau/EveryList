import List from '#models/list'
import Item from '#models/item'
import ListPolicy from '#policies/list_policy'
import ListExportMail from '#mails/list_export_mail'
import isMailConfigured from '#services/mail_configured'
import { emailExportValidator } from '#validators/list_export'
import type { HttpContext } from '@adonisjs/core/http'
import mail from '@adonisjs/mail/services/main'

function formatItemLine(item: Item): string {
  const quantity = item.quantity ? ` (${item.quantity})` : ''
  return `${item.name}${quantity}`
}

export default class ListExportController {
  async email({ auth, params, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    await ListPolicy.requireList(user, params.listId, 'viewer')

    if (!isMailConfigured()) {
      logger.debug('list export email requested but mail is not configured')
      return response.serviceUnavailable({
        message: 'Email export is not configured on this server.',
      })
    }

    const payload = await request.validateUsing(emailExportValidator)
    const list = await List.query().where('id', params.listId).whereNull('deletedAt').firstOrFail()
    const items = await Item.query()
      .where('listId', list.id)
      .where('checked', false)
      .whereNull('deletedAt')
      .orderBy('sortOrder', 'asc')

    await mail.send(new ListExportMail(list, items.map(formatItemLine), payload.email))
    logger.debug({ listId: list.id, itemCount: items.length }, 'list export email sent')

    return response.noContent()
  }
}
