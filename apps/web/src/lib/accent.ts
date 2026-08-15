export type AccentPreference = 'ocean' | 'forest' | 'berry' | 'sunset';

const STORAGE_KEY = 'everylist:accent';
const VALID_PREFERENCES: readonly AccentPreference[] = ['ocean', 'forest', 'berry', 'sunset'];

/** Guards every browser API access — this module runs during prerendering
 * (Node, no `window`) as well as in the browser, like $lib/theme.ts. */
function hasWindow(): boolean {
	return typeof window !== 'undefined';
}

function isAccentPreference(value: string | null): value is AccentPreference {
	return value !== null && (VALID_PREFERENCES as string[]).includes(value);
}

export function getAccentPreference(): AccentPreference {
	if (!hasWindow()) return 'ocean';
	const stored = window.localStorage.getItem(STORAGE_KEY);
	return isAccentPreference(stored) ? stored : 'ocean';
}

/** See routes/layout.css's [data-accent='...'] blocks — the palette itself
 * lives entirely in CSS custom properties, this just picks which. */
export function applyAccent(preference: AccentPreference): void {
	if (!hasWindow()) return;
	document.documentElement.setAttribute('data-accent', preference);
}

export function setAccentPreference(preference: AccentPreference): void {
	if (!hasWindow()) return;
	window.localStorage.setItem(STORAGE_KEY, preference);
	applyAccent(preference);
}

/** Re-applies the stored preference — mirrors $lib/theme.ts's initTheme(),
 * in case app.html's inline bootstrap script and this module ever disagree. */
export function initAccent(): void {
	if (!hasWindow()) return;
	applyAccent(getAccentPreference());
}
