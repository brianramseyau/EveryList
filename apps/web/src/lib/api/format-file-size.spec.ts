import { describe, expect, it } from 'vitest';
import { formatFileSize } from './format-file-size';

describe('formatFileSize', () => {
	it('renders sub-kilobyte sizes in bytes', () => {
		expect(formatFileSize(512)).toBe('512 B');
	});

	it('renders kilobytes', () => {
		expect(formatFileSize(2048)).toBe('2.0 KB');
	});

	it('renders megabytes', () => {
		expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
	});

	it('renders gigabytes and stops converting further', () => {
		expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
	});
});
