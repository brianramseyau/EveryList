import { PushSubscriptionSchema } from '#database/schema'

/**
 * One row per browser/device subscribed to self-hosted Web Push (VAPID) —
 * see PLAN_26_PHASE_DEADLINE_NOTIFICATIONS.md. Native (Capacitor) and
 * Electron never write here; they use on-device local scheduling instead.
 */
export default class PushSubscription extends PushSubscriptionSchema {}
