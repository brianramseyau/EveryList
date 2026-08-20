import { page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	resetConnectivityForTesting,
	setServerUnavailableForTesting
} from '$lib/offline/connectivity.svelte';
import SyncStatusIcon from './SyncStatusIcon.svelte';

describe('SyncStatusIcon.svelte', () => {
	afterEach(() => {
		resetConnectivityForTesting();
	});

	it('renders nothing when the server is reachable', async () => {
		render(SyncStatusIcon);

		await expect
			.element(page.getByRole('link', { name: /Server unavailable/ }))
			.not.toBeInTheDocument();
	});

	it('shows the disconnected-cloud link when the server is unavailable', async () => {
		setServerUnavailableForTesting(true);

		render(SyncStatusIcon);

		await expect
			.element(page.getByRole('link', { name: 'Server unavailable — tap for sync status' }))
			.toBeInTheDocument();
	});
});
