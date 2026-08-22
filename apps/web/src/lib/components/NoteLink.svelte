<script lang="ts">
	import { openExternalLink } from '$lib/open-external-link';

	let { url }: { url: string } = $props();
</script>

<!-- A note's URL is an external link, not an app route — resolve() doesn't apply. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	href={url}
	target="_blank"
	rel="noopener noreferrer"
	data-reorder-ignore
	class="not-italic underline hover:text-primary-600 dark:hover:text-primary-400"
	onclick={(event) => openExternalLink(url, event)}>{url}</a
>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
