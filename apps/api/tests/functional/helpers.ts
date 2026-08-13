import type { ApiClient, ApiResponse } from '@japa/api-client'

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
  counter += 1
  const response = await client.post('/api/v1/auth/signup').json({
    fullName: 'Test User',
    email: `test-user-${counter}@example.com`,
    password: 'password123',
    passwordConfirmation: 'password123',
  })

  return response.body().data.token
}
