import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({ apiPost: vi.fn(), apiGet: vi.fn() }));
vi.mock('./token', () => ({ setToken: vi.fn() }));

const { apiPost, apiGet } = await import('./client');
const { setToken } = await import('./token');
const { completeSetup, fetchSetupStatus } = await import('./setup');

const setupResponse = {
	user: {
		id: 1,
		fullName: 'Ada Lovelace',
		email: 'ada@example.com',
		createdAt: '2026-08-01T00:00:00.000Z',
		updatedAt: null,
		initials: 'AL'
	},
	token: 'tok-123',
	backup: { frequency: 'weekly' as const, timeOfDay: '03:00', retentionCount: 4 }
};

describe('setup', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('fetchSetupStatus reads /api/v1/setup/status', async () => {
		vi.mocked(apiGet).mockResolvedValue({
			needsSetup: true,
			defaultBackupSettings: { frequency: 'weekly', timeOfDay: '03:00', retentionCount: 4 }
		});

		const status = await fetchSetupStatus();

		expect(apiGet).toHaveBeenCalledWith('/api/v1/setup/status');
		expect(status.needsSetup).toBe(true);
	});

	it('completeSetup posts the payload and stores the returned token', async () => {
		vi.mocked(apiPost).mockResolvedValue(setupResponse);

		const input = {
			fullName: 'Ada Lovelace',
			email: 'ada@example.com',
			password: 'password123',
			passwordConfirmation: 'password123',
			backup: { frequency: 'weekly' as const, timeOfDay: '03:00', retentionCount: 4 }
		};

		const result = await completeSetup(input);

		expect(apiPost).toHaveBeenCalledWith('/api/v1/setup', input);
		expect(setToken).toHaveBeenCalledWith('tok-123');
		expect(result).toEqual(setupResponse);
	});
});
