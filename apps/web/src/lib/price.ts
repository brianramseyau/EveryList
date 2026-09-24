/**
 * Strips everything except digits and a single decimal point from a price field's raw input, so
 * a pasted value like "$12.99" or "1,234.56 USD" becomes "12.99" / "1234.56" — a value the price
 * field can actually parse and save — instead of leaving text that makes `Number(...)` return
 * `NaN` and the whole save silently no-op.
 */
export function sanitizePriceInput(raw: string): string {
	const digitsAndDots = raw.replace(/[^0-9.]/g, '');
	const firstDot = digitsAndDots.indexOf('.');
	if (firstDot === -1) return digitsAndDots;
	return (
		digitsAndDots.slice(0, firstDot + 1) + digitsAndDots.slice(firstDot + 1).replace(/\./g, '')
	);
}
