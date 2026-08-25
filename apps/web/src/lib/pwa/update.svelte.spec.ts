import { afterEach, describe, expect, it } from 'vitest';
import { checkForUpdate, setUpdateRegistration } from './update';

afterEach(() => {
	setUpdateRegistration(undefined);
});

describe('checkForUpdate', () => {
	it('returns "unavailable" when no registration has been set yet', async () => {
		await expect(checkForUpdate()).resolves.toBe('unavailable');
	});

	it('returns "up-to-date" when the update check finds nothing new', async () => {
		setUpdateRegistration({
			update: async () => {},
			installing: null,
			waiting: null
		} as unknown as ServiceWorkerRegistration);

		await expect(checkForUpdate()).resolves.toBe('up-to-date');
	});

	it('returns "updating" when the update check finds an installing worker', async () => {
		setUpdateRegistration({
			update: async () => {},
			installing: {} as ServiceWorker,
			waiting: null
		} as unknown as ServiceWorkerRegistration);

		await expect(checkForUpdate()).resolves.toBe('updating');
	});

	it('returns "updating" when the update check finds a waiting worker', async () => {
		setUpdateRegistration({
			update: async () => {},
			installing: null,
			waiting: {} as ServiceWorker
		} as unknown as ServiceWorkerRegistration);

		await expect(checkForUpdate()).resolves.toBe('updating');
	});
});
