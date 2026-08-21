import { test } from '@japa/runner'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { copyScalarStandalone } from '#services/openapi/assets'

test.group('copyScalarStandalone', () => {
  test('creates parent directories and copies the file', async ({ assert }) => {
    const dir = await mkdtemp(join(tmpdir(), 'openapi-assets-'))
    const from = join(dir, 'standalone.js')
    const to = join(dir, 'nested', 'deep', 'scalar.js')

    await writeFile(from, 'console.log("scalar")')
    await copyScalarStandalone(from, to)

    assert.equal(await readFile(to, 'utf-8'), 'console.log("scalar")')
  })

  test('copies into an existing directory', async ({ assert }) => {
    const dir = await mkdtemp(join(tmpdir(), 'openapi-assets-'))
    const from = join(dir, 'standalone.js')
    const target = join(dir, 'docs')
    await mkdir(target)
    await writeFile(from, 'payload')

    await copyScalarStandalone(from, join(target, 'scalar.js'))

    assert.equal(await readFile(join(target, 'scalar.js'), 'utf-8'), 'payload')
  })
})
