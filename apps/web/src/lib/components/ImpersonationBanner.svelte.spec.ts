import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/impersonation.svelte', () => ({
	impersonatedLabel: vi.fn(),
	stopImpersonation: vi.fn()
}));

const { goto } = await import('$app/navigation');
const { impersonatedLabel, stopImpersonation } = await import('$lib/api/impersonation.svelte');
const ImpersonationBanner = (await import('./ImpersonationBanner.svelte')).default;

describe('ImpersonationBanner.svelte', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('renders nothing when not impersonating', async () => {
		vi.mocked(impersonatedLabel).mockReturnValue(null);

		render(ImpersonationBanner);

		await expect.element(page.getByRole('button', { name: 'Exit' })).not.toBeInTheDocument();
	});

	it('names the impersonated user and exits back to the admin page', async () => {
		vi.mocked(impersonatedLabel).mockReturnValue('Grace Hopper');
		vi.mocked(stopImpersonation).mockResolvedValue();

		render(ImpersonationBanner);
		await expect.element(page.getByText('Grace Hopper')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Exit' }).click();

		expect(stopImpersonation).toHaveBeenCalled();
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});
});
