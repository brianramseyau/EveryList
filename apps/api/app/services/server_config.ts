import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { createError } from '@adonisjs/core/exceptions'
import logger from '@adonisjs/core/services/logger'
import mail from '@adonisjs/mail/services/main'
import { databaseFilename } from '#services/backup_service'
import { smtpTransportConfig, mailFromConfig } from '#config/mail'
import type {
  ServerConfigFieldDto,
  ServerConfigSource,
  ServerConfigStateDto,
  UpdateServerConfigPayload,
} from '@everylist/shared'

type SettingType = 'string' | 'number' | 'boolean'
type DtoField = keyof UpdateServerConfigPayload
type YamlPath = [string] | [string, string]

interface SettingDef {
  envKey: string
  yamlPath: YamlPath
  dtoField: DtoField
  type: SettingType
  secret: boolean
}

/**
 * Every setting `/config/config.yaml` can override, alongside the env var it mirrors — see
 * PLAN_00_FOUNDATIONAL_PLAN.md and the CLAUDE.md-linked AGENTS.md for the full env var reference.
 * Deliberately excludes core/boot-time vars (DATABASE_FILENAME, SESSION_DRIVER, LIMITER_STORE,
 * NODE_ENV, PORT, HOST, APP_KEY, LOG_LEVEL, build metadata) and DEMO_SEED_ENABLED (a
 * maintainer-only flag for the public demo/review instance, not a self-hoster setting).
 */
const SETTINGS: SettingDef[] = [
  {
    envKey: 'PUBLIC_SIGNUP_ENABLED',
    yamlPath: ['publicSignupEnabled'],
    dtoField: 'publicSignupEnabled',
    type: 'boolean',
    secret: false,
  },
  { envKey: 'APP_URL', yamlPath: ['appUrl'], dtoField: 'appUrl', type: 'string', secret: false },
  {
    envKey: 'SMTP2GO_HOST',
    yamlPath: ['mail', 'host'],
    dtoField: 'mailHost',
    type: 'string',
    secret: false,
  },
  {
    envKey: 'SMTP2GO_PORT',
    yamlPath: ['mail', 'port'],
    dtoField: 'mailPort',
    type: 'number',
    secret: false,
  },
  {
    envKey: 'SMTP2GO_USERNAME',
    yamlPath: ['mail', 'username'],
    dtoField: 'mailUsername',
    type: 'string',
    secret: false,
  },
  {
    envKey: 'SMTP2GO_PASSWORD',
    yamlPath: ['mail', 'password'],
    dtoField: 'mailPassword',
    type: 'string',
    secret: true,
  },
  {
    envKey: 'SMTP2GO_FROM_ADDRESS',
    yamlPath: ['mail', 'fromAddress'],
    dtoField: 'mailFromAddress',
    type: 'string',
    secret: false,
  },
  {
    envKey: 'SMTP2GO_FROM_NAME',
    yamlPath: ['mail', 'fromName'],
    dtoField: 'mailFromName',
    type: 'string',
    secret: false,
  },
  {
    envKey: 'ALEXA_SKILL_ID',
    yamlPath: ['alexa', 'skillId'],
    dtoField: 'alexaSkillId',
    type: 'string',
    secret: false,
  },
  {
    envKey: 'AUTHENTIK_TOKEN_URL',
    yamlPath: ['alexa', 'authentikTokenUrl'],
    dtoField: 'authentikTokenUrl',
    type: 'string',
    secret: false,
  },
  {
    envKey: 'AUTHENTIK_USERINFO_URL',
    yamlPath: ['alexa', 'authentikUserinfoUrl'],
    dtoField: 'authentikUserinfoUrl',
    type: 'string',
    secret: false,
  },
  {
    envKey: 'AUTHENTIK_CLIENT_ID',
    yamlPath: ['alexa', 'authentikClientId'],
    dtoField: 'authentikClientId',
    type: 'string',
    secret: false,
  },
  {
    envKey: 'AUTHENTIK_CLIENT_SECRET',
    yamlPath: ['alexa', 'authentikClientSecret'],
    dtoField: 'authentikClientSecret',
    type: 'string',
    secret: true,
  },
]

