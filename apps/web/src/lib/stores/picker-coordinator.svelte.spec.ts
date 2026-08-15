import { describe, expect, it } from 'vitest';
import { pickerCoordinator } from './picker-coordinator.svelte';

describe('pickerCoordinator', () => {
	it('has no active picker by default', () => {
		expect(pickerCoordinator.activeId).toBeNull();
	});

	it('open() makes the given id active, closing whatever was open before', () => {
		const a = Symbol('a');
		const b = Symbol('b');

		pickerCoordinator.open(a);
		expect(pickerCoordinator.activeId).toBe(a);

		pickerCoordinator.open(b);
		expect(pickerCoordinator.activeId).toBe(b);
	});

	it('close() clears the id only when it is the one currently active', () => {
		const a = Symbol('a');
		const b = Symbol('b');

		pickerCoordinator.open(a);
		pickerCoordinator.close(b);
		expect(pickerCoordinator.activeId).toBe(a);

		pickerCoordinator.close(a);
		expect(pickerCoordinator.activeId).toBeNull();
	});

	it('toggle() opens a closed id and closes an already-open one', () => {
		const a = Symbol('a');

		pickerCoordinator.toggle(a);
		expect(pickerCoordinator.activeId).toBe(a);

		pickerCoordinator.toggle(a);
		expect(pickerCoordinator.activeId).toBeNull();
	});
});
