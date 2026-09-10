import type { BackupSettingsDto } from './domain.js'
import type { UserDto } from './domain.js'

/** Response shape of `GET /api/v1/setup/status` — whether this instance still needs its
 * first-run setup wizard (see setup_controller.ts). `defaultBackupSettings` mirrors whatever
 * `BackupSetting.current()` would create on a fresh instance, so the wizard's backup step always
 * pre-fills with the server's real defaults instead of a value hardcoded on the frontend that
 * could drift out of sync. */
export interface SetupStatusDto {
  needsSetup: boolean
  defaultBackupSettings: BackupSettingsDto
}

/** Request body for `POST /api/v1/setup` — creates user id 1 (the instance owner) and confirms
 * initial server-side settings in one step. Only succeeds once, while the `users` table is
 * empty. */
export interface SetupRequest {
  fullName: string | null
  email: string
  password: string
  passwordConfirmation: string
  backup: BackupSettingsDto
}

export interface SetupResponse {
  user: UserDto
  token: string
  backup: BackupSettingsDto
}
