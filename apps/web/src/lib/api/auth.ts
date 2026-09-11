import type { UserDto } from '@everylist/shared';
import { apiGet, apiPatch, apiPost } from './client';
import { clearToken, setToken } from './token';
import { clearLocalData } from '../offline/db';
import { isIngress, suppressImplicitHaSignIn } from './ingress';

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

/** The explicit "sign in with a different Home Assistant account" form (Settings → Home
 *  Assistant explains why "different" — see `+page.svelte` in that route). `auth_api`-validated
 *  against HA's real accounts; only succeeds for a username already linked from Settings. */
export async function loginWithHomeAssistant(input: {
	username: string;
	password: string;
}): Promise<AuthResponse> {
	const response = await apiPost<AuthResponse>('/api/v1/auth/login-with-home-assistant', input);
	setToken(response.token);
	return response;
}

/** Silent sign-in using the HA identity Supervisor's Ingress proxy already reports for this
 *  visitor — no credentials, no form. Throws (via `ApiError`, 401/404) when there's no detected
 *  identity or it isn't linked; callers should treat that as "fall through to the normal login
 *  screen", not as an error to surface. */
export async function loginWithHomeAssistantIdentity(): Promise<AuthResponse> {
	const response = await apiPost<AuthResponse>('/api/v1/auth/login-with-home-assistant-identity');
	setToken(response.token);
	return response;
}

export function fetchProfile(): Promise<UserDto> {
	return apiGet('/api/v1/account/profile');
}

export function updateProfile(input: { fullName: string | null }): Promise<UserDto> {
	return apiPatch('/api/v1/account/profile', input);
}

export async function logout(): Promise<void> {
	try {
		await apiPost('/api/v1/account/logout');
	} finally {
		clearToken();
		await clearLocalData();
		// Otherwise a linked user's very next Ingress page load signs them right back in
		// (+layout.svelte's attemptImplicitHaSignIn), making "log out" a no-op under Ingress.
		if (isIngress()) suppressImplicitHaSignIn();
	}
}

export function forgotPassword(input: { email: string }): Promise<void> {
	return apiPost('/api/v1/auth/forgot-password', input);
}

export function resetPassword(input: {
	token: string;
	password: string;
	passwordConfirmation: string;
}): Promise<void> {
	return apiPost('/api/v1/auth/reset-password', input);
}

export function changePassword(input: {
	currentPassword: string;
	password: string;
	passwordConfirmation: string;
	signOutOtherDevices?: boolean;
}): Promise<UserDto> {
	return apiPatch('/api/v1/account/password', input);
}
