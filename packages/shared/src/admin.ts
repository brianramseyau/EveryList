/** A user as seen by the instance's primary account (`GET/POST/PATCH /api/v1/admin/users`) —
 * restricted server-side to user id 1, since this app has no admin role to gate on instead (see
 * admin_users_controller.ts). Distinct from `UserDto`, which is returned to every user (list
 * members, invites, favorites) and shouldn't carry `disabledAt`. */
export interface AdminUserDto {
  id: number
  fullName: string | null
  email: string
  createdAt: string
  updatedAt: string | null
  disabledAt: string | null
}

export interface AdminUserCreateRequest {
  fullName: string | null
  email: string
  password: string
  /** Defaults to `true` server-side when omitted — see admin_users_controller.ts. */
  createDefaultLists?: boolean
}

/** All fields optional — only the ones present are changed. Setting `password` revokes the
 * target user's access tokens, same as a self-service password reset. */
export interface AdminUserUpdateRequest {
  fullName?: string | null
  email?: string
  password?: string
  disabled?: boolean
}
