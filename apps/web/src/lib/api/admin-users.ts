import type {
	AdminUserCreateRequest,
	AdminUserDto,
	AdminUserUpdateRequest
} from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

/** User management for the instance's primary account — restricted server-side to user id 1
 * (see admin_users_controller.ts), so any other account gets an ApiError with a 403 status. */
export function fetchAdminUsers(): Promise<AdminUserDto[]> {
	return apiGet<AdminUserDto[]>('/api/v1/admin/users');
}

export function createAdminUser(body: AdminUserCreateRequest): Promise<AdminUserDto> {
	return apiPost<AdminUserDto>('/api/v1/admin/users', body);
}

export function updateAdminUser(id: number, body: AdminUserUpdateRequest): Promise<AdminUserDto> {
	return apiPatch<AdminUserDto>(`/api/v1/admin/users/${id}`, body);
}

export function deleteAdminUser(id: number): Promise<void> {
	return apiDelete(`/api/v1/admin/users/${id}`);
}
