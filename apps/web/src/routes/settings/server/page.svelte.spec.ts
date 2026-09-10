import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';
import type { ServerConfigFieldDto, ServerConfigStateDto } from '@everylist/shared';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/server-config', () => ({
	fetchServerConfig: vi.fn(),
	updateServerConfig: vi.fn()
}));

const { fetchServerConfig, updateServerConfig } = await import('$lib/api/server-config');
const { goto } = await import('$app/navigation');
const ServerSettingsPage = (await import('./+page.svelte')).default;

function field(
	value: string | number | boolean | null,
	source: ServerConfigFieldDto['source'] = 'default'
): ServerConfigFieldDto {
	return { value, source };
}

function secretField(
	isSet: boolean,
	source: ServerConfigFieldDto['source'] = 'default'
): ServerConfigFieldDto {
	return { value: null, source, isSet };
}

function state(overrides: Partial<ServerConfigStateDto> = {}): ServerConfigStateDto {
	return {
		writable: true,
		configPath: '/config/config.yaml',
		publicSignupEnabled: field(true),
		// APP_URL is a required env var, so in every real deployment this is 'env'-sourced — see
		// server_config.ts and config/app.ts's appUrl().
		appUrl: field('http://localhost:3334', 'env'),
		mailHost: field(null),
		mailPort: field(null),
		mailUsername: field(null),
		mailPassword: secretField(false),
		mailFromAddress: field(null),
		mailFromName: field(null),
		alexaSkillId: field(null),
		authentikTokenUrl: field(null),
		authentikUserinfoUrl: field(null),
		authentikClientId: field(null),
		authentikClientSecret: secretField(false),
		...overrides
	};
}

