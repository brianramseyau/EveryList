import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Defaults to false, like useDeadline — a todos-style feature that
      // doesn't fit a shopping list, not a "most lists want this" flag (see
      // foundational/PLAN_29_PHASE_SUBTASKS.md). The Shopping/Custom
      // prefabs' starting values follow the same default; only Todo/Chores
      // turns it on explicitly.
      table.boolean('use_subtasks').notNullable().defaultTo(false)
      // Defaults to false too — auto-completing a parent item is a behavior
      // change, not just a visibility toggle, and shouldn't silently kick in
      // even for lists that do have sub-tasks turned on.
      table.boolean('use_subtask_auto_complete').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('use_subtasks')
      table.dropColumn('use_subtask_auto_complete')
    })
  }
}
