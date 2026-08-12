import type { ApiClient } from '@japa/api-client'

let counter = 0

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
