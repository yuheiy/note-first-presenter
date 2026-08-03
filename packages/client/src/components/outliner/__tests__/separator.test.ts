import { describe, expect, it } from 'vite-plus/test';
import { isTopLevelSeparator } from '../model/separator';
import { item } from './fixtures';

describe('isTopLevelSeparator', () => {
  it('returns true for three or more consecutive hyphens', () => {
    expect(isTopLevelSeparator(item('---'))).toBe(true);
    expect(isTopLevelSeparator(item('----'))).toBe(true);
    expect(isTopLevelSeparator(item('-----'))).toBe(true);
  });

  it('returns false when text differs', () => {
    expect(isTopLevelSeparator(item('---x'))).toBe(false);
    expect(isTopLevelSeparator(item('--'))).toBe(false);
    expect(isTopLevelSeparator(item('--- foo'))).toBe(false);
    expect(isTopLevelSeparator(item('  ---'))).toBe(false);
    expect(isTopLevelSeparator(item('- - -'))).toBe(false);
  });

  it('returns false when item has nested children', () => {
    expect(isTopLevelSeparator(item('---', [item('')]))).toBe(false);
  });
});
