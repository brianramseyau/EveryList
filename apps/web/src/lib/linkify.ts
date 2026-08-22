export interface TextSegment {
	type: 'text' | 'link';
	value: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;

/** A URL ending in a `)` keeps it when there are unmatched `(`s earlier in the match (e.g. a
 * Wikipedia-style link) — otherwise trailing sentence punctuation like `.`, `,`, or `)` closing an
 * unrelated parenthetical is stripped off instead of being swallowed into the link. */
function trimTrailingPunctuation(url: string): string {
	let trimmed = url;
	while (trimmed.length > 0) {
		const lastChar = trimmed[trimmed.length - 1];
		if (lastChar === ')') {
			const opens = trimmed.split('(').length - 1;
			const closes = trimmed.split(')').length - 1;
			if (opens >= closes) break;
			trimmed = trimmed.slice(0, -1);
			continue;
		}
		if ('.,;:!?]}'.includes(lastChar)) {
			trimmed = trimmed.slice(0, -1);
			continue;
		}
		break;
	}
	return trimmed;
}

/** Splits free text into plain-text and link segments — backs rendering a note's `http(s)://` URLs
 * as clickable links (AnyList-style) while leaving the rest as plain text. */
export function splitTextWithLinks(text: string): TextSegment[] {
	const segments: TextSegment[] = [];
	let lastIndex = 0;

	for (const match of text.matchAll(URL_PATTERN)) {
		// matchAll's individual match `.index` is always defined for an actual match — TS's
		// RegExpMatchArray types it optional only because a non-global `.match()` can return
		// null overall, not because a found match can lack a position.
		/* v8 ignore next */
		const start = match.index ?? 0;
		const url = trimTrailingPunctuation(match[0]);

		if (start > lastIndex) {
			segments.push({ type: 'text', value: text.slice(lastIndex, start) });
		}
		segments.push({ type: 'link', value: url });
		lastIndex = start + url.length;
	}

	if (lastIndex < text.length) {
		segments.push({ type: 'text', value: text.slice(lastIndex) });
	}

	return segments;
}
