import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemDto, ListDto } from '@everylist/shared';

vi.mock('@capacitor/local-notifications', () => ({
	LocalNotifications: {
		checkPermissions: vi.fn(),
		requestPermissions: vi.fn(),
		getPending: vi.fn(),
		schedule: vi.fn(),
		cancel: vi.fn(),
		registerActionTypes: vi.fn(),
		addListener: vi.fn()
	}
}));

vi.mock('$lib/api/items', () => ({
	fetchItems: vi.fn(),
	updateItem: vi.fn()
}));

const { LocalNotifications } = await import('@capacitor/local-notifications');
const { fetchItems, updateItem } = await import('$lib/api/items');
const {
	requestNativeNotificationPermission,
	syncNativeDeadlineNotifications,
	cancelAllNativeDeadlineNotifications,
	registerNativeDeadlineActionTypes,
	listenForNativeDeadlineActions
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
				{ id: 1, title: '', body: '', extra: { source: 'deadline' } } as never,
				{ id: 99, title: '', body: '', extra: { source: 'deadline' } } as never
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
					actionTypeId: 'deadline',
					extra: { listId: 1, itemId: 1, source: 'deadline' }
				}
			]
		});
	});

	it('never cancels a pending notification scheduled by some other feature', async () => {
		vi.mocked(LocalNotifications.getPending).mockResolvedValue({
			notifications: [{ id: 99, title: '', body: '', extra: { source: 'something-else' } } as never]
		});

		await syncNativeDeadlineNotifications([makeList()], new Map(), now);

		expect(LocalNotifications.cancel).not.toHaveBeenCalled();
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
	it('cancels every pending deadline notification', async () => {
		vi.mocked(LocalNotifications.getPending).mockResolvedValue({
			notifications: [
				{ id: 1, extra: { source: 'deadline' } } as never,
				{ id: 2, extra: { source: 'deadline' } } as never
			]
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

	it("leaves another feature's pending notifications untouched", async () => {
		vi.mocked(LocalNotifications.getPending).mockResolvedValue({
			notifications: [{ id: 1, extra: { source: 'something-else' } } as never]
		});

		await cancelAllNativeDeadlineNotifications();

		expect(LocalNotifications.cancel).not.toHaveBeenCalled();
	});
});

describe('registerNativeDeadlineActionTypes', () => {
	it('registers the Complete/Snooze action type', async () => {
		await registerNativeDeadlineActionTypes();

		expect(LocalNotifications.registerActionTypes).toHaveBeenCalledWith({
			types: [
				{
					id: 'deadline',
					actions: [
						{ id: 'complete', title: 'Complete' },
						{ id: 'snooze', title: 'Snooze 1 hr' }
					]
				}
			]
		});
	});
});

describe('listenForNativeDeadlineActions', () => {
	function performedNotification(overrides: { source?: string } = {}) {
		return {
			id: 1,
			title: '',
			body: '',
			extra: { listId: 1, itemId: 1, source: 'deadline', ...overrides }
		};
	}

	async function fireAction(actionId: string, notification = performedNotification()) {
		listenForNativeDeadlineActions();
		const handler = vi.mocked(LocalNotifications.addListener).mock.calls[0][1] as (
			action: unknown
		) => void;
		handler({ actionId, notification });
		// The handler's own work is async but fire-and-forget (void) — flush microtasks.
		await Promise.resolve();
		await Promise.resolve();
	}

	it('checks off the item and cancels its notification on "complete"', async () => {
		vi.mocked(updateItem).mockResolvedValue(undefined);

		await fireAction('complete');

		expect(updateItem).toHaveBeenCalledWith(1, 1, { checked: true });
		expect(LocalNotifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }] });
	});

	it('pushes the deadline forward an hour and reschedules on "snooze"', async () => {
		const item = makeItem({ id: 1, deadline: '2026-09-06T09:00' });
		vi.mocked(fetchItems).mockResolvedValue([item]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		await fireAction('snooze');

		expect(updateItem).toHaveBeenCalledWith(1, 1, { deadline: '2026-09-06T10:00' });
		expect(LocalNotifications.schedule).toHaveBeenCalledWith({
			notifications: [
				{
					id: 1,
					title: 'Required by',
					body: 'Return library book',
					schedule: { at: new Date(2026, 8, 6, 10, 0) },
					actionTypeId: 'deadline',
					extra: { listId: 1, itemId: 1, source: 'deadline' }
				}
			]
		});
	});

	it('ignores an action on a notification from some other feature', async () => {
		await fireAction('complete', performedNotification({ source: 'something-else' }));

		expect(updateItem).not.toHaveBeenCalled();
	});

	it('ignores the plain tap-to-open action', async () => {
		await fireAction('tap');

		expect(updateItem).not.toHaveBeenCalled();
		expect(fetchItems).not.toHaveBeenCalled();
	});
});
