import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemDto, ListDto } from '@everylist/shared';

vi.mock('@capacitor/local-notifications', () => ({
	LocalNotifications: {
		checkPermissions: vi.fn(),
		requestPermissions: vi.fn(),
		getPending: vi.fn(),
		schedule: vi.fn(),
		cancel: vi.fn()
	}
}));

const { LocalNotifications } = await import('@capacitor/local-notifications');
const {
	requestNativeNotificationPermission,
	syncNativeDeadlineNotifications,
	cancelAllNativeDeadlineNotifications
} = await import('./native');

function makeList(overrides: Partial<ListDto> = {}): ListDto {
	return {
		id: 1,
		name: 'Chores',
		color: '#000',
		icon: null,
		ownerId: 1,
		useDeadline: true,
		...overrides
	} as ListDto;
}

function makeItem(overrides: Partial<ItemDto> = {}): ItemDto {
	return {
		id: 1,
		listId: 1,
		name: 'Return library book',
		quantity: null,
		notes: null,
		categoryId: null,
		storeId: null,
		price: null,
		deadline: '2026-09-06T09:00',
		checked: false,
		checkedAt: null,
		sortOrder: 0,
		createdBy: 1,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: null,
		deletedAt: null,
		version: 1,
		...overrides
	};
}

afterEach(() => {
	vi.clearAllMocks();
});

describe('requestNativeNotificationPermission', () => {
	it('is true without prompting when already granted', async () => {
		vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'granted' });

		expect(await requestNativeNotificationPermission()).toBe(true);
		expect(LocalNotifications.requestPermissions).not.toHaveBeenCalled();
	});

	it('prompts and reflects the result when not yet granted', async () => {
		vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'prompt' });
		vi.mocked(LocalNotifications.requestPermissions).mockResolvedValue({ display: 'granted' });

		expect(await requestNativeNotificationPermission()).toBe(true);
	});

	it('is false when permission is denied', async () => {
		vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'prompt' });
		vi.mocked(LocalNotifications.requestPermissions).mockResolvedValue({ display: 'denied' });

		expect(await requestNativeNotificationPermission()).toBe(false);
	});
});

describe('syncNativeDeadlineNotifications', () => {
	const now = new Date(2026, 8, 5, 12, 0);

	it('schedules due items and cancels pending ones no longer due', async () => {
		vi.mocked(LocalNotifications.getPending).mockResolvedValue({
			notifications: [
				{ id: 1, title: '', body: '' } as never,
				{ id: 99, title: '', body: '' } as never
			]
		});

		const list = makeList();
		const item = makeItem({ id: 1 });
		await syncNativeDeadlineNotifications([list], new Map([[1, [item]]]), now);

		expect(LocalNotifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: 99 }] });
		expect(LocalNotifications.schedule).toHaveBeenCalledWith({
			notifications: [
				{
					id: 1,
					title: 'Required by',
					body: 'Return library book',
					schedule: { at: new Date(2026, 8, 6, 9, 0) },
					extra: { listId: 1, itemId: 1 }
				}
			]
		});
	});

	it('does not call schedule when nothing is due', async () => {
		vi.mocked(LocalNotifications.getPending).mockResolvedValue({ notifications: [] });

		await syncNativeDeadlineNotifications([makeList()], new Map(), now);

		expect(LocalNotifications.schedule).not.toHaveBeenCalled();
	});

	it('does not call cancel when nothing pending is stale', async () => {
		vi.mocked(LocalNotifications.getPending).mockResolvedValue({ notifications: [] });
		const list = makeList();
		const item = makeItem({ id: 1 });

		await syncNativeDeadlineNotifications([list], new Map([[1, [item]]]), now);

		expect(LocalNotifications.cancel).not.toHaveBeenCalled();
	});
});

describe('cancelAllNativeDeadlineNotifications', () => {
	it('cancels every pending notification', async () => {
		vi.mocked(LocalNotifications.getPending).mockResolvedValue({
			notifications: [{ id: 1 } as never, { id: 2 } as never]
		});

		await cancelAllNativeDeadlineNotifications();

		expect(LocalNotifications.cancel).toHaveBeenCalledWith({
			notifications: [{ id: 1 }, { id: 2 }]
		});
	});

	it('does nothing when nothing is pending', async () => {
		vi.mocked(LocalNotifications.getPending).mockResolvedValue({ notifications: [] });

		await cancelAllNativeDeadlineNotifications();

		expect(LocalNotifications.cancel).not.toHaveBeenCalled();
	});
});
