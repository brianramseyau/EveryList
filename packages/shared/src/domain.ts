/** Mirrors the field picks in apps/api's transformers — see PLAN_00_FOUNDATIONAL_PLAN.md §7-8. */

export interface ListDto {
  id: number
  name: string
  color: string
  icon: string | null
  ownerId: number
  folderId: number | null
  archived: boolean
  badgeExcluded: boolean
  /** Whether items are grouped by category on this list. Always present on real API
   *  responses; optional here only so existing test fixtures don't all need updating —
   *  treat a missing value as `true` (the server-side default), same convention as `role` above. */
  useCategories?: boolean
  /** Whether explicit category assignments teach the list's learned
   *  (tokenized name → category) model. Turning it off also forgets the
   *  list's existing learned rows. Same "missing = server default (true)"
   *  convention as useCategories above. */
  useCategoryLearning?: boolean
  /** Same "missing = server default (true)" convention as useCategories above. */
  useShops?: boolean
  useFavorites?: boolean
  useRecent?: boolean
  useQuantity?: boolean
  usePrice?: boolean
  /** Whether items on this list carry a Deadline / "Required by" date (and
   *  optional time). Unlike every other feature flag, this one **defaults to
   *  `false`** server-side — a todos-style feature, not useful on shopping
   *  lists — so the usual "missing = true" convention is INVERTED here:
   *  treat a missing/undefined value as OFF, and gate reads with
   *  `useDeadline === true`. See PLAN_24_PHASE_ITEM_DEADLINES.md. */
  useDeadline?: boolean
  /** Display-only, independent of useShops/usePrice — same "missing = true" convention. */
  showStoreInList?: boolean
  showPriceInList?: boolean
  /** Missing = server default `'ranked'`. `'deadline'` is only meaningful when
   *  useDeadline is on (items without a deadline keep rank order at the tail). */
  itemSortOrder?: 'ranked' | 'alphabetical' | 'deadline'
  /** Only meaningful when itemSortOrder is 'ranked'. Missing = server default `'bottom'`. */
  insertPosition?: 'top' | 'bottom'
  /** Cap on unchecked ("open") items — checking one off frees a slot. Missing/null = no
   *  limit (the default). Intake only: unchecking is never blocked, so a list may sit
   *  over its limit until enough items are checked off. See PLAN_25_PHASE_OPEN_ITEM_LIMIT.md. */
  maxUncheckedItems?: number | null
  /** Client-computed `"<saltHex>:<sha256Hex>"` — the server never sees the raw PIN. See PLAN_07_PHASE_POLISH.md §2. */
  passcodeHash: string | null
  itemCount: number
  /** The requesting user's own membership role on this list. Always present on real API
   *  responses; optional here only so existing test fixtures don't all need updating. */
  role?: 'owner' | 'editor' | 'viewer' | null
  /** Accepted members, including the owner — 1 means "not shared". */
  memberCount?: number
  /** The owning user's display name, for lists shared to you that you don't own. */
  ownerName?: string | null
  createdAt: string
  updatedAt: string | null
  version: number
}

export interface CategoryDto {
  id: number
  name: string
  icon: string
  sortOrder: number
  listId: number | null
  isDefault: boolean
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
  version: number
}

export interface ItemDto {
  id: number
  listId: number
  name: string
  quantity: string | null
  notes: string | null
  categoryId: number | null
  storeId: number | null
  /** Integer cents (like Stripe) to avoid floating-point drift when summing a list's total. */
  price: number | null
  /** Deadline / "Required by" — naive-local ISO 8601: either 'YYYY-MM-DD'
   *  (due by end of that day) or 'YYYY-MM-DDTHH:mm' (minute precision, no
   *  seconds, no timezone). Null = no deadline. Only edited/shown on lists
   *  whose useDeadline flag is on. See PLAN_24_PHASE_ITEM_DEADLINES.md. */
  deadline: string | null
  checked: boolean
  checkedAt: string | null
  sortOrder: number
  createdBy: number
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
  version: number
}

/** Response for `GET /lists/:listId/items/categorize` — see PLAN_07_PHASE_POLISH.md §3. */
export interface CategorizeSuggestionDto {
  categoryId: number | null
}

/** One learned name→category association, synced read-only to the client for its
 * offline suggestion fallback — see PLAN_17_PHASE_LEARNED_AUTO_CATEGORIZATION.md. `token` is a normalized
 * name token (packages/shared's `tokenizeItemName`), `count` the number of
 * explicit assignments that produced it, and `lastSeenAt` the most recent. */
export interface CategoryLearningDto {
  categoryId: number
  token: string
  count: number
  lastSeenAt: string
}

export interface FavoriteItemDto {
  id: number
  userId: number
  listId: number
  name: string
  defaultCategoryId: number | null
  defaultQuantity: string | null
  storeId: number | null
  notes: string | null
  price: number | null
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
  version: number
}