const SETTING_BY_ENV_KEY = new Map(SETTINGS.map((setting) => [setting.envKey, setting]))
const SETTING_BY_DTO_FIELD = new Map(SETTINGS.map((setting) => [setting.dtoField, setting]))
const MAIL_DTO_FIELDS: DtoField[] = [
  'mailHost',
  'mailPort',
  'mailUsername',
  'mailPassword',
  'mailFromAddress',
  'mailFromName',
]

/**
 * `createError` (also used by `list_access_exceptions.ts`) wires up `.status` so Adonis's
 * default exception handler turns a bare `throw` into the right HTTP response with no
 * per-controller try/catch needed — see server_config_controller.ts.
 */
export const ConfigReadOnlyException = createError(
  'config.yaml is not writable — check the volume mount',
  'E_CONFIG_READ_ONLY',
  403
)

export const ConfigFieldLockedException = createError(
  'Set via environment variable, not editable here: %s',
  'E_CONFIG_FIELD_LOCKED',
  400
)

/** Backups/db/config.yaml all live in the same `/config` volume — no separate mount. Same
 * pattern as `backup_service.ts`'s `backupDirectory()`. */
export function serverConfigYamlPath(): string {
  return path.join(path.dirname(databaseFilename()), 'config.yaml')
}

/** Whether the config file (or, if it doesn't exist yet, its parent directory) can actually be
 * written to right now — false when `/config` is mounted read-only (e.g. as a Kubernetes
 * ConfigMap). Checked again immediately before every real write, since a mount can also fail in
 * ways `access()` doesn't predict (see `updateServerConfig`). */
export function isServerConfigWritable(): boolean {
  const filePath = serverConfigYamlPath()
  try {
    if (fs.existsSync(filePath)) {
      fs.accessSync(filePath, fs.constants.W_OK)
    } else {
      fs.accessSync(path.dirname(filePath), fs.constants.W_OK)
    }
    return true
  } catch {
    return false
  }
}

let fileCache: Record<string, unknown> = {}

/**
 * Re-reads `/config/config.yaml` into the in-memory cache every other function here resolves
 * against. Exported (not just called internally by `bootstrapServerConfig`/`updateServerConfig`)
 * so tests can force a reload after directly creating/deleting the file on disk — otherwise the
 * cache would keep serving a previous test's values until the next real write.
 */
export function loadFileCache(): void {
  const filePath = serverConfigYamlPath()
  if (!fs.existsSync(filePath)) {
    fileCache = {}
    return
  }

  try {
    const parsed = YAML.parse(fs.readFileSync(filePath, 'utf8'))
    fileCache = parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    // Deliberately not logging the raw error: the `yaml` package's parse-error messages embed
    // the offending source line verbatim, which could be a `mail.password`/
    // `alexa.authentikClientSecret` line from a hand-edited file — logging only the error code
    // (e.g. `BLOCK_IN_FLOW`) still gives an operator enough to find and fix the syntax error.
    // The `yaml` package's own parse errors are always `Error` instances carrying a `code` (e.g.
    // `BLOCK_IN_FLOW`); this only guards a theoretical non-Error throw.
    /* c8 ignore next */
    const code = error instanceof Error && 'code' in error ? String(error.code) : undefined
    logger.error({ code, filePath }, 'failed to parse config.yaml — ignoring file overrides')
    fileCache = {}
  }
}

function getYamlValue(source: Record<string, unknown>, yamlPath: YamlPath): unknown {
  let node: unknown = source
  for (const segment of yamlPath) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return node
}

/** Mutates `target` (never the shared `fileCache` directly — see `updateServerConfig`, which
 * applies this to a draft clone and only commits it after a successful write). */
function setYamlValue(target: Record<string, unknown>, yamlPath: YamlPath, value: unknown): void {
  if (yamlPath.length === 1) {
    target[yamlPath[0]] = value
    return
  }

  const [group, field] = yamlPath
  const existing = target[group]
  const groupNode =
    existing && typeof existing === 'object' ? (existing as Record<string, unknown>) : {}
  groupNode[field] = value
  target[group] = groupNode
}

function parseBoolean(raw: string): boolean | undefined {
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return undefined
}

/**
 * A hand-edited `config.yaml` can carry the wrong YAML type for a setting (e.g. a quoted
 * `publicSignupEnabled: 'false'`, a truthy non-empty string) — coerce or reject rather than
 * passing it through as-is, which would otherwise let a string silently masquerade as a
 * `boolean`/`number` at every call site (`serverConfigValue`, `applyMailConfig`, ...).
 */
