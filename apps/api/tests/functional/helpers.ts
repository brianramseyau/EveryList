import type { ApiClient, ApiResponse } from '@japa/api-client'
import { DateTime } from 'luxon'
import ListMember from '#models/list_member'
import type { ListRole } from '#models/list_member'

let counter = 0

/**
 * Unwraps a response's `{ data }` envelope with an explicit type. Several
 * routes below share a URL pattern across methods (e.g. GET/POST
 * `/api/v1/lists`), which makes the japa/tuyau typed client infer a union
 * of every method's response shape for that pattern — this cast picks the
 * one the test actually expects instead of fighting that inference.
 */
export function bodyData<T>(response: ApiResponse): T {
  return (response.body() as { data: T }).data
}

/**
 * Signs up a fresh user and returns their bearer token, for functional
 * tests that need an authenticated client but don't care about the user
 * identity itself.
 */
export async function signupAndGetToken(client: ApiClient): Promise<string> {
  const { token } = await signupAndGetUser(client)
  return token
}

/**
 * Signs up a fresh user and returns both their bearer token and id, for
 * tests that need to grant that user a specific `ListMember` role.
 */
export async function signupAndGetUser(client: ApiClient): Promise<{ token: string; id: number }> {
  counter += 1
  const response = await client.post('/api/v1/auth/signup').json({
    fullName: 'Test User',
    email: `test-user-${counter}@example.com`,
    password: 'password123',
    passwordConfirmation: 'password123',
  })

  return { token: response.body().data.token, id: response.body().data.user.id }
}

/**
 * Grants a user a role on a list directly via the model, bypassing the
 * invite/accept flow — used to set up owner/editor/viewer/stranger test
 * fixtures without coupling every functional spec to the invite endpoints.
 */
export async function addMember(listId: number, userId: number, role: ListRole): Promise<void> {
  const now = DateTime.now()
  await ListMember.create({ listId, userId, role, invitedAt: now, acceptedAt: now })
}
