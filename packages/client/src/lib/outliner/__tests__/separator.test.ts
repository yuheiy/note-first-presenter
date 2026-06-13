import { describe, expect, it } from 'vite-plus/test';
import { outlinerSchema } from '../schema';
import { isTopLevelSeparator } from '../separator';

function liWithText(text: string) {
  return outlinerSchema.node('list_item', null, [
    outlinerSchema.node('paragraph', null, text ? [outlinerSchema.text(text)] : []),
  ]);
}

describe('isTopLevelSeparator', () => {
  it('returns true for three or more consecutive hyphens', () => {
    expect(isTopLevelSeparator(liWithText('---'))).toBe(true);
    expect(isTopLevelSeparator(liWithText('----'))).toBe(true);
    expect(isTopLevelSeparator(liWithText('-----'))).toBe(true);
  });

  it('returns false when text differs', () => {
    expect(isTopLevelSeparator(liWithText('---x'))).toBe(false);
    expect(isTopLevelSeparator(liWithText('--'))).toBe(false);
    expect(isTopLevelSeparator(liWithText('--- foo'))).toBe(false);
    expect(isTopLevelSeparator(liWithText('  ---'))).toBe(false);
    expect(isTopLevelSeparator(liWithText('- - -'))).toBe(false);
  });

  it('returns false when item has nested children', () => {
    const li = outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, [outlinerSchema.text('---')]),
      outlinerSchema.node('bullet_list', null, [
        outlinerSchema.node('list_item', null, [outlinerSchema.node('paragraph', null, [])]),
      ]),
    ]);
    expect(isTopLevelSeparator(li)).toBe(false);
  });
});
