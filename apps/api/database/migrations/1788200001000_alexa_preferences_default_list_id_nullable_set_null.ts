import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * `default_list_id` was `NOT NULL` + `ON DELETE CASCADE`: deleting the list a user picked as
 * their Alexa default deleted their *entire* preference row, silently resetting `show_checked`
 * back to its default too. This makes the column nullable and switches the FK action to
 * `SET NULL`, so losing the default list only clears that one field.
 *
 * SQLite has no `ALTER TABLE ... ALTER COLUMN`, and knex's `.alter()` on this dialect doesn't
 * replace an existing foreign key on the column being altered — it *adds* a second, conflicting
 * one alongside the original (confirmed empirically: two `table.integer(...).alter()` attempts
 * each left `default_list_id` with duplicate, contradictory `ON DELETE` constraints). The only
 * correct way to change an FK's action on SQLite is its own documented 12-step "rebuild the
 * table" procedure: copy into a new table with the desired schema, drop the old one, rename.
 *
 * SQLite's own docs have that recipe running under `PRAGMA foreign_keys = OFF`, but that's
 * deliberately skipped here: Lucid wraps every migration in its own transaction unless the
 * schema class opts out via `static disableTransactions = true`, and `PRAGMA foreign_keys` is a
 * documented no-op once a transaction is already open — so setting it here would silently do
 * nothing anyway. It's genuinely not needed for this table: nothing else in the schema
 * references `alexa_preferences`, so this rebuild can never put another table's row in
 * violation of a constraint. Don't copy this migration as a template for a table other rows
 * *do* reference without adding that flag (and accepting the loss of Lucid's automatic
 * rollback-on-failure that comes with it).
 */
export default class extends BaseSchema {
  protected tableName = 'alexa_preferences'

  async up() {
    this.schema.raw(`
      CREATE TABLE alexa_preferences_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
        default_list_id INTEGER REFERENCES lists (id) ON DELETE SET NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        show_checked BOOLEAN NOT NULL DEFAULT '1'
      )
    `)
    this.schema.raw(`
      INSERT INTO alexa_preferences_new
        (id, user_id, default_list_id, created_at, updated_at, show_checked)
      SELECT id, user_id, default_list_id, created_at, updated_at, show_checked
      FROM alexa_preferences
    `)
    this.schema.raw('DROP TABLE alexa_preferences')
    this.schema.raw('ALTER TABLE alexa_preferences_new RENAME TO alexa_preferences')
  }

  // Lossy on purpose, like this table's own `create_alexa_preferences_table` down() (a plain
  // dropTable): any row with a NULL default_list_id can't satisfy the original NOT NULL
  // constraint, so it's dropped rather than left to violate it. Rolling back after real rows
  // exist with no default list loses those rows' preferences entirely — acceptable for a
  // preferences table, but worth knowing before running this down() against real data.
  async down() {
    this.schema.raw(`
      CREATE TABLE alexa_preferences_old (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
        default_list_id INTEGER NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        show_checked BOOLEAN NOT NULL DEFAULT '1'
      )
    `)
    this.schema.raw(`
      INSERT INTO alexa_preferences_old
        (id, user_id, default_list_id, created_at, updated_at, show_checked)
      SELECT id, user_id, default_list_id, created_at, updated_at, show_checked
      FROM alexa_preferences
      WHERE default_list_id IS NOT NULL
    `)
    this.schema.raw('DROP TABLE alexa_preferences')
    this.schema.raw('ALTER TABLE alexa_preferences_old RENAME TO alexa_preferences')
  }
}