function coerceFileValue(setting: SettingDef, raw: unknown): string | number | boolean | undefined {
  if (setting.type === 'boolean') {
    if (typeof raw === 'boolean') return raw
    // An unquoted `publicSignupEnabled: 0`/`1` parses as a YAML *number*, not a string — accept
    // it the same way parseBoolean already accepts the '0'/'1' strings, so a hand-edited `0`
    // doesn't fall through to "unset" (whose default happens to be `true`, silently inverting it).
    if (typeof raw === 'number') return raw === 1 ? true : raw === 0 ? false : undefined
    if (typeof raw === 'string') return parseBoolean(raw)
    return undefined
  }
  if (setting.type === 'number') {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (trimmed === '') return undefined
      const num = Number(trimmed)
      return Number.isFinite(num) ? num : undefined
    }
    return undefined
  }
  return typeof raw === 'string' ? raw : undefined
}

function envValue(setting: SettingDef): string | number | boolean | undefined {
  // Reads `process.env` live rather than the frozen `#start/env` snapshot, matching the existing
  // convention in `mail_configured.ts`/`authentik_client.ts`'s `requiredEnv` — lets the test
  // suite toggle these per-call, and means an env var always wins even though it's re-read fresh.
  const raw = process.env[setting.envKey]
  if (raw === undefined || raw === '') return undefined
  if (setting.type === 'boolean') return parseBoolean(raw)
  if (setting.type === 'number') {
    const trimmed = raw.trim()
    if (trimmed === '') return undefined
    const num = Number(trimmed)
    return Number.isFinite(num) ? num : undefined
  }
  return raw
}

function resolveSetting(setting: SettingDef): {
  value: string | number | boolean | undefined
  source: ServerConfigSource
} {
  const fromEnv = envValue(setting)
  if (fromEnv !== undefined) return { value: fromEnv, source: 'env' }

  const fromFile = coerceFileValue(setting, getYamlValue(fileCache, setting.yamlPath))
  if (fromFile !== undefined) return { value: fromFile, source: 'file' }

  return { value: undefined, source: 'default' }
}

/** Drop-in replacement for `env.get(envKey, fallback)` at call sites that read one of the
 * settings above — same signature, but also consults `/config/config.yaml`. */
export function serverConfigValue<T extends string | number | boolean>(
  envKey: string,
  fallback: T
): T {
  const setting = SETTING_BY_ENV_KEY.get(envKey)
  if (!setting) throw new Error(`Unknown server-config setting: ${envKey}`)
  const { value } = resolveSetting(setting)
  return (value === undefined ? fallback : value) as T
}

function toFieldDto(setting: SettingDef): ServerConfigFieldDto {
  const { value, source } = resolveSetting(setting)
  if (setting.secret) {
    return { value: null, source, isSet: value !== undefined }
  }
  return { value: value ?? null, source }
}

/** Full resolved state for the admin settings page and `GET /api/v1/server-config`. */
export function serverConfigState(): ServerConfigStateDto {
  const field = (dtoField: DtoField): ServerConfigFieldDto =>
    toFieldDto(SETTING_BY_DTO_FIELD.get(dtoField)!)

  return {
    writable: isServerConfigWritable(),
    configPath: serverConfigYamlPath(),
    publicSignupEnabled: field('publicSignupEnabled'),
    appUrl: field('appUrl'),
    mailHost: field('mailHost'),
    mailPort: field('mailPort'),
    mailUsername: field('mailUsername'),
    mailPassword: field('mailPassword'),
    mailFromAddress: field('mailFromAddress'),
    mailFromName: field('mailFromName'),
    alexaSkillId: field('alexaSkillId'),
    authentikTokenUrl: field('authentikTokenUrl'),
    authentikUserinfoUrl: field('authentikUserinfoUrl'),
    authentikClientId: field('authentikClientId'),
    authentikClientSecret: field('authentikClientSecret'),
  }
}

/**
 * Re-applies the currently-resolved mail settings onto `config/mail.ts`'s mutable config objects
 * and evicts the cached SMTP transport, so the next send picks up the change — see
 * `smtpTransportConfig`'s comment in config/mail.ts. A no-op for any field still at its
 * `env.get(...)`-seeded default (nothing to override), and safe to call before the mail manager
 * singleton exists yet (boot time — nothing's cached to evict either).
 */
