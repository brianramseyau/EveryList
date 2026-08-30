import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { registerUndo } from '$lib/undo';
import { setShakeToUndoPreference, stopShakeListening } from '$lib/shake';
import ShakeRepromptBanner from './ShakeRepromptBanner.svelte';

// Runs against the real $lib/shake module (like settings/+page.svelte.spec.ts's shake-to-undo
// suite) rather than mocking it — a mocked startShakeListening would never invoke the callback
// this component hands it, leaving that closure permanently uncovered.
describe('ShakeRepromptBanner.svelte', () => {
	afterEach(() => {
		stopShakeListening();
		window.localStorage.removeItem('everylist:shakeToUndo');
		delete (window.DeviceMotionEvent as unknown as { requestPermission?: unknown })
			.requestPermission;
	});

	it('renders nothing when shake to undo is off', async () => {
		setShakeToUndoPreference(false);

		render(ShakeRepromptBanner);

		await expect.element(page.getByRole('button', { name: 'Enable' })).not.toBeInTheDocument();
	});

	it('renders nothing outside iOS Safari, where preference "on" already means actively listening', async () => {
		setShakeToUndoPreference(true);

		render(ShakeRepromptBanner);

		await expect.element(page.getByRole('button', { name: 'Enable' })).not.toBeInTheDocument();
	});

	it('shows the banner on iOS Safari when enabled but nothing is listening yet', async () => {
		(window.DeviceMotionEvent as unknown as { requestPermission: () => void }).requestPermission =
			vi.fn();
		setShakeToUndoPreference(true);

		render(ShakeRepromptBanner);

		await expect.element(page.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
	});

	it('tapping Enable requests permission, starts listening, and hides the banner', async () => {
		const requestPermission = vi.fn().mockResolvedValue('granted');
		(
			window.DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
		).requestPermission = requestPermission;
		setShakeToUndoPreference(true);
		const undo = vi.fn(async () => {});

		render(ShakeRepromptBanner);
		await page.getByRole('button', { name: 'Enable' }).click();

		expect(requestPermission).toHaveBeenCalledOnce();
		await expect.element(page.getByRole('button', { name: 'Enable' })).not.toBeInTheDocument();

		registerUndo(undo);
		window.dispatchEvent(
			new DeviceMotionEvent('devicemotion', {
				accelerationIncludingGravity: { x: 30, y: 30, z: 30 }
			})
		);
		await expect.poll(() => undo.mock.calls.length).toBe(1);
	});

	it('tapping Enable when permission is denied hides the banner without starting to listen', async () => {
		(
			window.DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
		).requestPermission = vi.fn().mockResolvedValue('denied');
		setShakeToUndoPreference(true);

		render(ShakeRepromptBanner);
		await page.getByRole('button', { name: 'Enable' }).click();

		await expect.element(page.getByRole('button', { name: 'Enable' })).not.toBeInTheDocument();
	});

	it('tapping Dismiss hides the banner without requesting permission', async () => {
		const requestPermission = vi.fn();
		(window.DeviceMotionEvent as unknown as { requestPermission: () => void }).requestPermission =
			requestPermission;
		setShakeToUndoPreference(true);

		render(ShakeRepromptBanner);
		await page.getByRole('button', { name: 'Dismiss' }).click();

		expect(requestPermission).not.toHaveBeenCalled();
		await expect.element(page.getByRole('button', { name: 'Enable' })).not.toBeInTheDocument();
	});
});
