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
    // Generated unconditionally (cheap) and only used if no row exists yet —
    // `firstOrCreate` is atomic, so this can't race into two different
    // keypairs across concurrent callers the way a separate find-then-create
    // would.
    const { publicKey, privateKey } = webpush.generateVAPIDKeys()
    return PushSetting.firstOrCreate(
      { id: 1 },
      { id: 1, vapidPublicKey: publicKey, vapidPrivateKey: privateKey }
    )
  }
}
