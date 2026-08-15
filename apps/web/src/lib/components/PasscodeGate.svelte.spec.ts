import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ListDto } from '@everylist/shared';
import { buildPasscodeHash } from '$lib/passcode';
import PasscodeGate from './PasscodeGate.svelte';

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

describe('PasscodeGate.svelte', () => {
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
});
