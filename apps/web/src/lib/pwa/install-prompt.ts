/** Chromium-only — not in TS's DOM lib. Fired before the browser would otherwise show its own
 * install UI; capturing it lets the app offer install from a dedicated Settings row instead. */
export interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let availabilityListener: ((available: boolean) => void) | null = null;

/** Captures `beforeinstallprompt` into module state so it can be replayed later from a Settings
 * button click — the event must be handled synchronously within its own dispatch to stay valid,
 * so it can't just be awaited on demand. Call once, e.g. from the root layout. */
export function initInstallPrompt(): void {
	if (typeof window === 'undefined') return;

	window.addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault();
		deferredPrompt = event as BeforeInstallPromptEvent;
		availabilityListener?.(true);
	});

	window.addEventListener('appinstalled', () => {
		deferredPrompt = null;
		availabilityListener?.(false);
	});
}

/** InstallPrompt.svelte subscribes here to know when to render its "Install" row. */
export function onInstallAvailabilityChange(listener: ((available: boolean) => void) | null): void {
	availabilityListener = listener;
}

export function hasDeferredInstallPrompt(): boolean {
	return deferredPrompt !== null;
}

/** Replays the captured prompt; a no-op if none was ever captured (already installed, or a
 * browser — like iOS Safari — that never fires `beforeinstallprompt` at all). */
export async function promptInstall(): Promise<void> {
	if (!deferredPrompt) return;
	await deferredPrompt.prompt();
	await deferredPrompt.userChoice;
	deferredPrompt = null;
}

/** True once installed and launched as a standalone app — covers both the standard
 * `display-mode` media query and iOS Safari's separate `navigator.standalone` flag. */
export function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;
	const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
	return window.matchMedia('(display-mode: standalone)').matches || iosStandalone === true;
}

/** iOS Safari never fires `beforeinstallprompt` — it needs the manual "Add to Home Screen" hint
 * instead. Excludes Chrome/Firefox-on-iOS, which report an iOS-flavored UA but aren't Safari.
 * Node has had a built-in `navigator` global since v21, so — unlike `window` — there's no
 * SSR-guard branch to test here; `navigator.userAgent` is always defined. */
export function isIOSSafari(): boolean {
	const ua = navigator.userAgent;
	return /iP(hone|od|ad)/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

/** Test-only: drops all module-level state between specs. */
export function resetInstallPromptForTesting(): void {
	deferredPrompt = null;
	availabilityListener = null;
}
