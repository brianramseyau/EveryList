import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDto, ListDto } from '@everylist/shared';
import {
	cancelAllElectronDeadlineNotifications,
	requestElectronNotificationPermission,
	syncElectronDeadlineNotifications
} from './electron';

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
		deadline: '2026-09-05T12:05',
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

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	cancelAllElectronDeadlineNotifications();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe('requestElectronNotificationPermission', () => {
	it('is false when the Notification API is unavailable', async () => {
		vi.stubGlobal('Notification', undefined);
		expect(await requestElectronNotificationPermission()).toBe(false);
	});

	it('is true without prompting when already granted', async () => {
		vi.stubGlobal('Notification', { permission: 'granted' });
		expect(await requestElectronNotificationPermission()).toBe(true);
	});

	it('prompts and reflects the result when not yet granted', async () => {
		const requestPermission = vi.fn().mockResolvedValue('granted');
		vi.stubGlobal('Notification', { permission: 'default', requestPermission });
		expect(await requestElectronNotificationPermission()).toBe(true);
	});
});

describe('syncElectronDeadlineNotifications', () => {
	it('fires a Notification at the scheduled time', () => {
		const NotificationSpy = vi.fn();
		vi.stubGlobal('Notification', NotificationSpy);

		const now = new Date(2026, 8, 5, 12, 0);
		const list = makeList();
		const item = makeItem();
		syncElectronDeadlineNotifications([list], new Map([[1, [item]]]), now);

		vi.advanceTimersByTime(4 * 60 * 1000);
		expect(NotificationSpy).not.toHaveBeenCalled();

		vi.advanceTimersByTime(60 * 1000);
		expect(NotificationSpy).toHaveBeenCalledWith('Required by', {
			body: 'Return library book'
		});
	});

	it('cancels a timer for an item no longer due (checked off)', () => {
		const NotificationSpy = vi.fn();
		vi.stubGlobal('Notification', NotificationSpy);

		const now = new Date(2026, 8, 5, 12, 0);
		const list = makeList();
		const item = makeItem();
		syncElectronDeadlineNotifications([list], new Map([[1, [item]]]), now);

		syncElectronDeadlineNotifications([list], new Map([[1, [{ ...item, checked: true }]]]), now);

		vi.advanceTimersByTime(10 * 60 * 1000);
		expect(NotificationSpy).not.toHaveBeenCalled();
	});

	it('reschedules a timer when the deadline changes', () => {
		const NotificationSpy = vi.fn();
		vi.stubGlobal('Notification', NotificationSpy);

		const now = new Date(2026, 8, 5, 12, 0);
		const list = makeList();
		const item = makeItem({ deadline: '2026-09-05T12:05' });
		syncElectronDeadlineNotifications([list], new Map([[1, [item]]]), now);

		const pushedBack = { ...item, deadline: '2026-09-05T12:10' };
		syncElectronDeadlineNotifications([list], new Map([[1, [pushedBack]]]), now);

		vi.advanceTimersByTime(5 * 60 * 1000);
		expect(NotificationSpy).not.toHaveBeenCalled();

		vi.advanceTimersByTime(5 * 60 * 1000);
		expect(NotificationSpy).toHaveBeenCalledTimes(1);
	});
});

describe('cancelAllElectronDeadlineNotifications', () => {
	it('clears every pending timer', () => {
		const NotificationSpy = vi.fn();
		vi.stubGlobal('Notification', NotificationSpy);

		const now = new Date(2026, 8, 5, 12, 0);
		const list = makeList();
		const item = makeItem();
		syncElectronDeadlineNotifications([list], new Map([[1, [item]]]), now);

		cancelAllElectronDeadlineNotifications();

		vi.advanceTimersByTime(10 * 60 * 1000);
		expect(NotificationSpy).not.toHaveBeenCalled();
	});
});
