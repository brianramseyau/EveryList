import { ListMemberSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import List from '#models/list'
import User from '#models/user'

export type ListRole = 'owner' | 'editor' | 'viewer'

export default class ListMember extends ListMemberSchema {
  declare role: ListRole

  @belongsTo(() => List, { foreignKey: 'listId' })
  declare list: BelongsTo<typeof List>

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>
}
