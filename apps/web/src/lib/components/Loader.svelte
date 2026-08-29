<script lang="ts">
	// Replaces the bare "Loading…" text every page used to show. The signature
	// motif — three checkboxes ticking left to right, on loop — is just this
	// app's real item checkbox (same border/fill/check-mark markup as the
	// list-detail row, `+page.svelte`'s `.check-glyph`) doing the one thing this
	// app is for, instead of a generic spinner. `prefers-reduced-motion` gets a
	// calm static tableau (middle box checked) rather than the animated wave.
	/** `compact` drops the padding/box size for tight spaces (e.g. IconPicker's
	 * dropdown panel) where the default's breathing room would overwhelm the
	 * container it sits in. */
	let { label = 'Loading…', compact = false }: { label?: string; compact?: boolean } = $props();
</script>

<div
	role="status"
	aria-live="polite"
	class="flex flex-col items-center justify-center gap-2 text-gray-600 dark:text-gray-400 {compact
		? 'py-2'
		: 'gap-3 py-10'}"
>
	<div class="flex gap-1.5" aria-hidden="true">
		{#each [0, 1, 2] as i (i)}
			<span class="loader-box relative inline-flex {compact ? 'h-3.5 w-3.5' : 'h-5 w-5'}">
				<span class="absolute inset-0 rounded border-2 border-gray-300 dark:border-gray-600"></span>
				<span
					class="loader-box-check absolute inset-0 flex items-center justify-center rounded border-2 border-signal bg-signal"
				>
					<svg
						class="{compact ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} text-white"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M3 8.5l3.2 3.2L13 4.5" />
					</svg>
				</span>
			</span>
		{/each}
	</div>
	<p class="text-sm">{label}</p>
</div>

<style>
	.loader-box-check {
		opacity: 0;
	}

	/* Reduced motion: one calm, unmoving tableau (the middle box checked)
	   instead of the looping wave — same convention as the item check-settle
	   and strike-wipe animations in `lists/[id]/+page.svelte`. */
	.loader-box:nth-child(2) .loader-box-check {
		opacity: 1;
	}

	@media (prefers-reduced-motion: no-preference) {
		.loader-box-check {
			animation: loader-check-cycle 1.8s ease-in-out infinite;
		}

		.loader-box:nth-child(1) .loader-box-check {
			animation-delay: 0s;
		}
		.loader-box:nth-child(2) .loader-box-check {
			animation-delay: 0.3s;
			opacity: 0;
		}
		.loader-box:nth-child(3) .loader-box-check {
			animation-delay: 0.6s;
		}
	}

	@keyframes loader-check-cycle {
		0%,
		10% {
			opacity: 0;
			transform: scale(0.85);
		}
		30%,
		55% {
			opacity: 1;
			transform: scale(1);
		}
		80%,
		100% {
			opacity: 0;
			transform: scale(0.85);
		}
	}
</style>
