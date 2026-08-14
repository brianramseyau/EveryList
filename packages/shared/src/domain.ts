/** Mirrors the field picks in apps/api's transformers — see PLAN.md §7-8. */

export interface ListDto {
	id: number;
	name: string;
	color: string;
	icon: string | null;
	ownerId: number;
	archived: boolean;
	itemCount: number;
	createdAt: string;
	updatedAt: string | null;
}

export interface CategoryDto {
	id: number;
	name: string;
	icon: string;
	sortOrder: number;
	listId: number | null;
	isDefault: boolean;
	createdAt: string;
	updatedAt: string | null;
}

export interface ItemDto {
	id: number;
	listId: number;
	name: string;
	quantity: string | null;
	notes: string | null;
	categoryId: number | null;
	checked: boolean;
	checkedAt: string | null;
	sortOrder: number;
	createdBy: number;
	createdAt: string;
	updatedAt: string | null;
	deletedAt: string | null;
}

export interface FavoriteItemDto {
	id: number;
	userId: number;
	listId: number;
	name: string;
	defaultCategoryId: number | null;
	defaultQuantity: string | null;
	createdAt: string;
	updatedAt: string | null;
}

export interface StoreDto {
	id: number;
	name: string;
	color: string;
	createdBy: number;
	createdAt: string;
	updatedAt: string | null;
}

export interface UserDto {
	id: number;
	fullName: string | null;
	email: string;
	createdAt: string;
	updatedAt: string | null;
	initials: string;
}
