import { describe, expect, it } from 'vitest';
import {
	disableDeadlineNotifications,
	getDeadlineNotificationsPreference,
	resyncDeadlineNotifications
} from './sync';

// Plain node spec — no `window`, mirroring shake.spec.ts's SSR-guard coverage.
describe('deadline notifications preference without window', () => {
	it('getDeadlineNotificationsPreference is false', () => {
		expect(getDeadlineNotificationsPreference()).toBe(false);
	});

	it('resyncDeadlineNotifications does not throw (unsupported platform, no window)', async () => {
		await expect(resyncDeadlineNotifications()).resolves.toBeUndefined();
	});

	it('disableDeadlineNotifications does not throw with no window (unsupported platform)', async () => {
		await expect(disableDeadlineNotifications()).resolves.toBeUndefined();
	});
});