export interface FolderDto {
  id: number
  userId: number
  name: string
  color: string
  sortOrder: number
  createdAt: string
  updatedAt: string | null
  version: number
}

export interface StoreDto {
  id: number
  name: string
  color: string
  createdBy: number
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
  version: number
}

export interface StoreCategoryOrderDto {
  id: number
  storeId: number
  categoryId: number
  sortOrder: number
  deletedAt: string | null
  version: number
}

/** Returned with a 409 when a mutation's `expectedVersion` no longer matches the server's row — PLAN_00_FOUNDATIONAL_PLAN.md §7. */
export interface ConflictResponse<T> {
  data: T
  conflict: true
}

export interface UserDto {
  id: number
  fullName: string | null
  email: string
  createdAt: string
  updatedAt: string | null
  initials: string
}

export type ListRole = 'owner' | 'editor' | 'viewer'

export interface ListMemberDto {
  id: number
  listId: number
  userId: number
  role: ListRole
  invitedAt: string
  acceptedAt: string | null
  user: UserDto
}

/**
 * A user the requester could directly add to a list — someone they already
 * share another list with. `sharedListNames` gives the picker context for
 * who the person is. Returned by `GET /lists/:listId/members/candidates`.
 */
export interface MemberCandidateDto {
  user: UserDto
  sharedListNames: string[]
}

export interface ListInviteDto {
  id: number
  listId: number
  token: string
  role: Exclude<ListRole, 'owner'>
  createdBy: number
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

/** Pre-auth-safe preview shown on the join page — no token/ids. */
export interface ListInvitePreviewDto {
  listName: string
  inviterName: string
  role: Exclude<ListRole, 'owner'>
}

/** A single list a Personal Access Token was granted access to, and at what role. */
export interface AccessTokenGrantDto {
  listId: number
  role: Exclude<ListRole, 'owner'>
}

/** A Personal Access Token for third-party integrations (Home Assistant, Alexa, ...) — scoped to one or more lists. */
export interface AccessTokenDto {
  id: number
  name: string | null
  grants: AccessTokenGrantDto[]
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

/** The one-time creation response — `token` is never returned again after this. */
export interface AccessTokenCreatedDto extends AccessTokenDto {
  token: string
}

/** The signed-in user's Alexa skill preferences — one row per user, readable/writable from
 *  Settings → Alexa in the web app as well as from `services/alexa/*` (voice/on-screen tap). */
export interface AlexaPreferenceDto {
  /** The list `SetDefaultListIntent`/this settings page's picker chose. `null` if never set —
   *  a request naming no list then asks which one, unless only one is accessible. */
  defaultListId: number | null
  /** Whether the Alexa display (and voice "show/hide checked items") includes checked items.
   *  Missing = server default `true`. */
  showChecked?: boolean
}

/** The app→native-widget handoff payload carried over the `everylist://widget-config` deep link
 *  (PLAN_18_PHASE_ANDROID_HOME_SCREEN_WIDGET.md). The web app mints a list-scoped PAT, then hands the token plus the granted
 *  list ids and the configured server URL to the Android widget so it can call the API directly —
 *  a native widget can't read the WebView's IndexedDB offline cache, so it authenticates over
 *  HTTP with this bearer token instead. */
export interface WidgetConfigDto {
  /** The `elt_`-prefixed Personal Access Token the widget uses for `Authorization: Bearer`. */
  token: string
  /** The list ids the token grants the widget — the user picks which one to display. */
  listIds: number[]
  /** The user-configured server origin (see `apps/web/src/lib/api/server-url.ts`). */
  serverUrl: string
}

export type BackupFrequency = 'daily' | 'weekly' | 'monthly'

/** `automatic` (taken by the schedule) vs `manual` (an on-demand "back up now") —
 * kept as fully decoupled processes: a manual backup never affects when the next
 * scheduled one fires, and retention is counted separately per kind. */
export type BackupKind = 'automatic' | 'manual'

/** Instance-wide automated backup schedule — one singleton row, shared by everyone
 * on this self-hosted instance. `timeOfDay` is a 24h "HH:mm" local server time.
 * `retentionCount` keeps the newest N backups of each kind, not a day window —
 * see apps/api's backup_service.ts for why a count avoids pruning away the
 * backup a due-check still needs to compare against. */
export interface BackupSettingsDto {
  frequency: BackupFrequency
  timeOfDay: string
  retentionCount: number
}

/** A single backup file on disk under `/config/backups`. */
export interface BackupFileDto {
  filename: string
  kind: BackupKind
  sizeBytes: number
  createdAt: string
}

export interface BackupSettingsStateDto {
  settings: BackupSettingsDto
  files: BackupFileDto[]
}

export interface SyncEventDto {
  entityType: 'list' | 'category' | 'item' | 'favorite_item' | 'store' | 'store_category_order'
  entityId: number
  op: 'create' | 'update' | 'delete' | 'purge'
  payload: Record<string, unknown> | null
  version: number | null
}
