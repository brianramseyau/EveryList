/** The boolean feature flags a prefab or the "Custom" toggle list can set — same field names
 *  as ListDto, minus the display-only/non-boolean settings (itemSortOrder, maxUncheckedItems)
 *  which prefabs configure separately below. */
export interface ListFeatureValues {
	useCategories: boolean;
	useCategoryLearning: boolean;
	useShops: boolean;
	showStoreInList: boolean;
	useFavorites: boolean;
	useRecent: boolean;
	useQuantity: boolean;
	usePrice: boolean;
	showPriceInList: boolean;
	useDeadline: boolean;
}

export type BooleanFeatureField = keyof ListFeatureValues;

export const DEFAULT_FEATURE_VALUES: ListFeatureValues = {
	useCategories: true,
	useCategoryLearning: true,
	useShops: true,
	showStoreInList: true,
	useFavorites: true,
	useRecent: true,
	useQuantity: true,
	usePrice: true,
	showPriceInList: true,
	useDeadline: false
};

export interface ListPrefab {
	id: string;
	label: string;
	description: string;
	/** The feature flags this prefab applies. `null` means "Custom" — let the
	 *  person choose every toggle themselves via ListFeatureToggles. */
	values: ListFeatureValues | null;
	itemSortOrder?: 'ranked' | 'alphabetical' | 'deadline';
	/** Whether to offer the open-item-limit field alongside this prefab. */
	showOpenItemLimit?: boolean;
}

/** New prefab list types go here — the create-list page renders this array
 *  as-is, so adding an entry is the only step needed to offer a new type. */
export const LIST_PREFABS: ListPrefab[] = [
	{
		id: 'shopping',
		label: 'Shopping',
		description: 'Categories, stores, favorites, and prices',
		values: {
			useCategories: true,
			useCategoryLearning: true,
			useShops: true,
			showStoreInList: true,
			useFavorites: true,
			useRecent: true,
			useQuantity: true,
			usePrice: true,
			showPriceInList: true,
			useDeadline: false
		}
	},
	{
		id: 'todo',
		label: 'Todo / Chores',
		description: 'Recently deleted and deadlines, sorted by what’s due soonest',
		values: {
			useCategories: false,
			useCategoryLearning: false,
			useShops: false,
			showStoreInList: false,
			useFavorites: false,
			useRecent: true,
			useQuantity: false,
			usePrice: false,
			showPriceInList: false,
			useDeadline: true
		},
		itemSortOrder: 'deadline',
		showOpenItemLimit: true
	},
	{
		id: 'custom',
		label: 'Custom',
		description: 'Choose exactly which features this list uses',
		values: null
	}
];
