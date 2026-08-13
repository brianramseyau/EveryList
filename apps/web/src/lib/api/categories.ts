import type { CategoryDto } from '@everylist/shared';
import { apiGet } from './client';

export function fetchCategories(listId: number): Promise<CategoryDto[]> {
	return apiGet(`/api/v1/lists/${listId}/categories`);
}
