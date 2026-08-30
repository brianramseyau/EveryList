import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearUndo, registerUndo, resetUndoForTesting, runUndo } from './undo';

describe('undo', () => {
	afterEach(() => {
		resetUndoForTesting();
	});

	it('runUndo is a no-op when nothing is pending — e.g. a shake with no recent change', async () => {
		await expect(runUndo()).resolves.toBeUndefined();
	});

	it('runUndo runs the pending action and clears the slot', async () => {
		const action = vi.fn(async () => {});
		registerUndo(action);

		await runUndo();

		expect(action).toHaveBeenCalledOnce();
		await runUndo();
		expect(action).toHaveBeenCalledOnce();
	});

	it('a second registerUndo replaces the first — only the latest is undoable', async () => {
		const first = vi.fn(async () => {});
		const second = vi.fn(async () => {});
		registerUndo(first);
		registerUndo(second);

		await runUndo();

		expect(second).toHaveBeenCalledOnce();
		expect(first).not.toHaveBeenCalled();
	});

	it('clearUndo drops the pending action without running it', async () => {
		const action = vi.fn(async () => {});
		registerUndo(action);

		clearUndo();
		await runUndo();

		expect(action).not.toHaveBeenCalled();
	});
});
