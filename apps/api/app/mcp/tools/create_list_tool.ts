import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'

import { Tool } from '@jrmc/adonis-mcp'
import vine from '@vinejs/vine'
import { createOwnedList } from '#services/list_creation'

/**
 * `create_list` — creates a list the caller owns (via `createOwnedList`, the shared factory
 * every list-creating path uses, so the owner membership, starter-category seeding and the
 * realtime create broadcast all happen exactly as they do over HTTP). Note: the *token* caps
 * at editor on granted lists, but list creation is the account-level act every other
 * external-client path allows (a PAT's owner can always mint lists through the web) — the new
 * list is then outside this token's grants, which is why `grants` is echoed back so the caller
 * knows the very next step is re-scoping the token in Settings (or using list_lists to see it
 * appear).
 */
const vineSchema = vine.object({
  name: vine.string().trim().minLength(1).maxLength(120).meta({ description: 'New list name' }),
})

type Schema = BaseSchema<{
  name: { type: 'string' }
}>

export default class CreateListTool extends Tool<Schema> {
  name = 'create_list'
  title = 'Create a list'
  description =
    'Create a new list owned by your account (starter flags default on, like the app’s own ' +
    'list creation). Note: the list is NOT auto-granted to this access token — re-scope the ' +
    'token in Settings → Access Tokens before writing to it.'

  async handle({ args, response, auth }: ToolContext<Schema>) {
    const user = auth?.user
    if (!user) return response.error('Authentication required.')
    const payload = (args ?? {}) as { name?: string }
    if (!payload.name) return response.error('Name is required.')

    const list = await createOwnedList({
      ownerId: user.id,
      name: payload.name,
      color: '#3b82f6',
      icon: null,
    })

    return response.structured({
      list: { id: list.id, name: list.name },
      // Deliberately empty for this token (see the description above) — the tools' grant checks
      // key off `list:<id>:<role>` abilities written at mint time, so the truth is in Settings.
      tokenGrants: 'not-granted',
      items: [],
    })
  }

  schema() {
    return vine.create(vineSchema).toJSONSchema() as Schema
  }
}
