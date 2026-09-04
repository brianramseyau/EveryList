import { DeadlineNotificationSendSchema } from '#database/schema'

/**
 * Dedup log: one row per (item, push subscription) a deadline notification
 * has already been sent for, so the scheduler never double-sends. Cleared
 * for an item whenever its deadline changes — see
 * `items_controller.ts#update`.
 */
export default class DeadlineNotificationSend extends DeadlineNotificationSendSchema {}
