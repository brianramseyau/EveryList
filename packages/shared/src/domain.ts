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

export type ListRole = 'owner' | 'editor' | 'viewer';

export interface ListMemberDto {
	id: number;
	listId: number;
	userId: number;
	role: ListRole;
	invitedAt: string;
	acceptedAt: string | null;
	user: UserDto;
}

export interface ListInviteDto {
	id: number;
	listId: number;
	token: string;
	role: Exclude<ListRole, 'owner'>;
	createdBy: number;
	expiresAt: string | null;
	revokedAt: string | null;
	createdAt: string;
}

/** Pre-auth-safe preview shown on the join page — no token/ids. */
export interface ListInvitePreviewDto {
	listName: string;
	inviterName: string;
	role: Exclude<ListRole, 'owner'>;
}

export interface SyncEventDto {
	entityType: 'list' | 'category' | 'item' | 'favorite_item' | 'store' | 'store_category_order';
	entityId: number;
	op: 'create' | 'update' | 'delete';
	payload: Record<string, unknown> | null;
}
