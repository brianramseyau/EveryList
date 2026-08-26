import ListPolicy from '#policies/list_policy'
import type { HttpContext } from '@adonisjs/core/http'
import { getCategoryLearnings } from '#services/category_suggestion_service'

/**
 * Read-only view of a list's learned categorization model (PHASE17_PLAN.md) —
 * the web client caches this to keep its offline suggestion fallback in step
 * with the server's authoritative model. Viewer-accessible, same as the
 * `categorize` suggestion endpoint it mirrors.
 */
export default class CategoryLearningsController {
  async index({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'viewer')

    return response.ok({ data: await getCategoryLearnings(list) })
  }
}
