import { describe, expect, it } from 'vite-plus/test';
import { m } from '../../../lib/paraglide/messages.js';
import { describeSlidesMeta } from '../slidesMeta';

// The catalog's wording is not this function's job (§8.1 N3 leaves the copy
// untested), so the expectations name the message rather than quote it: what the
// branching decides is which message, and with what. Comparing against the same
// function the implementation calls looks circular but is not — swap two arms and
// these fail, reword a message and they do not.

describe('describeSlidesMeta', () => {
  it('says nothing while the metadata is still in flight', () => {
    expect(describeSlidesMeta(null, null)).toBeNull();
  });

  it('says nothing once a deck resolves — the slide list speaks for itself', () => {
    expect(describeSlidesMeta({ kind: 'resolved', hash: 'abc', pageCount: 3 }, null)).toBeNull();
  });

  it('treats a project with no PDF as a hint, not a failure', () => {
    expect(describeSlidesMeta({ kind: 'no-config-no-file' }, null)).toEqual({
      tone: 'hint',
      message: m.no_pdf_yet_hint(),
    });
  });

  it('reports a configured PDF that is not on disk as an error, naming the path', () => {
    expect(
      describeSlidesMeta({ kind: 'configured-but-missing', configuredPath: 'deck.pdf' }, null),
    ).toEqual({
      tone: 'error',
      message: m.configured_pdf_missing_error({ path: 'deck.pdf' }),
    });
  });

  it('reports an ambiguous project as an error, listing the candidates', () => {
    expect(
      describeSlidesMeta(
        { kind: 'no-config-multiple-files', candidates: ['a.pdf', 'b.pdf'] },
        null,
      ),
    ).toEqual({
      tone: 'error',
      message: m.multiple_pdfs_ambiguous_error({ files: 'a.pdf, b.pdf' }),
    });
  });

  it('names the path it was given rather than a fixed string', () => {
    // Guards the interpolation itself: with `{path}` dropped from the message
    // both of these would be the same sentence.
    const first = describeSlidesMeta(
      { kind: 'configured-but-missing', configuredPath: 'a.pdf' },
      null,
    );
    const second = describeSlidesMeta(
      { kind: 'configured-but-missing', configuredPath: 'b.pdf' },
      null,
    );
    expect(first?.message).not.toEqual(second?.message);
    expect(first?.message).toContain('a.pdf');
  });

  it('passes a transport failure through verbatim — it has no catalog entry', () => {
    expect(describeSlidesMeta(null, 'Network request failed')).toEqual({
      tone: 'error',
      message: 'Network request failed',
    });
  });
});
