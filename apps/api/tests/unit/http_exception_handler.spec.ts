import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import HttpExceptionHandler from '#exceptions/handler'

/**
 * The unique-constraint mapping in handler.ts is a safety net for concurrent
 * writes racing past an app-level dedupe check straight into the DB (e.g.
 * two simultaneous favorite creates for a brand-new name) — routine,
 * single-request usage never reaches it, so it's exercised directly here
 * rather than via a flaky race in a functional test.
 */
function fakeContext() {
  const sent: { status?: number; body?: unknown } = {}
  const response = {
    status(code: number) {
      sent.status = code
      return {
        send(body: unknown) {
          sent.body = body
        },
      }
    },
  }
  return { ctx: { response } as unknown as HttpContext, sent }
}

test.group('HttpExceptionHandler', () => {
  test('maps a SQLite unique-constraint error to a friendly 422', async ({ assert }) => {
    const handler = new HttpExceptionHandler()
    const { ctx, sent } = fakeContext()

    await handler.handle({ code: 'SQLITE_CONSTRAINT_UNIQUE' }, ctx)

    assert.equal(sent.status, 422)
    assert.deepEqual(sent.body, { errors: [{ message: 'That name is already in use.' }] })
  })
})