function applyMailConfig(): void {
  const apply = (dtoField: DtoField, assign: (value: string | number | boolean) => void) => {
    const { value } = resolveSetting(SETTING_BY_DTO_FIELD.get(dtoField)!)
    if (value !== undefined) assign(value)
  }

  apply('mailHost', (value) => (smtpTransportConfig.host = value as string))
  apply('mailPort', (value) => (smtpTransportConfig.port = value as number))
  apply('mailUsername', (value) => (smtpTransportConfig.auth.user = value as string))
  apply('mailPassword', (value) => (smtpTransportConfig.auth.pass = value as string))
  apply('mailFromAddress', (value) => (mailFromConfig.address = value as string))
  apply('mailFromName', (value) => (mailFromConfig.name = value as string))

  /* c8 ignore next 4 -- `mail` (the services/main singleton) is only unset in the brief window
   * before `app.booted()` fires during real startup, before any request (or test) can reach
   * here — see bootstrapServerConfig's own doc comment. */
  if (!mail) return
  void mail
    .close('smtp')
    .catch((error) => logger.error({ err: error }, 'failed to close cached SMTP mailer'))
}

/** Loads `/config/config.yaml` and applies any file-set mail values — called once from the
 * `server_config` preload, so a pre-existing file is honored from the very first boot rather
 * than only after the next admin save. */
export function bootstrapServerConfig(): void {
  loadFileCache()
  applyMailConfig()
}

/** Applies a partial admin edit: rejects any field currently locked by an env var, re-checks
 * writability immediately before the real write (a mount can fail in ways `access()` didn't
 * predict), merges onto the latest on-disk content, and applies the mail side effect above when
 * relevant. */
export async function updateServerConfig(
  patch: UpdateServerConfigPayload
): Promise<ServerConfigStateDto> {
  loadFileCache()

  // `field` always resolves — `patch`'s keys are exactly `UpdateServerConfigPayload`'s, the same
  // set `SETTING_BY_DTO_FIELD` is built from.
  const lockedFields = (Object.keys(patch) as DtoField[]).filter(
    (field) => resolveSetting(SETTING_BY_DTO_FIELD.get(field)!).source === 'env'
  )
  if (lockedFields.length > 0) {
    throw new ConfigFieldLockedException([lockedFields.join(', ')])
  }

  if (!isServerConfigWritable()) {
    throw new ConfigReadOnlyException()
  }

  // Applied to a clone, not `fileCache` itself — if the write below fails, `fileCache` must stay
  // exactly as it was (still reflecting the real on-disk content), not silently carry an
  // unpersisted value in memory until the next restart or reload.
  const draft = structuredClone(fileCache)
  for (const setting of SETTINGS) {
    const incoming = patch[setting.dtoField]
    if (incoming === undefined) continue
    setYamlValue(draft, setting.yamlPath, incoming)
  }

  const filePath = serverConfigYamlPath()
  try {
    // Secrets (mail password, Authentik client secret) can live in this file in cleartext —
    // 0600 keeps it readable only by the account the server runs as. `writeFileSync`'s `mode`
    // option only applies when the file is newly created, so a rewrite of an existing file (with
    // looser inherited permissions) is tightened explicitly right after.
    fs.writeFileSync(filePath, YAML.stringify(draft), { encoding: 'utf8', mode: 0o600 })
  } catch (error) {
    logger.error({ err: error, filePath }, 'failed to write config.yaml')
    throw new ConfigReadOnlyException()
  }
  // Best-effort, in its own try/catch: the write above is what actually matters, and some mounts
  // (certain network/Windows binds) accept writes but reject chmod. Letting that fail the whole
  // request would report the change as rejected (403) while it was, in fact, already persisted —
  // worse than leaving the file at whatever permissions the write itself produced.
  try {
    fs.chmodSync(filePath, 0o600)
  } catch (error) {
    logger.error(
      { err: error, filePath },
      'wrote config.yaml but failed to tighten its permissions'
    )
  }
  fileCache = draft

  if ((Object.keys(patch) as DtoField[]).some((field) => MAIL_DTO_FIELDS.includes(field))) {
    applyMailConfig()
  }

  return serverConfigState()
}
