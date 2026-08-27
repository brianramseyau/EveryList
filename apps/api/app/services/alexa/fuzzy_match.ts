/**
 * Plain Levenshtein edit distance — the TypeScript equivalent of Stage 1's
 * (Python/HA) use of stdlib `difflib.get_close_matches`, which has no direct
 * npm counterpart worth adding a dependency for.
 */
function levenshtein(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const distances: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0))

  for (let i = 0; i < rows; i++) distances[i]![0] = i
  for (let j = 0; j < cols; j++) distances[0]![j] = j

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      distances[i]![j] = Math.min(
        distances[i - 1]![j]! + 1,
        distances[i]![j - 1]! + 1,
        distances[i - 1]![j - 1]! + cost
      )
    }
  }

  return distances[rows - 1]![cols - 1]!
}

/**
 * Finds the candidate closest to `query`, tolerating near-miss voice
 * transcriptions ("miilk" vs "milk") — used both to resolve a spoken list
 * name and to match a spoken item name against existing items before
 * mutating anything (PLAN_16_PHASE_VOICE_ASSISTANT_INTEGRATION.md Stage 2's "Item matching" section). An
 * exact (case/whitespace-insensitive) match always wins outright; otherwise
 * the closest candidate is accepted only if its edit distance is small
 * relative to the word's own length, so "eggs" doesn't accidentally match
 * "eggplant".
 */
export function closestMatch<T>(
  query: string,
  candidates: T[],
  nameOf: (candidate: T) => string
): T | null {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery || candidates.length === 0) return null

  const exact = candidates.find(
    (candidate) => nameOf(candidate).trim().toLowerCase() === normalizedQuery
  )
  if (exact) return exact

  let best: T | null = null
  let bestDistance = Infinity

  for (const candidate of candidates) {
    const name = nameOf(candidate).trim().toLowerCase()
    const distance = levenshtein(normalizedQuery, name)
    const tolerance = Math.max(1, Math.floor(Math.max(normalizedQuery.length, name.length) / 4))
    if (distance <= tolerance && distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }

  return best
}
