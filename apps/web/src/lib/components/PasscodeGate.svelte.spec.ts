import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ListDto } from '@everylist/shared';
import type { BiometryAvailability } from '$lib/biometrics';
import { buildPasscodeHash } from '$lib/passcode';
import PasscodeGate from './PasscodeGate.svelte';

// The gate consumes $lib/biometrics's typed results, so the mock returns those
// shapes directly (same seam as orientation.svelte.spec.ts mocking the plugin
// under orientation.ts) — biometrics.spec.ts covers the module's own matrix.
vi.mock('$lib/biometrics', () => ({
	checkBiometry: vi.fn(),
	authenticateWithBiometrics: vi.fn()
}));

const { checkBiometry, authenticateWithBiometrics } = await import('$lib/biometrics');

const baseList: ListDto = {
	id: 1,
	name: 'Groceries',
	color: '#3b82f6',
	icon: 'basket',
	ownerId: 1,
	folderId: null,
	badgeExcluded: false,
	passcodeHash: null,
	archived: false,
	itemCount: 0,
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null,
	version: 1
};

function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('PasscodeGate.svelte', () => {
	// Call-count assertions below (prompt once per appearance, never on web,
	// nothing after unmount) need a clean slate per test.
	afterEach(() => {
		vi.clearAllMocks();
	});

	beforeEach(() => {
		// Web-like defaults: no biometry, so the pre-existing PIN-form tests run
		// exactly as they did before the auto-prompt existed.
		vi.mocked(checkBiometry).mockResolvedValue({ available: false, biometryType: 'none' });
		vi.mocked(authenticateWithBiometrics).mockResolvedValue('cancelled');
	});

	it('unlocks and calls onunlock for the correct PIN', async () => {
		const passcodeHash = await buildPasscodeHash('1234');
		const onunlock = vi.fn();
		render(PasscodeGate, { list: { ...baseList, passcodeHash }, onunlock });

		await page.getByLabelText('Passcode').fill('1234');
		await page.getByRole('button', { name: 'Unlock' }).click();

		await expect.element(page.getByText('Incorrect passcode.')).not.toBeInTheDocument();
		expect(onunlock).toHaveBeenCalled();
	});

	it('shows an error and clears the field for the wrong PIN', async () => {
		const passcodeHash = await buildPasscodeHash('1234');
		const onunlock = vi.fn();
		render(PasscodeGate, { list: { ...baseList, passcodeHash }, onunlock });

		const input = page.getByLabelText('Passcode');
		await input.fill('9999');
		await page.getByRole('button', { name: 'Unlock' }).click();

		await expect.element(page.getByText('Incorrect passcode.')).toBeInTheDocument();
		await expect.element(input).toHaveValue('');
		expect(onunlock).not.toHaveBeenCalled();
	});

	it('disables the Unlock button until a PIN is entered', async () => {
		render(PasscodeGate, {
			list: { ...baseList, passcodeHash: await buildPasscodeHash('1234') },
			onunlock: vi.fn()
		});

		await expect.element(page.getByRole('button', { name: 'Unlock' })).toBeDisabled();
	});

	it('ignores a raw submit with only whitespace', async () => {
		const onunlock = vi.fn();
		render(PasscodeGate, {
			list: { ...baseList, passcodeHash: await buildPasscodeHash('1234') },
			onunlock
		});

		const input = page.getByLabelText('Passcode');
		const form = input.element().closest('form');
		await input.fill('   ');
		form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		expect(onunlock).not.toHaveBeenCalled();
	});

	it('never prompts for biometrics on the web', async () => {
		const passcodeHash = await buildPasscodeHash('1234');
		render(PasscodeGate, { list: { ...baseList, passcodeHash }, onunlock: vi.fn() });

		// The availability check itself runs (and reports unavailable) — it's
		// the native prompt that must never follow.
		await vi.waitFor(() => expect(checkBiometry).toHaveBeenCalled());
		await flushMicrotasks();

		expect(authenticateWithBiometrics).not.toHaveBeenCalled();
	});

	// Every biometry kind exercises the prompt copy's label derivation — the
	// gate renders each label instance separately, so all of them run here.
	it.each([
		['face', 'Unlock with Face ID…'],
		['fingerprint', 'Unlock with Fingerprint…'],
		['none', 'Unlock with Biometrics…']
	] as const)(
		'auto-prompts once on native with enrolled %s biometry and names it',
		async (biometryType, promptCopy) => {
			vi.mocked(checkBiometry).mockResolvedValue({
				available: true,
				biometryType
			} satisfies BiometryAvailability);
			let resolveAuth:
				((outcome: 'success' | 'cancelled' | 'failed' | 'unavailable') => void) | undefined;
			vi.mocked(authenticateWithBiometrics).mockImplementation(
				() =>
					new Promise((resolve) => {
						resolveAuth = resolve;
					})
			);
			const passcodeHash = await buildPasscodeHash('1234');
			render(PasscodeGate, { list: { ...baseList, passcodeHash }, onunlock: vi.fn() });

			// The 250ms pre-prompt delay aside, the prompt must arrive on its own.
			await vi.waitFor(() =>
				expect(authenticateWithBiometrics).toHaveBeenCalledWith('Unlock this list')
			);
			await expect.element(page.getByText(promptCopy)).toBeInTheDocument();

			resolveAuth?.('cancelled');

			await expect.element(page.getByText(promptCopy)).not.toBeInTheDocument();
		}
	);

	it('unlocks via biometric success', async () => {
		vi.mocked(checkBiometry).mockResolvedValue({
			available: true,
			biometryType: 'face'
		} satisfies BiometryAvailability);
		vi.mocked(authenticateWithBiometrics).mockResolvedValue('success');
		const passcodeHash = await buildPasscodeHash('1234');
		const onunlock = vi.fn();
		render(PasscodeGate, { list: { ...baseList, passcodeHash }, onunlock });

		await vi.waitFor(() => expect(onunlock).toHaveBeenCalled());
	});

	it('falls back silently to the PIN form on cancel', async () => {
		vi.mocked(checkBiometry).mockResolvedValue({
			available: true,
			biometryType: 'fingerprint'
		} satisfies BiometryAvailability);
		vi.mocked(authenticateWithBiometrics).mockResolvedValue('cancelled');
		const passcodeHash = await buildPasscodeHash('1234');
		const onunlock = vi.fn();
		render(PasscodeGate, { list: { ...baseList, passcodeHash }, onunlock });

		await vi.waitFor(() => expect(authenticateWithBiometrics).toHaveBeenCalled());
		await expect.element(page.getByText("didn't work")).not.toBeInTheDocument();
		await expect.element(page.getByText('Incorrect passcode.')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Unlock' })).toBeInTheDocument();

		// A cancel suppresses further auto-prompts until the next gate
		// appearance — give any (wrong) re-prompt time to show up.
		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(authenticateWithBiometrics).toHaveBeenCalledTimes(1);
		expect(onunlock).not.toHaveBeenCalled();
	});

	it.each([
		['face', "Face ID unlock didn't work. Enter the passcode."],
		['fingerprint', "Fingerprint unlock didn't work. Enter the passcode."],
		['none', "Biometrics unlock didn't work. Enter the passcode."]
	] as const)('shows an error naming %s on failure', async (biometryType, errorCopy) => {
		vi.mocked(checkBiometry).mockResolvedValue({
			available: true,
			biometryType
		} satisfies BiometryAvailability);
		vi.mocked(authenticateWithBiometrics).mockResolvedValue('failed');
		const passcodeHash = await buildPasscodeHash('1234');
		const onunlock = vi.fn();
		render(PasscodeGate, { list: { ...baseList, passcodeHash }, onunlock });

		await expect.element(page.getByText(errorCopy)).toBeInTheDocument();
		expect(onunlock).not.toHaveBeenCalled();
		await expect.element(page.getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
	});

	it('re-prompts after a re-lock remounts the gate', async () => {
		vi.mocked(checkBiometry).mockResolvedValue({
			available: true,
			biometryType: 'face'
		} satisfies BiometryAvailability);
		let resolveAuth:
			((outcome: 'success' | 'cancelled' | 'failed' | 'unavailable') => void) | undefined;
		vi.mocked(authenticateWithBiometrics).mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveAuth = resolve;
				})
		);
		const passcodeHash = await buildPasscodeHash('1234');
		const props = { list: { ...baseList, passcodeHash }, onunlock: vi.fn() };

		// First gate appearance (initial open) — cancelled, gate stays up.
		const first = render(PasscodeGate, props);
		await vi.waitFor(() => expect(authenticateWithBiometrics).toHaveBeenCalledTimes(1));
		resolveAuth?.('cancelled');
		await flushMicrotasks();

		// Background re-lock: the parent page unmounts the gate and mounts a
		// fresh one — which must prompt again.
		first.unmount();
		render(PasscodeGate, props);
		await vi.waitFor(() => expect(authenticateWithBiometrics).toHaveBeenCalledTimes(2));
		resolveAuth?.('cancelled');
	});

	it('does nothing when the gate unmounts while availability is being checked', async () => {
		let resolveCheck: ((info: BiometryAvailability) => void) | undefined;
		vi.mocked(checkBiometry).mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveCheck = resolve;
				})
		);
		const passcodeHash = await buildPasscodeHash('1234');
		const { unmount } = render(PasscodeGate, {
			list: { ...baseList, passcodeHash },
			onunlock: vi.fn()
		});
		unmount();

		resolveCheck?.({ available: true, biometryType: 'face' });
		await flushMicrotasks();

		expect(authenticateWithBiometrics).not.toHaveBeenCalled();
	});

	it('does not prompt when the gate unmounts during the pre-prompt delay', async () => {
		vi.mocked(checkBiometry).mockResolvedValue({
			available: true,
			biometryType: 'face'
		} satisfies BiometryAvailability);
		const passcodeHash = await buildPasscodeHash('1234');
		const { unmount } = render(PasscodeGate, {
			list: { ...baseList, passcodeHash },
			onunlock: vi.fn()
		});
		await flushMicrotasks();
		unmount();

		// Outlive the 250ms delay — the pending prompt timer fires into a
		// disposed gate and must not prompt.
		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(authenticateWithBiometrics).not.toHaveBeenCalled();
	});

	it('ignores a late success when the gate unmounted while prompting', async () => {
		vi.mocked(checkBiometry).mockResolvedValue({
			available: true,
			biometryType: 'face'
		} satisfies BiometryAvailability);
		let resolveAuth:
			((outcome: 'success' | 'cancelled' | 'failed' | 'unavailable') => void) | undefined;
		vi.mocked(authenticateWithBiometrics).mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveAuth = resolve;
				})
		);
		const passcodeHash = await buildPasscodeHash('1234');
		const onunlock = vi.fn();
		const { unmount } = render(PasscodeGate, { list: { ...baseList, passcodeHash }, onunlock });
		await vi.waitFor(() => expect(authenticateWithBiometrics).toHaveBeenCalled());
		unmount();

		resolveAuth?.('success');
		await flushMicrotasks();

		expect(onunlock).not.toHaveBeenCalled();
	});
});
