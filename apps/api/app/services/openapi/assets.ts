import { mkdir, copyFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Copies the vendored Scalar API-reference renderer bundle (a single
 * self-contained JS file) so the `/docs` UI works fully offline.
 */
export async function copyScalarStandalone(fromPath: string, toPath: string): Promise<void> {
  await mkdir(dirname(toPath), { recursive: true })
  await copyFile(fromPath, toPath)
}
