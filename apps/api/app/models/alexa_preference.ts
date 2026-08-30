import { AlexaPreferenceSchema } from '#database/schema'
import { column } from '@adonisjs/lucid/orm'

/**
 * One row per user, holding the default list `SetDefaultListIntent` set for
 * their Alexa account — read by `resolveList()` to pick a list without
 * asking when a request names no list and more than one is accessible — and
 * `showChecked`, whether the Alexa display/voice toggle shows checked items
 * (default true). Also readable/writable from the web app's Settings →
 * Alexa page (`alexa_preferences_controller.ts`), scoped to the signed-in
 * user, alongside `services/alexa/*`.
 */
export default class AlexaPreference extends AlexaPreferenceSchema {
  // SQLite has no native boolean type — better-sqlite3 round-trips this
  // column as 0/1 unless explicitly cast.
  @column({ consume: (value: unknown) => Boolean(value), prepare: (value: boolean) => value })
  declare showChecked: boolean
}
