export type ProgressDisplayPreference = 'remaining' | 'done';

const STORAGE_KEY = 'everylist:progressDisplay';
const VALID_PREFERENCES: readonly ProgressDisplayPreference[] = ['remaining', 'done'];

function hasWindow(): boolean {
	return typeof window !== 'undefined';
}

function isProgressDisplayPreference(value: string | null): value is ProgressDisplayPreference {
	return value !== null && (VALID_PREFERENCES as string[]).includes(value);
}

export function getProgressDisplayPreference(): ProgressDisplayPreference {
	if (!hasWindow()) return 'remaining';
	const stored = window.localStorage.getItem(STORAGE_KEY);
	return isProgressDisplayPreference(stored) ? stored : 'remaining';
}

export function setProgressDisplayPreference(preference: ProgressDisplayPreference): void {
	if (!hasWindow()) return;
	window.localStorage.setItem(STORAGE_KEY, preference);
}
