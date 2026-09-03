import { BaseSchema } from '@adonisjs/lucid/schema'

// Three brand-new tables (no `alterTable` on an existing populated table),
// so none of them are the ALTER-with-inline-FK shape from the AGENTS.md
// cascade-delete incident — inline FK references here are safe.
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('push_subscriptions', (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.text('endpoint').notNullable().unique()
      table.text('p_256_dh').notNullable()
      table.text('auth').notNullable()
      table.timestamp('created_at').notNullable()
    })

    this.schema.createTable('push_settings', (table) => {
      table.increments('id')
      table.text('vapid_public_key').notNullable()
      table.text('vapid_private_key').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.createTable('deadline_notification_sends', (table) => {
      table.increments('id')
      table
        .integer('item_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('items')
        .onDelete('CASCADE')
      table
        .integer('push_subscription_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('push_subscriptions')
        .onDelete('CASCADE')
      table.timestamp('sent_at').notNullable()
      table.unique(['item_id', 'push_subscription_id'])
    })
  }

  async down() {
    this.schema.dropTable('deadline_notification_sends')
    this.schema.dropTable('push_settings')
    this.schema.dropTable('push_subscriptions')
  }
}
