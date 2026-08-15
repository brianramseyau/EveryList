import { FolderSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import List from '#models/list'

export default class Folder extends FolderSchema {
  @belongsTo(() => User, { foreignKey: 'userId' })
  declare owner: BelongsTo<typeof User>

  @hasMany(() => List, { foreignKey: 'folderId' })
  declare lists: HasMany<typeof List>
}
