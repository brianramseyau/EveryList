/**
 * Exhaustiveness helper for switch/if chains over a union type — a branch
 * that calls this fails to compile if the union grows a case the branch
 * doesn't handle.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`)
}