describe('Server settings +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchServerConfig).mockResolvedValue(state());
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('sets the document title', async () => {
		render(ServerSettingsPage);

		await expect.poll(() => document.title).toBe('Server settings — EveryList');
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(ServerSettingsPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchServerConfig).mockRejectedValue(new TypeError('network down'));

		render(ServerSettingsPage);

		await expect.element(page.getByText('Failed to load server settings.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchServerConfig).mockRejectedValue(new ApiError(500, 'Server exploded'));

		render(ServerSettingsPage);

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('pre-fills the form from the loaded settings', async () => {
		vi.mocked(fetchServerConfig).mockResolvedValue(
			state({ mailHost: field('mail.example.com'), mailPort: field(587) })
		);

		render(ServerSettingsPage);

		await expect.element(page.getByLabelText('Mail host')).toHaveValue('mail.example.com');
		await expect.element(page.getByLabelText('Mail port')).toHaveValue(587);
		await expect
			.element(page.getByRole('checkbox', { name: 'Allow public signups' }))
			.toBeChecked();
	});

	it('disables a field set via an environment variable, with a hint', async () => {
		// appUrl is 'env' by default in the state() helper above, matching how it behaves in every
		// real deployment (APP_URL is a required env var) — see server_config.ts.
		render(ServerSettingsPage);

		await expect.element(page.getByLabelText('App URL')).toBeDisabled();
		await expect.element(page.getByText('Set via APP_URL.')).toBeInTheDocument();
	});

	it('defaults the public-signup toggle to on when a fresh instance has no value set', async () => {
		vi.mocked(fetchServerConfig).mockResolvedValue(state({ publicSignupEnabled: field(null) }));

		render(ServerSettingsPage);

		await expect
			.element(page.getByRole('checkbox', { name: 'Allow public signups' }))
			.toBeChecked();
	});

	it('shows a read-only banner and disables Save when config.yaml is not writable', async () => {
		vi.mocked(fetchServerConfig).mockResolvedValue(state({ writable: false }));

		render(ServerSettingsPage);

		await expect.element(page.getByText(/isn't writable/)).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
	});

	it('shows a masked placeholder for a secret that is set, without ever loading its value', async () => {
		vi.mocked(fetchServerConfig).mockResolvedValue(state({ mailPassword: secretField(true) }));

		render(ServerSettingsPage);

		await expect.element(page.getByLabelText('Mail password')).toHaveValue('');
		await expect
			.element(page.getByLabelText('Mail password'))
			.toHaveAttribute('placeholder', '••••••••');
	});

	it('saves a toggled setting, sending only that field', async () => {
		vi.mocked(updateServerConfig).mockResolvedValue(state({ publicSignupEnabled: field(false) }));

		render(ServerSettingsPage);
		await page.getByRole('checkbox', { name: 'Allow public signups' }).click();
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateServerConfig).toHaveBeenCalledWith({ publicSignupEnabled: false });
		await expect
			.element(page.getByRole('checkbox', { name: 'Allow public signups' }))
			.not.toBeChecked();
	});

	it('never sends an untouched empty field or a locked field on save', async () => {
		// Regression test: the form used to always send every field, including empty untouched
		// optional fields (which the server's url()/email() validators reject) and the disabled
		// appUrl field (which the server rejects outright since it's env-locked) — breaking Save
		// entirely. Only the one field actually changed should be sent.
		vi.mocked(fetchServerConfig).mockResolvedValue(state({ mailHost: field('mail.example.com') }));
		vi.mocked(updateServerConfig).mockResolvedValue(
			state({ mailHost: field('changed.example.com') })
		);

		render(ServerSettingsPage);
		await expect.element(page.getByLabelText('Mail host')).toHaveValue('mail.example.com');
		await page.getByLabelText('Mail host').fill('changed.example.com');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateServerConfig).toHaveBeenCalledWith({
			publicSignupEnabled: true,
			mailHost: 'changed.example.com'
		});
	});

	it('omits Port from the save payload after it is cleared, instead of sending null', async () => {
		// Regression test: Flowbite's number input hands bind:value back as `null` when emptied
		// (not `''`) — the save handler used to only guard against `''`, so a cleared Port slipped
		// through as `{ mailPort: null }` and the server's vine.number() validator 422'd on it.
		vi.mocked(fetchServerConfig).mockResolvedValue(state({ mailPort: field(2525) }));
		vi.mocked(updateServerConfig).mockResolvedValue(state({ mailPort: field(null) }));

		render(ServerSettingsPage);
		await expect.element(page.getByLabelText('Mail port')).toHaveValue(2525);
		await page.getByLabelText('Mail port').fill('');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateServerConfig).toHaveBeenCalledWith({ publicSignupEnabled: true });
	});

	it('omits a blank secret field from the save payload (leaves it unchanged)', async () => {
		vi.mocked(updateServerConfig).mockResolvedValue(state({ mailPassword: secretField(false) }));

		render(ServerSettingsPage);
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateServerConfig).toHaveBeenCalledWith({ publicSignupEnabled: true });
	});

	it('sends a filled-in secret field on save', async () => {
		vi.mocked(updateServerConfig).mockResolvedValue(state({ mailPassword: secretField(true) }));

		render(ServerSettingsPage);
		await page.getByLabelText('Mail password').fill('hunter2');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateServerConfig).toHaveBeenCalledWith({
			publicSignupEnabled: true,
			mailPassword: 'hunter2'
		});
	});

	it('fills in and saves every remaining text field', async () => {
		vi.mocked(updateServerConfig).mockResolvedValue(
			state({
				mailHost: field('mail.example.com'),
				mailPort: field(2525),
				mailUsername: field('bot'),
				mailFromAddress: field('no-reply@everylist.app'),
				mailFromName: field('EveryList'),
				alexaSkillId: field('amzn1.ask.skill.xxx'),
				authentikTokenUrl: field('https://auth.example.com/token'),
				authentikUserinfoUrl: field('https://auth.example.com/userinfo'),
				authentikClientId: field('client-id')
			})
		);

		render(ServerSettingsPage);
		await page.getByLabelText('Mail host').fill('mail.example.com');
		await page.getByLabelText('Mail port').fill('2525');
		await page.getByLabelText('Mail username').fill('bot');
		await page.getByLabelText('Mail from address').fill('no-reply@everylist.app');
		await page.getByLabelText('Mail from name').fill('EveryList');
		await page.getByLabelText('Alexa skill ID').fill('amzn1.ask.skill.xxx');
		await page.getByLabelText('Authentik token URL').fill('https://auth.example.com/token');
		await page.getByLabelText('Authentik userinfo URL').fill('https://auth.example.com/userinfo');
		await page.getByLabelText('Authentik client ID').fill('client-id');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateServerConfig).toHaveBeenCalledWith({
			publicSignupEnabled: true,
			mailHost: 'mail.example.com',
			mailPort: 2525,
			mailUsername: 'bot',
			mailFromAddress: 'no-reply@everylist.app',
			mailFromName: 'EveryList',
			alexaSkillId: 'amzn1.ask.skill.xxx',
			authentikTokenUrl: 'https://auth.example.com/token',
			authentikUserinfoUrl: 'https://auth.example.com/userinfo',
			authentikClientId: 'client-id'
		});
	});

	it('locks every field individually when its source is env, and omits it from the payload', async () => {
		vi.mocked(fetchServerConfig).mockResolvedValue(
			state({
				mailHost: field('mail.example.com', 'env'),
				mailPort: field(2525, 'env'),
				mailUsername: field('bot', 'env'),
				mailPassword: secretField(true, 'env'),
				mailFromAddress: field('no-reply@everylist.app', 'env'),
				mailFromName: field('EveryList', 'env'),
				alexaSkillId: field('amzn1.ask.skill.xxx', 'env'),
				authentikTokenUrl: field('https://auth.example.com/token', 'env'),
				authentikUserinfoUrl: field('https://auth.example.com/userinfo', 'env'),
				authentikClientId: field('client-id', 'env'),
				authentikClientSecret: secretField(true, 'env')
			})
		);
		vi.mocked(updateServerConfig).mockResolvedValue(state());

		render(ServerSettingsPage);
		await expect.element(page.getByLabelText('Mail host')).toBeDisabled();
		await expect.element(page.getByLabelText('Mail port')).toBeDisabled();
		await expect.element(page.getByLabelText('Mail username')).toBeDisabled();
		await expect.element(page.getByLabelText('Mail password')).toBeDisabled();
		await expect.element(page.getByLabelText('Mail from address')).toBeDisabled();
		await expect.element(page.getByLabelText('Mail from name')).toBeDisabled();
		await expect.element(page.getByLabelText('Alexa skill ID')).toBeDisabled();
		await expect.element(page.getByLabelText('Authentik token URL')).toBeDisabled();
		await expect.element(page.getByLabelText('Authentik userinfo URL')).toBeDisabled();
		await expect.element(page.getByLabelText('Authentik client ID')).toBeDisabled();
		await expect.element(page.getByLabelText('Authentik client secret')).toBeDisabled();

		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateServerConfig).toHaveBeenCalledWith({ publicSignupEnabled: true });
	});

	it('fills in and saves the App URL and Authentik client secret when unlocked', async () => {
		vi.mocked(fetchServerConfig).mockResolvedValue(state({ appUrl: field(null) }));
		vi.mocked(updateServerConfig).mockResolvedValue(
			state({
				appUrl: field('https://list.example.com'),
				authentikClientSecret: secretField(true)
			})
		);

		render(ServerSettingsPage);
		await expect.element(page.getByLabelText('App URL')).not.toBeDisabled();
		await page.getByLabelText('App URL').fill('https://list.example.com');
		await page.getByLabelText('Authentik client secret').fill('sekret');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateServerConfig).toHaveBeenCalledWith({
			publicSignupEnabled: true,
			appUrl: 'https://list.example.com',
			authentikClientSecret: 'sekret'
		});
	});

	it('shows the ApiError message when saving fails', async () => {
		vi.mocked(updateServerConfig).mockRejectedValue(new ApiError(400, 'Locked by env'));

		render(ServerSettingsPage);
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Locked by env')).toBeInTheDocument();
	});

	it('shows a generic error message when saving fails without an ApiError', async () => {
		vi.mocked(updateServerConfig).mockRejectedValue(new TypeError('network down'));

		render(ServerSettingsPage);
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Failed to save server settings.')).toBeInTheDocument();
	});
});
