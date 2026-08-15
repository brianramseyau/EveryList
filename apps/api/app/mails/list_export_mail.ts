import { BaseMail } from '@adonisjs/mail'
import type List from '#models/list'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default class ListExportMail extends BaseMail {
  subject = ''

  constructor(
    private list: List,
    private itemLines: string[],
    private recipientEmail: string
  ) {
    super()
    this.subject = `Shopping list: ${list.name}`
  }

  prepare() {
    this.message.to(this.recipientEmail)

    const listItems = this.itemLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')
    this.message.html(
      `<h1>${escapeHtml(this.list.name)}</h1><ul>${listItems || '<li>(no items)</li>'}</ul>`
    )
    this.message.text(
      `${this.list.name}\n\n${this.itemLines.length > 0 ? this.itemLines.join('\n') : '(no items)'}`
    )
  }
}
