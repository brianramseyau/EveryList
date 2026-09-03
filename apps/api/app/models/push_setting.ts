import { PushSettingSchema } from '#database/schema'
import webpush from 'web-push'

/**
 * Instance-wide Web Push VAPID keypair — a singleton row (id 1), same
 * pattern as `BackupSetting`. Generated lazily on first use so a self-hosted
 * instance never needs a manually-provisioned env var or third-party
 * account for deadline notifications to work.
 */
export default class PushSetting extends PushSettingSchema {
  static async current(): Promise<PushSetting> {
    // Checked first so the (comparatively expensive) ECDSA keypair generation only ever runs
    // on the very first call after a fresh install, not on every `sendPush`/`current()` call —
    // `sendDueDeadlineNotifications` calls this once per subscription per scheduler tick.
    const existing = await PushSetting.find(1)
    if (existing) return existing

    // A find-then-create has a race window on truly concurrent first-ever callers (each
    // generates its own keypair), but `firstOrCreate` is still atomic against the actual
    // insert — worst case is one generated keypair goes unused, not two different rows.
    const { publicKey, privateKey } = webpush.generateVAPIDKeys()
    return PushSetting.firstOrCreate(
      { id: 1 },
      { id: 1, vapidPublicKey: publicKey, vapidPrivateKey: privateKey }
    )
  }
}
