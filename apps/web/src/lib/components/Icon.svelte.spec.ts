import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Icon from './Icon.svelte';

describe('Icon.svelte', () => {
	it('renders real @mdi/js path data for a known icon name', async () => {
		const { container } = render(Icon, { name: 'cheese' });

		await expect.poll(() => container.querySelector('path')?.getAttribute('d')).not.toBeNull();
	});

	it('falls back to a generic glyph for an unknown icon name', async () => {
		const { container } = render(Icon, { name: 'this-icon-does-not-exist' });

		await expect.poll(() => container.querySelector('path')?.getAttribute('d')).not.toBeNull();
		const fallbackPath = container.querySelector('path')?.getAttribute('d');

		const known = render(Icon, { name: 'cheese' });
		await expect
			.poll(() => known.container.querySelector('path')?.getAttribute('d'))
			.not.toBe(fallbackPath);
	});
});
