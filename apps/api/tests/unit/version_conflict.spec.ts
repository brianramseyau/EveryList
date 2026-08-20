import { test } from '@japa/runner'
import { reportVersionConflict } from '#services/version_conflict'

test.group('reportVersionConflict', () => {
  test('logs a warn with the expected-vs-actual version delta and request context', ({
    assert,
  }) => {
    const warned: unknown[] = []
    const request = {
      method: () => 'PATCH',
      url: () => '/api/v1/lists/1/items/2',
    }
    const logger = {
      warn: (obj: unknown, message: unknown) => {
        warned.push([obj, message])
      },
    }

    reportVersionConflict(request as never, logger as never, {
      entity: 'item',
      id: 2,
      expectedVersion: 3,
      actualVersion: 5,
      userId: 7,
    })

    assert.lengthOf(warned, 1)
    const [obj, message] = warned[0] as [Record<string, unknown>, string]
    assert.equal(message, 'version conflict')
    assert.equal(obj.entity, 'item')
    assert.equal(obj.id, 2)
    assert.equal(obj.expectedVersion, 3)
    assert.equal(obj.actualVersion, 5)
    assert.equal(obj.userId, 7)
    assert.equal(obj.method, 'PATCH')
    assert.equal(obj.url, '/api/v1/lists/1/items/2')
  })
})
