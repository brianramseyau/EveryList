import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDto, ListDto } from '@everylist/shared';

vi.mock('@capacitor/local-notifications', () => ({
	LocalNotifications: {
		checkPermissions: vi.fn(),
		requestPermissions: vi.fn(),
		checkExactNotificationSetting: vi.fn(),
		changeExactNotificationSetting: vi.fn(),
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
	beforeEach(() => {
		vi.mocked(LocalNotifications.checkExactNotificationSetting).mockResolvedValue({
			exact_alarm: 'granted'
		});
	});

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
		expect(LocalNotifications.checkExactNotificationSetting).not.toHaveBeenCalled();
	});

	it('prompts for the exact-alarm setting when not yet granted, alongside display permission', async () => {
		vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'granted' });
		vi.mocked(LocalNotifications.checkExactNotificationSetting).mockResolvedValue({
			exact_alarm: 'prompt'
		});
		vi.mocked(LocalNotifications.changeExactNotificationSetting).mockResolvedValue({
			exact_alarm: 'granted'
		});

		expect(await requestNativeNotificationPermission()).toBe(true);
		expect(LocalNotifications.changeExactNotificationSetting).toHaveBeenCalled();
	});

	it('still returns true but logs a warning when the user declines the exact-alarm prompt', async () => {
		vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'granted' });
		vi.mocked(LocalNotifications.checkExactNotificationSetting).mockResolvedValue({
			exact_alarm: 'prompt'
		});
		vi.mocked(LocalNotifications.changeExactNotificationSetting).mockResolvedValue({
			exact_alarm: 'denied'
		});
		const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		expect(await requestNativeNotificationPermission()).toBe(true);
		expect(consoleWarn).toHaveBeenCalledWith(
			'Exact-alarm permission was not granted; deadline reminders may fire late.'
		);
		consoleWarn.mockRestore();
	});

	it('does not re-prompt for the exact-alarm setting when already granted', async () => {
		vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'granted' });

		expect(await requestNativeNotificationPermission()).toBe(true);
		expect(LocalNotifications.changeExactNotificationSetting).not.toHaveBeenCalled();
	});
});

describe('syncNativeDeadlineNotifications', () => {
	const now = new Date(2026, 8, 5, 12, 0);

	beforeEach(() => {
		vi.mocked(LocalNotifications.schedule).mockResolvedValue({ notifications: [] });
	});

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
					extra: { listId: 1, itemId: 1, source: 'deadline', deadline: '2026-09-06T09:00' }
				}
			]
		});
	});

	it('re-registers action types before scheduling, so a launch-time race with the once-per-launch registerActionTypes call in +layout.svelte can never drop the whole batch', async () => {
		const callOrder: string[] = [];
		vi.mocked(LocalNotifications.getPending).mockResolvedValue({ notifications: [] });
		vi.mocked(LocalNotifications.registerActionTypes).mockImplementation(async () => {
			callOrder.push('registerActionTypes');
		});
		vi.mocked(LocalNotifications.schedule).mockImplementation(async () => {
			callOrder.push('schedule');
			return { notifications: [] };
		});

		const list = makeList();
		const item = makeItem({ id: 1 });
		await syncNativeDeadlineNotifications([list], new Map([[1, [item]]]), now);

		expect(callOrder).toEqual(['registerActionTypes', 'schedule']);
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

	it('logs a warning when the plugin silently falls back to an inexact alarm', async () => {
		vi.mocked(LocalNotifications.getPending).mockResolvedValue({ notifications: [] });
		vi.mocked(LocalNotifications.schedule).mockResolvedValue({
			notifications: [{ id: 1 }],
			warning: { code: 'OS-PLUG-LNOT-0013', message: 'Scheduled inexactly' }
		});
		const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		await syncNativeDeadlineNotifications([makeList()], new Map([[1, [makeItem({ id: 1 })]]]), now);

		expect(consoleWarn).toHaveBeenCalledWith(
			'Deadline notification scheduled inexactly:',
			'Scheduled inexactly'
		);
		consoleWarn.mockRestore();
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
						{ id: 'complete', title: 'Complete', foreground: false },
						{ id: 'snooze', title: 'Snooze 1 hr', foreground: false }
					]
				}
			]
		});
	});
});

describe('listenForNativeDeadlineActions', () => {
	// snoozeFromNotification calls addHoursToDeadline with no explicit `now`, i.e. the real clock —
	// pinned here so its now-vs-deadline fallback (see deadline.spec.ts) doesn't make these
	// assertions dependent on the actual wall-clock time a CI run happens to execute at.
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 8, 5, 12, 0));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function performedNotification(overrides: { source?: string } = {}) {
		return {
			id: 1,
			title: '',
			body: '',
			extra: { listId: 1, itemId: 1, source: 'deadline', ...overrides }
		};
	}

	async function fireAction(
		actionId: string,
		notification = performedNotification(),
		onTap: (listId: number, itemId: number) => void = () => {}
	) {
		listenForNativeDeadlineActions(onTap);
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
					extra: { listId: 1, itemId: 1, source: 'deadline', deadline: '2026-09-06T10:00' }
				}
			]
		});
	});

	it('does nothing on "snooze" when the item has since lost its deadline (or was deleted)', async () => {
		vi.mocked(fetchItems).mockResolvedValue([makeItem({ id: 1, deadline: null })]);

		await fireAction('snooze');

		expect(updateItem).not.toHaveBeenCalled();
		expect(LocalNotifications.schedule).not.toHaveBeenCalled();
	});

	it('logs rather than throwing when "complete" fails (e.g. a network error)', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failure = new Error('network error');
		vi.mocked(updateItem).mockRejectedValue(failure);

		await fireAction('complete');

		expect(consoleError).toHaveBeenCalledWith(
			'Failed to complete item from notification action',
			failure
		);
		consoleError.mockRestore();
	});

	it('logs rather than throwing when "snooze" fails (e.g. a network error)', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failure = new Error('network error');
		vi.mocked(fetchItems).mockRejectedValue(failure);

		await fireAction('snooze');

		expect(consoleError).toHaveBeenCalledWith(
			'Failed to snooze item from notification action',
			failure
		);
		consoleError.mockRestore();
	});

	it('ignores an action on a notification from some other feature', async () => {
		await fireAction('complete', performedNotification({ source: 'something-else' }));

		expect(updateItem).not.toHaveBeenCalled();
	});

	it('ignores the plain tap-to-open action for item mutations', async () => {
		await fireAction('tap');

		expect(updateItem).not.toHaveBeenCalled();
		expect(fetchItems).not.toHaveBeenCalled();
	});

	it("routes the plain tap-to-open action to the notification's list/item via onTap", async () => {
		const onTap = vi.fn();

		await fireAction('tap', performedNotification(), onTap);

		expect(onTap).toHaveBeenCalledWith(1, 1);
	});

	it('does not call onTap for a "complete"/"snooze" action', async () => {
		const onTap = vi.fn();
		vi.mocked(updateItem).mockResolvedValue(undefined);

		await fireAction('complete', performedNotification(), onTap);

		expect(onTap).not.toHaveBeenCalled();
	});

	it('ignores an action id matching none of "complete"/"snooze"/"tap"', async () => {
		const onTap = vi.fn();

		await fireAction('something-unrecognized', performedNotification(), onTap);

		expect(onTap).not.toHaveBeenCalled();
		expect(updateItem).not.toHaveBeenCalled();
		expect(fetchItems).not.toHaveBeenCalled();
	});
});
