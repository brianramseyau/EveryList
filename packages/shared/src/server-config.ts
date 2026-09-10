/** Where one setting's current value actually came from — mirrors the env-wins-over-file
 * precedence in `server_config.ts`. `'env'` fields are shown disabled in the settings UI, since
 * editing them here would be silently ignored by the server anyway. */
export type ServerConfigSource = 'env' | 'file' | 'default'

/** One editable server setting's resolved value. Secret-valued settings (passwords, client
 * secrets) never carry their real value to the client — `isSet` reports presence instead,
 * mirroring `debug_info.ts`'s `presence()` helper. */
export interface ServerConfigFieldDto {
  value: string | number | boolean | null
  source: ServerConfigSource
  isSet?: boolean
}

/** Response shape of `GET /api/v1/server-config` — every setting configurable through
 * `/config/config.yaml`, plus whether that file can currently be written to (it may be mounted
 * read-only, e.g. as a Kubernetes ConfigMap). Restricted to user id 1 — see
 * server_config_controller.ts. */
export interface ServerConfigStateDto {
  writable: boolean
  configPath: string
  publicSignupEnabled: ServerConfigFieldDto
  appUrl: ServerConfigFieldDto
  mailHost: ServerConfigFieldDto
  mailPort: ServerConfigFieldDto
  mailUsername: ServerConfigFieldDto
  mailPassword: ServerConfigFieldDto
  mailFromAddress: ServerConfigFieldDto
  mailFromName: ServerConfigFieldDto
  alexaSkillId: ServerConfigFieldDto
  authentikTokenUrl: ServerConfigFieldDto
  authentikUserinfoUrl: ServerConfigFieldDto
  authentikClientId: ServerConfigFieldDto
  authentikClientSecret: ServerConfigFieldDto
}

/** Request body for `PATCH /api/v1/server-config` — a partial update, same merge semantics as
 * `UpdateBackupSettingPayload`. Omitting a secret field leaves it unchanged; omitting any other
 * field leaves it unchanged too. Setting a field whose current `source` is `'env'` is rejected
 * (400) rather than silently ignored. */
export interface UpdateServerConfigPayload {
  publicSignupEnabled?: boolean
  appUrl?: string
  mailHost?: string
  mailPort?: number
  mailUsername?: string
  mailPassword?: string
  mailFromAddress?: string
  mailFromName?: string
  alexaSkillId?: string
  authentikTokenUrl?: string
  authentikUserinfoUrl?: string
  authentikClientId?: string
  authentikClientSecret?: string
}
