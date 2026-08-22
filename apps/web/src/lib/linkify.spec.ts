import { describe, expect, it } from 'vitest';
import { splitTextWithLinks } from './linkify';

describe('splitTextWithLinks', () => {
	it('returns the whole string as one text segment when there is no URL', () => {
		expect(splitTextWithLinks('get the good vanilla')).toEqual([
			{ type: 'text', value: 'get the good vanilla' }
		]);
	});

	it('returns a single link segment for a bare URL', () => {
		expect(splitTextWithLinks('https://example.com/recipe')).toEqual([
			{ type: 'link', value: 'https://example.com/recipe' }
		]);
	});

	it('splits text before and after an embedded URL', () => {
		expect(splitTextWithLinks('see https://example.com/recipe for the recipe')).toEqual([
			{ type: 'text', value: 'see ' },
			{ type: 'link', value: 'https://example.com/recipe' },
			{ type: 'text', value: ' for the recipe' }
		]);
	});

	it('finds multiple URLs in the same text', () => {
		expect(splitTextWithLinks('https://a.example/1 or https://b.example/2')).toEqual([
			{ type: 'link', value: 'https://a.example/1' },
			{ type: 'text', value: ' or ' },
			{ type: 'link', value: 'https://b.example/2' }
		]);
	});

	it('strips trailing sentence punctuation from a URL', () => {
		expect(splitTextWithLinks('check this out: https://example.com/recipe.')).toEqual([
			{ type: 'text', value: 'check this out: ' },
			{ type: 'link', value: 'https://example.com/recipe' },
			{ type: 'text', value: '.' }
		]);
	});

	it('strips a stray wrapping closing paren when the URL itself has no parens at all', () => {
		expect(splitTextWithLinks('(https://example.com)')).toEqual([
			{ type: 'text', value: '(' },
			{ type: 'link', value: 'https://example.com' },
			{ type: 'text', value: ')' }
		]);
	});

	it('strips a URL wrapped in parentheses without eating a balanced closing paren inside it', () => {
		expect(splitTextWithLinks('(https://en.example.org/wiki/Foo_(bar))')).toEqual([
			{ type: 'text', value: '(' },
			{ type: 'link', value: 'https://en.example.org/wiki/Foo_(bar)' },
			{ type: 'text', value: ')' }
		]);
	});

	it('trims multiple trailing punctuation characters', () => {
		expect(splitTextWithLinks('is this it??? https://example.com!!!')).toEqual([
			{ type: 'text', value: 'is this it??? ' },
			{ type: 'link', value: 'https://example.com' },
			{ type: 'text', value: '!!!' }
		]);
	});
});
