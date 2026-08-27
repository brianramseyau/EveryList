/**
 * `@mdi/js` ships every Material Design Icon (~7,000 glyphs) as one module
 * of `export const mdiFooBar = "<svg path data>"` constants — importing it
 * with a dynamic `import()` puts the whole set in its own chunk instead of
 * the initial app-shell bundle (see PLAN_00_FOUNDATIONAL_PLAN.md §4/§7).
 *
 * `Category.icon` stores the export name minus its "mdi" prefix, camelCase
 * (e.g. `"fruitCherries"` for the `mdiFruitCherries` export) — see
 * apps/api's category_service.ts (STARTER_CATEGORIES) for the existing convention.
 */
export type MdiModule = Record<string, string>;

let modulePromise: Promise<MdiModule> | undefined;

export function loadMdiIcons(): Promise<MdiModule> {
	// The dynamic import's module namespace object also carries a `default`
	// export alongside the ~7,000 named `mdiFooBar` ones — cast it away since
	// callers only ever look icons up by name.
	modulePromise ??= import('@mdi/js').then((mod) => mod as unknown as MdiModule);
	return modulePromise;
}

export function toMdiExportName(iconName: string): string {
	return `mdi${iconName.charAt(0).toUpperCase()}${iconName.slice(1)}`;
}

export function fromMdiExportName(exportName: string): string {
	return exportName.slice(3, 4).toLowerCase() + exportName.slice(4);
}

/** "fruitCherries" -> "Fruit Cherries", for display and search matching. */
export function toDisplayLabel(iconName: string): string {
	const spaced = iconName.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
