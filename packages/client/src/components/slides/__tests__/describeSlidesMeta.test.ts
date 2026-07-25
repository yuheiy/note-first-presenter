import { describe, expect, it } from 'vite-plus/test';
import type { MessageFormatter } from '../../useMessages';
import { describeSlidesMeta } from '../slidesMeta';

// The catalog's wording is not this function's job (§8.1 N3 leaves the copy
// untested), so the stub reports which key was asked for and with what — which is
// exactly what the branching decides.
const format = ((key: string, args?: Record<string, unknown>) =>
  args === undefined ? key : `${key}(${JSON.stringify(args)})`) as MessageFormatter;

describe('describeSlidesMeta', () => {
  it('says nothing while the metadata is still in flight', () => {
    expect(describeSlidesMeta(null, null, format)).toBeNull();
  });

  it('says nothing once a deck resolves — the slide list speaks for itself', () => {
    expect(
      describeSlidesMeta({ kind: 'resolved', hash: 'abc', pageCount: 3 }, null, format),
    ).toBeNull();
  });

  it('treats a project with no PDF as a hint, not a failure', () => {
    expect(describeSlidesMeta({ kind: 'no-config-no-file' }, null, format)).toEqual({
      tone: 'hint',
      message: 'infoNoSlides',
    });
  });

  it('reports a configured PDF that is not on disk as an error, naming the path', () => {
    expect(
      describeSlidesMeta(
        { kind: 'configured-but-missing', configuredPath: 'deck.pdf' },
        null,
        format,
      ),
    ).toEqual({
      tone: 'error',
      message: 'errorSlidesNotFound({"path":"deck.pdf"})',
    });
  });

  it('reports an ambiguous project as an error, listing the candidates', () => {
    expect(
      describeSlidesMeta(
        { kind: 'no-config-multiple-files', candidates: ['a.pdf', 'b.pdf'] },
        null,
        format,
      ),
    ).toEqual({
      tone: 'error',
      message: 'errorMultiplePdfs({"files":"a.pdf, b.pdf"})',
    });
  });

  it('passes a transport failure through verbatim — it has no catalog entry', () => {
    expect(describeSlidesMeta(null, 'Network request failed', format)).toEqual({
      tone: 'error',
      message: 'Network request failed',
    });
  });
});
