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

function fakeReportContext() {
  const debugCalls: unknown[][] = []
  const ctx = {
    logger: { debug: (...args: unknown[]) => debugCalls.push(args) },
    request: { method: () => 'POST', url: () => '/api/v1/favorites' },
  } as unknown as HttpContext
  return { ctx, debugCalls }
}

test.group('HttpExceptionHandler', () => {
  test('maps a SQLite unique-constraint error to a friendly 422', async ({ assert }) => {
    const handler = new HttpExceptionHandler()
    const { ctx, sent } = fakeContext()

    await handler.handle({ code: 'SQLITE_CONSTRAINT_UNIQUE' }, ctx)

    assert.equal(sent.status, 422)
    assert.deepEqual(sent.body, { errors: [{ message: 'That name is already in use.' }] })
  })

  /**
   * `report()` runs before `handle()` on the same raw `SqliteError`, which
   * has no `.status` — the base handler would otherwise default it to 500
   * and log the routine, already-handled 422 as an `error`-level crash. This
   * confirms it's reported at `debug` and short-circuits before the base
   * handler's own logging runs.
   */
  test('reports a SQLite unique-constraint error at debug level, not as a 500', async ({
    assert,
  }) => {
    const handler = new HttpExceptionHandler()
    const { ctx, debugCalls } = fakeReportContext()

    await handler.report({ code: 'SQLITE_CONSTRAINT_UNIQUE' }, ctx)

    assert.lengthOf(debugCalls, 1)
    assert.equal(debugCalls[0]![1], 'unique constraint violation, responding 422')
  })
})
