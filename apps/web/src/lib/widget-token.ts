/** Prefix of the PAT names the Android widget provisions itself (one per device). */
export const WIDGET_TOKEN_NAME_PREFIX = 'Home-screen widget';

/** The widget's PAT name for one install — the device id suffix keeps two phones on the same
 *  account from clobbering each other's token. */
export function widgetTokenName(deviceId: string): string {
	return `${WIDGET_TOKEN_NAME_PREFIX} (${deviceId})`;
}

/** Whether a PAT is app-managed (widget-provisioned) rather than user-created. */
export function isManagedToken(name: string | null): boolean {
	// The bare prefix is the name earlier versions gave every widget token; anything else must
	// carry the "(<deviceId>)" suffix so user names like "Home-screen widget backup" stay theirs.
	return (
		name === WIDGET_TOKEN_NAME_PREFIX ||
		(name?.startsWith(`${WIDGET_TOKEN_NAME_PREFIX} (`) ?? false)
	);
}
