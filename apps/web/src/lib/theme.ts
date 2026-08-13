export type ThemePreference = 'automatic' | 'light' | 'dark';

const STORAGE_KEY = 'everylist:theme';
const VALID_PREFERENCES: readonly ThemePreference[] = ['automatic', 'light', 'dark'];

/** Guards every browser API access — this module runs during prerendering
 * (Node, no `window`) as well as in the browser, like $lib/api/token.ts. */
function hasWindow(): boolean {
	return typeof window !== 'undefined';
}

function isThemePreference(value: string | null): value is ThemePreference {
	return value !== null && (VALID_PREFERENCES as string[]).includes(value);
}

export function getThemePreference(): ThemePreference {
	if (!hasWindow()) return 'automatic';
	const stored = window.localStorage.getItem(STORAGE_KEY);
	return isThemePreference(stored) ? stored : 'automatic';
}

function systemPrefersDark(): boolean {
	return hasWindow() && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(preference: ThemePreference): void {
	if (!hasWindow()) return;
	const isDark = preference === 'dark' || (preference === 'automatic' && systemPrefersDark());
	document.documentElement.classList.toggle('dark', isDark);
}

export function setThemePreference(preference: ThemePreference): void {
	if (!hasWindow()) return;
	window.localStorage.setItem(STORAGE_KEY, preference);
	applyTheme(preference);
}

let systemListenerAttached = false;

/** Re-applies the stored preference (in case app.html's inline bootstrap
 * script and this module ever disagree) and, once per page load, starts
 * listening for OS theme changes so "automatic" stays live while the app is
 * open, not just at the next full reload. */
export function initTheme(): void {
	if (!hasWindow()) return;
	applyTheme(getThemePreference());
	if (systemListenerAttached) return;
	systemListenerAttached = true;
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (getThemePreference() === 'automatic') applyTheme('automatic');
	});
}
