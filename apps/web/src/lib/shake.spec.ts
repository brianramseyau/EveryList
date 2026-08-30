import { describe, expect, it, vi } from 'vitest';
import {
	createShakeDetector,
	getShakeToUndoPreference,
	initShakeToUndo,
	needsShakePermissionPrompt,
	requestShakePermission,
	setShakeToUndoPreference,
	startShakeListening,
	stopShakeListening
} from './shake';

// Runs in the "server" (node) project, which has no `window` — exercises the SSR/prerendering
// guard on every export, same rationale as orientation.spec.ts. See shake.svelte.spec.ts for real
// browser sensor/permission behavior.
describe('shake (no window)', () => {
	it('getShakeToUndoPreference defaults to enabled', () => {
		expect(getShakeToUndoPreference()).toBe(true);
	});

	it('setShakeToUndoPreference, needsShakePermissionPrompt, requestShakePermission, start/stopShakeListening, and initShakeToUndo are no-ops without throwing', async () => {
		expect(() => setShakeToUndoPreference(false)).not.toThrow();
		expect(needsShakePermissionPrompt()).toBe(false);
		await expect(requestShakePermission()).resolves.toBe(true);
		expect(() => startShakeListening(() => {})).not.toThrow();
		expect(() => stopShakeListening()).not.toThrow();
		expect(() => initShakeToUndo(() => {})).not.toThrow();
	});
});

// createShakeDetector is a pure function with no browser dependency, so its own branches are
// covered here regardless of environment.
describe('createShakeDetector', () => {
	it('ignores a reading near resting (~1g)', () => {
		const onShake = vi.fn();
		const detector = createShakeDetector(onShake);

		detector.handleReading(0, 0, 9.80665, 1000);

		expect(onShake).not.toHaveBeenCalled();
	});

	it('fires once for a reading well above the threshold', () => {
		const onShake = vi.fn();
		const detector = createShakeDetector(onShake, { thresholdG: 1.8 });

		detector.handleReading(30, 30, 30, 1000);

		expect(onShake).toHaveBeenCalledOnce();
	});

	it('suppresses a second shake within the cooldown window', () => {
		const onShake = vi.fn();
		const detector = createShakeDetector(onShake, { thresholdG: 1.8, cooldownMs: 1000 });

		detector.handleReading(30, 30, 30, 1000);
		detector.handleReading(30, 30, 30, 1500);

		expect(onShake).toHaveBeenCalledOnce();
	});

	it('fires again once the cooldown has elapsed', () => {
		const onShake = vi.fn();
		const detector = createShakeDetector(onShake, { thresholdG: 1.8, cooldownMs: 1000 });

		detector.handleReading(30, 30, 30, 1000);
		detector.handleReading(30, 30, 30, 2001);

		expect(onShake).toHaveBeenCalledTimes(2);
	});

	it('defaults `now` to the current time when omitted', () => {
		const onShake = vi.fn();
		const detector = createShakeDetector(onShake, { thresholdG: 1.8 });

		detector.handleReading(30, 30, 30);

		expect(onShake).toHaveBeenCalledOnce();
	});
});
