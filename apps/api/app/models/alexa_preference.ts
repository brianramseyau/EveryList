import { AlexaPreferenceSchema } from '#database/schema'

/**
 * One row per user, holding the default list `SetDefaultListIntent` set for
 * their Alexa account — read by `resolveList()` to pick a list without
 * asking when a request names no list and more than one is accessible.
 * Alexa-only: nothing outside `services/alexa/*` should read or write this.
 */
export default class AlexaPreference extends AlexaPreferenceSchema {}
