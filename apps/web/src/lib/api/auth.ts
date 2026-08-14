import type { UserDto } from '@everylist/shared';
import { apiGet, apiPost } from './client';
import { clearToken, setToken } from './token';

interface AuthResponse {
	user: UserDto;
	token: string;
}

export async function signup(input: {
	fullName: string | null;
	email: string;
	password: string;
	passwordConfirmation: string;
	inviteToken?: string;
}): Promise<AuthResponse> {
	const response = await apiPost<AuthResponse>('/api/v1/auth/signup', input);
	setToken(response.token);
	return response;
}

export async function login(input: { email: string; password: string }): Promise<AuthResponse> {
	const response = await apiPost<AuthResponse>('/api/v1/auth/login', input);
	setToken(response.token);
	return response;
}

export function fetchProfile(): Promise<UserDto> {
	return apiGet('/api/v1/account/profile');
}

export async function logout(): Promise<void> {
	try {
		await apiPost('/api/v1/account/logout');
	} finally {
		clearToken();
	}
}
