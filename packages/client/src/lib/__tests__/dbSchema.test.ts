import { describe, expect, it } from 'vite-plus/test';
import * as v from 'valibot';
import { dbSchema, defaultDb } from '$lib/dbSchema';

describe('defaultDb', () => {
  it('returns an empty title and a single empty list_item', () => {
    expect(defaultDb()).toEqual({
      version: 1,
      title: '',
      outline: {
        type: 'doc',
        content: [
          {
            type: 'bullet_list',
            content: [{ type: 'list_item', content: [{ type: 'paragraph' }] }],
          },
        ],
      },
    });
  });
});

describe('dbSchema', () => {
  it('accepts what defaultDb produces', () => {
    expect(v.safeParse(dbSchema, defaultDb()).success).toBe(true);
  });

  it('keeps outline opaque', () => {
    const parsed = v.parse(dbSchema, { version: 1, title: '', outline: 'anything' });
    expect(parsed.outline).toBe('anything');
  });

  it('rejects a foreign envelope version', () => {
    expect(v.safeParse(dbSchema, { version: 2, title: '', outline: null }).success).toBe(false);
  });

  it('rejects a missing title', () => {
    expect(v.safeParse(dbSchema, { version: 1, outline: null }).success).toBe(false);
  });
});
