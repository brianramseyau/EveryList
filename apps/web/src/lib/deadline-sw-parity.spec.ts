import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addHoursToDeadline } from './deadline';

// static/push-sw.js is plain, unbundled JS (see its own header comment) — it can't import
// deadline.ts, so it carries a hand-duplicated copy of addHoursToDeadline. This test extracts
// that copy's actual source from the file and runs it against the same cases as
// deadline.spec.ts's addHoursToDeadline suite, so the two silently drifting apart (a real
// correctness bug for the Web Push "Snooze" action specifically, since native goes through the
// real TS function) fails CI instead of only showing up on-device.
// push-sw.js carries a `// end addHoursToDeadline` sentinel comment right after the function's
// closing brace specifically so this extraction can slice on a fixed marker rather than parse
// source by brace-depth (which a stray `{`/`}` inside a future string/regex/template literal
// edit could throw off) — see that file's own comment next to the marker.
function extractSwAddHoursToDeadline(): (deadline: string, hours: number, now?: Date) => string {
	const source = readFileSync(path.join(__dirname, '../../static/push-sw.js'), 'utf-8');
	const start = source.indexOf('function addHoursToDeadline');
	if (start === -1) throw new Error('addHoursToDeadline not found in push-sw.js');

	const end = source.indexOf('// end addHoursToDeadline', start);
	if (end === -1) throw new Error('// end addHoursToDeadline marker not found in push-sw.js');

	// Deliberately evaluating push-sw.js's own source (not arbitrary/untrusted input), to prove
	// it behaves identically to the TS original above.
	return new Function(`return ${source.slice(start, end)}`)();
}

const swAddHoursToDeadline = extractSwAddHoursToDeadline();

describe('push-sw.js addHoursToDeadline parity', () => {
	const cases: Array<[string, number, Date]> = [
		['2026-09-05T14:30', 1, new Date(2026, 8, 5, 14, 35)],
		['2026-09-05T23:30', 1, new Date(2026, 8, 5, 23, 35)],
		['2026-12-31T23:30', 1, new Date(2026, 11, 31, 23, 35)],
		['2026-09-05', 1, new Date(2026, 8, 5, 8, 0)],
		// A notification that sat unread for hours before Snooze was tapped — the case the
		// max(deadline + hours, now + hours) fallback exists for.
		['2026-09-05T09:00', 1, new Date(2026, 8, 5, 15, 0)],
		['2020-01-01T09:00', 1, new Date(2026, 8, 5, 15, 0)]
	];

	it.each(cases)('matches the TS implementation for %s +%dh at %s', (deadline, hours, now) => {
		expect(swAddHoursToDeadline(deadline, hours, now)).toBe(
			addHoursToDeadline(deadline, hours, now)
		);
	});
});
