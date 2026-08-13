<script lang="ts">
	import { loadMdiIcons, toMdiExportName } from '$lib/icons/mdi';

	let { name, class: className = 'h-5 w-5' }: { name: string; class?: string } = $props();

	// A plain circle-question-mark glyph, inlined so the fallback never
	// depends on the lazy-loaded @mdi/js chunk resolving first — see
	// PLAN.md §7: "falls back to a generic 'list item' glyph ... rather
	// than rendering nothing" if a stored icon name ever fails to resolve.
	const FALLBACK_PATH =
		'M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M11,17V15H13V17H11M11,7H13A2,2 0 0,1 15,9V10.5C15,11.11 14.61,11.65 14.05,11.87L13,12.31V13H11V11.5L12.7,10.83C12.89,10.76 13,10.58 13,10.38V9.5C13,9.22 12.78,9 12.5,9H11.5C11.22,9 11,9.22 11,9.5V10H9V9A2,2 0 0,1 11,7Z';

	let path = $state<string | null>(null);

	$effect(() => {
		const iconName = name;
		let cancelled = false;
		loadMdiIcons().then((icons) => {
			if (cancelled) return;
			path = icons[toMdiExportName(iconName)] ?? FALLBACK_PATH;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<svg viewBox="0 0 24 24" class={className} aria-hidden="true">
	<path d={path ?? FALLBACK_PATH} fill="currentColor" />
</svg>
