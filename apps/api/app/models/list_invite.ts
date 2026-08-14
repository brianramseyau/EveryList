import { ListInviteSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import List from '#models/list'
import User from '#models/user'

export type InviteRole = 'editor' | 'viewer'

export default class ListInvite extends ListInviteSchema {
  declare role: InviteRole

  @belongsTo(() => List, { foreignKey: 'listId' })
  declare list: BelongsTo<typeof List>

  @belongsTo(() => User, { foreignKey: 'createdBy' })
  declare creator: BelongsTo<typeof User>
}
