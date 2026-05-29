# build / export Subcommands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `note-first-presenter build`（読み取り専用の静的サイト生成）and `note-first-presenter export`（eta テンプレートでデッキ全体を 1 ファイルへ出力）CLI subcommands, sharing a pipeline pipeline.

**Architecture:** A pipeline pipeline in `@note-first-presenter/client`（`src/lib/pipeline/`）が、PDF 全描画・DB 読込・outline のスライド単位グループ化を担う。`export` はこのパイプライン + eta で純 Node 出力。`build` は既存 SvelteKit アプリを `@sveltejs/adapter-static` で静的 prerender し、CLI がビルド後に `nfp-data/`（db.json / meta.json / 全ページ webp）を書き出す。クライアントは build モードで取得 URL を `/nfp-data/*` に切り替え、編集・保存を無効化する。

**Tech Stack:** TypeScript, citty (CLI), valibot, ProseMirror model, pdfjs-dist + @napi-rs/canvas, SvelteKit + @sveltejs/adapter-static, eta, Vitest, vite-plus.

設計: `docs/superpowers/specs/2026-05-30-build-export-design.md`

---

## File Structure

新規・変更ファイルと責務:

**`@note-first-presenter/client`（パイプライン + クライアント変更）**

- `src/lib/pipeline/note-tree.ts`（新規） — outline JSON を `NoteNode[]` のスライド単位グループへ分割。純関数。
- `src/lib/pipeline/format.ts`（新規） — `NoteNode[]` → `toMarkdown` / `toHtml`。純関数。
- `src/lib/pipeline/render-slides.ts`（新規） — PDF 全ページを指定 dir に webp 出力。`pdf-renderer` 流用。
- `src/lib/pipeline/export.ts`（新規） — export context 構築 + eta 実行 + ファイル/画像書き出し。
- `src/lib/pipeline/build-data.ts`（新規） — build 用 `nfp-data/`（db.json / meta.json / slides）書き出し。
- `src/lib/pipeline/types.ts`（新規） — `NoteNode` / `ExportContext` 等の共有型。
- `src/lib/runtime-mode.ts`（新規） — `isStatic` と `metaUrl()` / `dbUrl()` / `slideUrl()`。
- `src/routes/+layout.ts`（新規） — build モードの `prerender`。
- 変更: `src/lib/slides-meta/slides-meta-store.svelte.ts`, `src/routes/+page.svelte`, `src/routes/slideshow/+page.svelte`, `src/lib/slide-image/SlideImage.svelte`, `src/lib/outliner/Outliner.svelte`, `src/app.d.ts`, `svelte.config.js`, `package.json`。

**`note-first-presenter`（CLI）**

- `src/config/defaults.ts`（新規） — outDir/imageDir デフォルト + CLI 上書きの絶対パス解決。
- `src/export.ts`（新規） — `runExport`。
- `src/build.ts`（新規） — `runBuild`。
- 変更: `src/cli.ts`（subCommands）, `src/plugin/virtual-modules.ts` & `src/plugin/index.ts`（`mode` / `virtual:nfp/mode`）, `src/index.ts`（公開 API）。

---

## 事前準備

- [ ] **Step 0a: 最新化と依存追加**

Run（パッケージ追加は CLI 経由、`package.json` 直接編集禁止）:

```bash
vp install
vp add -F @note-first-presenter/client eta @sveltejs/adapter-static
```

Expected: `eta` と `@sveltejs/adapter-static` が `packages/client/package.json` に追加され、lockfile 更新。

- [ ] **Step 0b: ベースラインのグリーン確認**

Run:

```bash
vp check && vp test
```

Expected: 既存テスト・型チェックが PASS（着手前の基準）。

---

## Task 1: ノートツリー化（`note-tree.ts`）

outline（ProseMirror doc JSON）のトップレベル `list_item` を単独 `---` で分割し、各グループを `NoteNode[]` へ変換する。`collapsed` は無視、区切り項目はノードに含めない。

**Files:**

- Create: `packages/client/src/lib/pipeline/types.ts`
- Create: `packages/client/src/lib/pipeline/note-tree.ts`
- Test: `packages/client/src/lib/pipeline/__tests__/note-tree.test.ts`

- [ ] **Step 1: 共有型を定義**

Create `packages/client/src/lib/pipeline/types.ts`:

```ts
export interface NoteNode {
  text: string;
  children: NoteNode[];
}
```

- [ ] **Step 2: 失敗するテストを書く**

Create `packages/client/src/lib/pipeline/__tests__/note-tree.test.ts`:

```ts
import { describe, expect, it } from 'vite-plus/test';
import { splitNoteGroups } from '../note-tree';

function li(text: string, children: unknown[] = []) {
  const content: unknown[] = [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }];
  if (children.length) content.push({ type: 'bullet_list', content: children });
  return { type: 'list_item', content };
}
function doc(items: unknown[]) {
  return { type: 'doc', content: items.length ? [{ type: 'bullet_list', content: items }] : [] };
}
const SEP = li('---');

describe('splitNoteGroups', () => {
  it('returns a single empty group for empty outline', () => {
    expect(splitNoteGroups(doc([]))).toEqual([[]]);
  });

  it('maps top-level items to one group with text and nested children', () => {
    const groups = splitNoteGroups(doc([li('intro', [li('point a'), li('point b')])]));
    expect(groups).toEqual([
      [
        {
          text: 'intro',
          children: [
            { text: 'point a', children: [] },
            { text: 'point b', children: [] },
          ],
        },
      ],
    ]);
  });

  it('splits on a standalone --- separator and drops the separator node', () => {
    const groups = splitNoteGroups(doc([li('slide one'), SEP, li('slide two')]));
    expect(groups).toEqual([
      [{ text: 'slide one', children: [] }],
      [{ text: 'slide two', children: [] }],
    ]);
  });

  it('yields an empty group between consecutive separators', () => {
    const groups = splitNoteGroups(doc([li('a'), SEP, SEP, li('b')]));
    expect(groups).toEqual([[{ text: 'a', children: [] }], [], [{ text: 'b', children: [] }]]);
  });
});
```

- [ ] **Step 3: テストを実行して落ちることを確認**

Run: `vp test -F @note-first-presenter/client note-tree`
Expected: FAIL（`splitNoteGroups` 未定義）。

- [ ] **Step 4: 実装を書く**

Create `packages/client/src/lib/pipeline/note-tree.ts`:

```ts
import type { NoteNode } from './types';

interface JsonNode {
  type: string;
  content?: JsonNode[];
  text?: string;
}

function paragraphText(item: JsonNode): string {
  const para = (item.content ?? []).find((c) => c.type === 'paragraph');
  if (!para) return '';
  return (para.content ?? []).map((n) => n.text ?? '').join('');
}

function isSeparator(item: JsonNode): boolean {
  if (item.type !== 'list_item') return false;
  if ((item.content ?? []).length !== 1) return false;
  return paragraphText(item) === '---';
}

function toNode(item: JsonNode): NoteNode {
  const nestedList = (item.content ?? []).find((c) => c.type === 'bullet_list');
  const children = (nestedList?.content ?? []).map(toNode);
  return { text: paragraphText(item), children };
}

export function splitNoteGroups(outline: unknown): NoteNode[][] {
  const docNode = outline as JsonNode | undefined;
  const list = docNode?.type === 'doc' ? docNode.content?.[0] : undefined;
  const items = list?.type === 'bullet_list' ? (list.content ?? []) : [];
  const groups: NoteNode[][] = [[]];
  for (const item of items) {
    if (isSeparator(item)) {
      groups.push([]);
      continue;
    }
    groups[groups.length - 1].push(toNode(item));
  }
  return groups;
}
```

- [ ] **Step 5: テストを実行して通ることを確認**

Run: `vp test -F @note-first-presenter/client note-tree`
Expected: PASS（4 件）。

- [ ] **Step 6: コミット**

```bash
git add packages/client/src/lib/pipeline/types.ts packages/client/src/lib/pipeline/note-tree.ts packages/client/src/lib/pipeline/__tests__/note-tree.test.ts
git commit -m "Add note-tree splitter for pipeline export pipeline"
```

---

## Task 2: 整形ヘルパー（`format.ts`）

`NoteNode[]` を `toMarkdown` / `toHtml` に整形する純関数。ネスト保持、HTML はエスケープ。

**Files:**

- Create: `packages/client/src/lib/pipeline/format.ts`
- Test: `packages/client/src/lib/pipeline/__tests__/format.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

Create `packages/client/src/lib/pipeline/__tests__/format.test.ts`:

```ts
import { describe, expect, it } from 'vite-plus/test';
import { toHtml, toMarkdown } from '../format';
import type { NoteNode } from '../types';

const notes: NoteNode[] = [
  { text: 'parent', children: [{ text: 'child', children: [] }] },
  { text: 'second', children: [] },
];

describe('toMarkdown', () => {
  it('renders nested bullets with 2-space indent', () => {
    expect(toMarkdown(notes)).toBe('- parent\n  - child\n- second');
  });
  it('returns empty string for no notes', () => {
    expect(toMarkdown([])).toBe('');
  });
});

describe('toHtml', () => {
  it('renders nested <ul><li> structure', () => {
    expect(toHtml(notes)).toBe('<ul><li>parent<ul><li>child</li></ul></li><li>second</li></ul>');
  });
  it('escapes HTML special characters', () => {
    expect(toHtml([{ text: '<b> & "x"', children: [] }])).toBe(
      '<ul><li>&lt;b&gt; &amp; &quot;x&quot;</li></ul>',
    );
  });
  it('returns empty string for no notes', () => {
    expect(toHtml([])).toBe('');
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `vp test -F @note-first-presenter/client format`
Expected: FAIL（`toMarkdown` / `toHtml` 未定義）。

- [ ] **Step 3: 実装を書く**

Create `packages/client/src/lib/pipeline/format.ts`:

```ts
import type { NoteNode } from './types';

export function toMarkdown(notes: NoteNode[]): string {
  const lines: string[] = [];
  const walk = (nodes: NoteNode[], depth: number) => {
    for (const node of nodes) {
      lines.push(`${'  '.repeat(depth)}- ${node.text}`);
      walk(node.children, depth + 1);
    }
  };
  walk(notes, 0);
  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function toHtml(notes: NoteNode[]): string {
  if (notes.length === 0) return '';
  const items = notes
    .map((node) => `<li>${escapeHtml(node.text)}${toHtml(node.children)}</li>`)
    .join('');
  return `<ul>${items}</ul>`;
}
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `vp test -F @note-first-presenter/client format`
Expected: PASS（5 件）。

- [ ] **Step 5: コミット**

```bash
git add packages/client/src/lib/pipeline/format.ts packages/client/src/lib/pipeline/__tests__/format.test.ts
git commit -m "Add markdown/html note formatters"
```

---

## Task 3: スライド全描画（`render-slides.ts`）

PDF 全ページを指定ディレクトリへ webp 出力する。既存 `pdf-renderer` を流用し、戻り値で hash / pageCount / 各ページ寸法を返す。

**Files:**

- Create: `packages/client/src/lib/pipeline/render-slides.ts`
- Test: `packages/client/src/lib/pipeline/__tests__/render-slides.test.ts`
- Reference: `packages/client/src/lib/server/pdf-renderer.ts`, `packages/client/src/lib/server/__tests__/fixtures/sample.pdf`

- [ ] **Step 1: 失敗するテストを書く**

Create `packages/client/src/lib/pipeline/__tests__/render-slides.test.ts`:

```ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { renderAllSlides } from '../render-slides';

const SAMPLE = path.resolve(import.meta.dirname, '../../server/__tests__/fixtures/sample.pdf');
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-render-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('renderAllSlides', () => {
  it('writes one webp per page and reports meta', async () => {
    const outDir = path.join(tmp, 'images');
    const cacheRoot = path.join(tmp, 'cache');
    const result = await renderAllSlides({ slidesPath: SAMPLE, cacheRoot, outDir });
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.slides).toHaveLength(result.pageCount);
    const first = path.join(outDir, '0001.webp');
    const stat = await fs.stat(first);
    expect(stat.size).toBeGreaterThan(0);
    expect(result.slides[0].width).toBeGreaterThan(0);
    expect(result.slides[0].height).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `vp test -F @note-first-presenter/client render-slides`
Expected: FAIL（`renderAllSlides` 未定義）。

- [ ] **Step 3: pdf-renderer に寸法取得を追加**

Modify `packages/client/src/lib/server/pdf-renderer.ts` — `getSlideImage` の戻り値に `width` / `height` を追加する（`renderPage` で算出した viewport を返す）。`renderPage` を次に置き換える:

```ts
async function renderPage(
  pdf: PdfDocument,
  pageNumber: number,
): Promise<{ data: Buffer; width: number; height: number }> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: TARGET_SCALE });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  return { data: await canvas.encode('webp', WEBP_QUALITY), width, height };
}
```

そして `getSlideImage` のシグネチャと本体を寸法込みに更新する:

```ts
export async function getSlideImage(
  pageNumber: number,
): Promise<{ data: Buffer; hash: string; pageCount: number; width: number; height: number }> {
  const s = ensureState();
  const { hash, pdf, pageCount } = await getPdf();
  if (pageNumber < 1 || pageNumber > pageCount) {
    throw new PageOutOfRangeError(pageNumber, pageCount);
  }
  const { data, width, height } = await renderPage(pdf, pageNumber);
  const cachePath = slideCachePath(s.cacheRoot, hash, pageNumber);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, data);
  return { data, hash, pageCount, width, height };
}
```

注意: これにより従来あったキャッシュ読込（`try { fs.readFile(cachePath) }`）は削除され、寸法を必ず得るため毎回 `renderPage` する。`+server.ts` の GET 利用側（`const { data, hash } = await getSlideImage(n)`）は分割代入なので影響なし。

- [ ] **Step 4: render-slides を実装**

Create `packages/client/src/lib/pipeline/render-slides.ts`:

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensurePdfState, getSlideImage, getSlidesMeta } from '$lib/server/pdf-renderer';

export interface RenderedSlide {
  number: number;
  width: number;
  height: number;
  file: string;
}

export interface RenderAllResult {
  hash: string;
  pageCount: number;
  slides: RenderedSlide[];
}

export interface RenderAllOptions {
  slidesPath: string;
  cacheRoot: string;
  outDir: string;
}

export async function renderAllSlides(opts: RenderAllOptions): Promise<RenderAllResult> {
  ensurePdfState({ slidesPath: opts.slidesPath, cacheRoot: opts.cacheRoot });
  const { hash, pageCount } = await getSlidesMeta();
  await fs.mkdir(opts.outDir, { recursive: true });
  const slides: RenderedSlide[] = [];
  for (let n = 1; n <= pageCount; n++) {
    const { data, width, height } = await getSlideImage(n);
    const name = `${String(n).padStart(4, '0')}.webp`;
    await fs.writeFile(path.join(opts.outDir, name), data);
    slides.push({ number: n, width, height, file: name });
  }
  return { hash, pageCount, slides };
}
```

- [ ] **Step 5: テストを実行して通ることを確認**

Run: `vp test -F @note-first-presenter/client render-slides pdf-renderer`
Expected: PASS（既存 `pdf-renderer.test.ts` も含めグリーン。落ちた場合は寸法追加に合わせて該当アサーションを調整）。

- [ ] **Step 6: コミット**

```bash
git add packages/client/src/lib/pipeline/render-slides.ts packages/client/src/lib/pipeline/__tests__/render-slides.test.ts packages/client/src/lib/server/pdf-renderer.ts
git commit -m "Add pipeline renderAllSlides and expose page dimensions"
```

---

## Task 4: export context ビルダー

slides 全描画結果 + ノートグループから `ExportContext` を組む。エントリ数 = `max(pageCount, groupCount)`、超過スライドは画像 null、超過ノートは空。画像パスは本体ファイルから見た相対（`imageRelDir` 基準）。

**Files:**

- Modify: `packages/client/src/lib/pipeline/types.ts`
- Create: `packages/client/src/lib/pipeline/context.ts`
- Test: `packages/client/src/lib/pipeline/__tests__/context.test.ts`

- [ ] **Step 1: ExportContext 型を追加**

Append to `packages/client/src/lib/pipeline/types.ts`:

```ts
export interface ExportSlide {
  number: number;
  image: string | null;
  width: number;
  height: number;
  notes: NoteNode[];
}

export interface ExportContext {
  title: string;
  slideCount: number;
  slides: ExportSlide[];
  toMarkdown: (notes: NoteNode[]) => string;
  toHtml: (notes: NoteNode[]) => string;
}
```

- [ ] **Step 2: 失敗するテストを書く**

Create `packages/client/src/lib/pipeline/__tests__/context.test.ts`:

```ts
import { describe, expect, it } from 'vite-plus/test';
import { buildExportContext } from '../context';
import type { NoteNode } from '../types';

const rendered = {
  hash: 'h',
  pageCount: 2,
  slides: [
    { number: 1, width: 800, height: 600, file: '0001.webp' },
    { number: 2, width: 800, height: 600, file: '0002.webp' },
  ],
};

describe('buildExportContext', () => {
  it('pairs slides with note groups and sets relative image paths', () => {
    const groups: NoteNode[][] = [[{ text: 'a', children: [] }], [{ text: 'b', children: [] }]];
    const ctx = buildExportContext({ title: 'Deck', rendered, groups, imageRelDir: 'images' });
    expect(ctx.title).toBe('Deck');
    expect(ctx.slideCount).toBe(2);
    expect(ctx.slides[0]).toMatchObject({
      number: 1,
      image: 'images/0001.webp',
      notes: [{ text: 'a', children: [] }],
    });
    expect(typeof ctx.toMarkdown).toBe('function');
    expect(typeof ctx.toHtml).toBe('function');
  });

  it('pads with dummy (image null) slides when note groups exceed pages', () => {
    const groups: NoteNode[][] = [[], [], []];
    const ctx = buildExportContext({ title: '', rendered, groups, imageRelDir: 'images' });
    expect(ctx.slideCount).toBe(3);
    expect(ctx.slides[2]).toMatchObject({ number: 3, image: null, width: 0, height: 0, notes: [] });
  });

  it('uses empty notes when pages exceed note groups', () => {
    const groups: NoteNode[][] = [[{ text: 'only', children: [] }]];
    const ctx = buildExportContext({ title: '', rendered, groups, imageRelDir: 'images' });
    expect(ctx.slideCount).toBe(2);
    expect(ctx.slides[1].notes).toEqual([]);
    expect(ctx.slides[1].image).toBe('images/0002.webp');
  });
});
```

- [ ] **Step 3: テストを実行して落ちることを確認**

Run: `vp test -F @note-first-presenter/client context`
Expected: FAIL（`buildExportContext` 未定義）。

- [ ] **Step 4: 実装を書く**

Create `packages/client/src/lib/pipeline/context.ts`:

```ts
import { toHtml, toMarkdown } from './format';
import type { RenderAllResult } from './render-slides';
import type { ExportContext, ExportSlide, NoteNode } from './types';

export interface BuildContextOptions {
  title: string;
  rendered: RenderAllResult;
  groups: NoteNode[][];
  imageRelDir: string;
}

export function buildExportContext(opts: BuildContextOptions): ExportContext {
  const { rendered, groups, imageRelDir } = opts;
  const count = Math.max(rendered.pageCount, groups.length);
  const slides: ExportSlide[] = [];
  for (let i = 0; i < count; i++) {
    const rs = rendered.slides[i];
    slides.push({
      number: i + 1,
      image: rs ? `${imageRelDir}/${rs.file}` : null,
      width: rs?.width ?? 0,
      height: rs?.height ?? 0,
      notes: groups[i] ?? [],
    });
  }
  return { title: opts.title, slideCount: count, slides, toMarkdown, toHtml };
}
```

注意: `imageRelDir` は POSIX 区切りの相対 URL 断片（テンプレートが参照するパス）。OS パス結合ではなく文字列連結で組む。

- [ ] **Step 5: テストを実行して通ることを確認**

Run: `vp test -F @note-first-presenter/client context`
Expected: PASS（3 件）。

- [ ] **Step 6: コミット**

```bash
git add packages/client/src/lib/pipeline/types.ts packages/client/src/lib/pipeline/context.ts packages/client/src/lib/pipeline/__tests__/context.test.ts
git commit -m "Add export context builder"
```

---

## Task 5: export パイプライン（eta 実行 + 書き出し）

config 解決済みの絶対パスを受け取り、画像描画 → context 構築 → eta レンダリング → 本体ファイル書き出しを行う pipeline 関数。

**Files:**

- Create: `packages/client/src/lib/pipeline/export.ts`
- Test: `packages/client/src/lib/pipeline/__tests__/export.test.ts`
- Reference: `packages/client/src/lib/server/db-io.ts`（`readDb`）, `eta` docs（`Eta#renderString` / file rendering）

- [ ] **Step 1: 失敗するテストを書く**

Create `packages/client/src/lib/pipeline/__tests__/export.test.ts`:

```ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { runPipelineExport } from '../export';

const SAMPLE = path.resolve(import.meta.dirname, '../../server/__tests__/fixtures/sample.pdf');
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-export-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('runPipelineExport', () => {
  it('writes a single output file and slide images', async () => {
    const templatePath = path.join(tmp, 'tpl.eta');
    await fs.writeFile(
      templatePath,
      '# <%= it.title %>\n<% it.slides.forEach(function (s) { %>![](<%= s.image %>)\n<%= it.toMarkdown(s.notes) %>\n<% }) %>',
    );
    const db = { version: 1, title: 'My Deck', outline: { type: 'doc', content: [] } };
    const dbPath = path.join(tmp, '.note-first-presenter.json');
    await fs.writeFile(dbPath, JSON.stringify(db));

    const outFile = await runPipelineExport({
      slidesPath: SAMPLE,
      dbPath,
      cacheRoot: path.join(tmp, 'cache'),
      outDir: path.join(tmp, 'out'),
      imageDir: path.join(tmp, 'out', 'images'),
      imageRelDir: 'images',
      templatePath,
      extension: 'md',
      name: 'sample',
    });

    expect(outFile).toBe(path.join(tmp, 'out', 'sample.md'));
    const body = await fs.readFile(outFile, 'utf8');
    expect(body).toContain('# My Deck');
    expect(body).toContain('![](images/0001.webp)');
    const img = await fs.stat(path.join(tmp, 'out', 'images', '0001.webp'));
    expect(img.size).toBeGreaterThan(0);
  });

  it('throws a clear error when the template is missing', async () => {
    await expect(
      runPipelineExport({
        slidesPath: SAMPLE,
        dbPath: path.join(tmp, 'missing.json'),
        cacheRoot: path.join(tmp, 'cache'),
        outDir: path.join(tmp, 'out'),
        imageDir: path.join(tmp, 'out', 'images'),
        imageRelDir: 'images',
        templatePath: path.join(tmp, 'nope.eta'),
        extension: 'md',
        name: 'sample',
      }),
    ).rejects.toThrow(/template/i);
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `vp test -F @note-first-presenter/client pipeline/__tests__/export`
Expected: FAIL（`runPipelineExport` 未定義）。

- [ ] **Step 3: 実装を書く**

Create `packages/client/src/lib/pipeline/export.ts`:

```ts
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { Eta } from 'eta';
import { readDb } from '$lib/server/db-io';
import { buildExportContext } from './context';
import { splitNoteGroups } from './note-tree';
import { renderAllSlides } from './render-slides';

export interface HeadlessExportOptions {
  slidesPath: string;
  dbPath: string;
  cacheRoot: string;
  outDir: string;
  imageDir: string;
  imageRelDir: string;
  templatePath: string;
  extension: string;
  name: string;
}

export async function runPipelineExport(opts: HeadlessExportOptions): Promise<string> {
  if (!existsSync(opts.templatePath)) {
    throw new Error(`export template not found: ${opts.templatePath}`);
  }
  const rendered = await renderAllSlides({
    slidesPath: opts.slidesPath,
    cacheRoot: opts.cacheRoot,
    outDir: opts.imageDir,
  });
  const db = await readDb(opts.dbPath);
  const groups = splitNoteGroups(db.outline);
  const context = buildExportContext({
    title: db.title,
    rendered,
    groups,
    imageRelDir: opts.imageRelDir,
  });

  const templateDir = path.dirname(opts.templatePath);
  const eta = new Eta({ views: templateDir });
  const output = eta.render(`./${path.basename(opts.templatePath)}`, context);

  await fs.mkdir(opts.outDir, { recursive: true });
  const outFile = path.join(opts.outDir, `${opts.name}.${opts.extension}`);
  await fs.writeFile(outFile, output, 'utf8');
  return outFile;
}
```

注意: `eta` の `views` ルートにテンプレートディレクトリを設定し、`render('./<basename>', ctx)` で読み込む（`eta` は拡張子省略時 `.eta` を補完するため、basename はそのまま渡す）。API 差異があれば `node_modules/eta` の型定義で確認すること。

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `vp test -F @note-first-presenter/client pipeline/__tests__/export`
Expected: PASS（2 件）。`eta` の render API がテストと食い違う場合は実装側を `eta` の実 API に合わせて修正（テンプレート内 `it.` アクセスは維持）。

- [ ] **Step 5: コミット**

```bash
git add packages/client/src/lib/pipeline/export.ts packages/client/src/lib/pipeline/__tests__/export.test.ts
git commit -m "Add pipeline export pipeline with eta rendering"
```

---

## Task 6: build データ生成（`build-data.ts`）

build 用に `nfp-data/db.json` / `nfp-data/meta.json` / `nfp-data/slides/{hash}/{NNNN}.webp` を `outDir` 配下へ書き出す pipeline 関数。slides 解決不可時は meta に status を出力し画像は出さない。

**Files:**

- Create: `packages/client/src/lib/pipeline/build-data.ts`
- Test: `packages/client/src/lib/pipeline/__tests__/build-data.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

Create `packages/client/src/lib/pipeline/__tests__/build-data.test.ts`:

```ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { writeBuildData } from '../build-data';

const SAMPLE = path.resolve(import.meta.dirname, '../../server/__tests__/fixtures/sample.pdf');
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-builddata-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('writeBuildData', () => {
  it('writes db.json, meta.json and per-page webp under nfp-data', async () => {
    const db = { version: 1, title: 'T', outline: { type: 'doc', content: [] } };
    const dbPath = path.join(tmp, '.note-first-presenter.json');
    await fs.writeFile(dbPath, JSON.stringify(db));
    const outDir = path.join(tmp, 'dist');

    await writeBuildData({
      outDir,
      dbPath,
      cacheRoot: path.join(tmp, 'cache'),
      slidesStatus: { kind: 'resolved', path: SAMPLE },
    });

    const meta = JSON.parse(await fs.readFile(path.join(outDir, 'nfp-data', 'meta.json'), 'utf8'));
    expect(meta.status).toBe('resolved');
    expect(meta.pageCount).toBeGreaterThanOrEqual(1);
    const savedDb = JSON.parse(await fs.readFile(path.join(outDir, 'nfp-data', 'db.json'), 'utf8'));
    expect(savedDb.title).toBe('T');
    const img = await fs.stat(path.join(outDir, 'nfp-data', 'slides', meta.hash, '0001.webp'));
    expect(img.size).toBeGreaterThan(0);
  });

  it('writes only meta.json status when slides are not resolved', async () => {
    const dbPath = path.join(tmp, '.note-first-presenter.json');
    await fs.writeFile(
      dbPath,
      JSON.stringify({ version: 1, title: '', outline: { type: 'doc', content: [] } }),
    );
    const outDir = path.join(tmp, 'dist');

    await writeBuildData({
      outDir,
      dbPath,
      cacheRoot: path.join(tmp, 'cache'),
      slidesStatus: { kind: 'no-config-no-file' },
    });

    const meta = JSON.parse(await fs.readFile(path.join(outDir, 'nfp-data', 'meta.json'), 'utf8'));
    expect(meta.kind).toBe('no-config-no-file');
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `vp test -F @note-first-presenter/client build-data`
Expected: FAIL（`writeBuildData` 未定義）。

- [ ] **Step 3: 実装を書く**

Create `packages/client/src/lib/pipeline/build-data.ts`:

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readDb } from '$lib/server/db-io';
import { renderAllSlides } from './render-slides';

type SlidesStatus =
  | { kind: 'resolved'; path: string }
  | { kind: 'configured-but-missing'; configuredPath: string }
  | { kind: 'no-config-no-file' }
  | { kind: 'no-config-multiple-files'; candidates: string[] };

export interface WriteBuildDataOptions {
  outDir: string;
  dbPath: string;
  cacheRoot: string;
  slidesStatus: SlidesStatus;
}

export async function writeBuildData(opts: WriteBuildDataOptions): Promise<void> {
  const dataDir = path.join(opts.outDir, 'nfp-data');
  await fs.mkdir(dataDir, { recursive: true });

  const db = await readDb(opts.dbPath);
  await fs.writeFile(path.join(dataDir, 'db.json'), JSON.stringify(db), 'utf8');

  if (opts.slidesStatus.kind !== 'resolved') {
    await fs.writeFile(path.join(dataDir, 'meta.json'), JSON.stringify(opts.slidesStatus), 'utf8');
    return;
  }

  const rendered = await renderAllSlides({
    slidesPath: opts.slidesStatus.path,
    cacheRoot: opts.cacheRoot,
    outDir: path.join(dataDir, 'slides', '__pending__'),
  });
  // rename pending dir to the hash dir now that hash is known
  await fs.rename(
    path.join(dataDir, 'slides', '__pending__'),
    path.join(dataDir, 'slides', rendered.hash),
  );
  await fs.writeFile(
    path.join(dataDir, 'meta.json'),
    JSON.stringify({ status: 'resolved', hash: rendered.hash, pageCount: rendered.pageCount }),
    'utf8',
  );
}
```

注意: `renderAllSlides` は呼ぶまで hash が分からないため、一旦 `__pending__` に出して rename する。

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `vp test -F @note-first-presenter/client build-data`
Expected: PASS（2 件）。

- [ ] **Step 5: コミット**

```bash
git add packages/client/src/lib/pipeline/build-data.ts packages/client/src/lib/pipeline/__tests__/build-data.test.ts
git commit -m "Add pipeline build-data writer for static output"
```

---

## Task 7: plugin に `mode` と `virtual:nfp/mode` を追加

build モードをクライアントへ安全に伝える。`runtime-config` に `mode` を追加し、別途クライアント安全な `virtual:nfp/mode`（`isStatic`）を提供する。

**Files:**

- Modify: `packages/note-first-presenter/src/plugin/virtual-modules.ts`
- Modify: `packages/note-first-presenter/src/plugin/index.ts`
- Test: `packages/note-first-presenter/src/plugin/__tests__/virtual-modules.test.ts`

- [ ] **Step 1: 失敗するテストを追加**

Append to `packages/note-first-presenter/src/plugin/__tests__/virtual-modules.test.ts`（既存の describe 構造に合わせて追記。先頭の import に `buildModeModuleSource` を追加）:

```ts
import { buildModeModuleSource } from '../virtual-modules';

describe('buildModeModuleSource', () => {
  it('emits isStatic=true for build mode', () => {
    expect(buildModeModuleSource('build')).toContain('isStatic = true');
  });
  it('emits isStatic=false for dev mode', () => {
    expect(buildModeModuleSource('dev')).toContain('isStatic = false');
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `vp test -F note-first-presenter virtual-modules`
Expected: FAIL（`buildModeModuleSource` 未定義）。

- [ ] **Step 3: virtual-modules を更新**

Modify `packages/note-first-presenter/src/plugin/virtual-modules.ts`:

- `RuntimeConfigInput` に `mode: 'dev' | 'build'` を追加。
- `buildVirtualConfigModuleSource` の `cfg` に `mode: input.mode` を含める。
- 末尾に追加:

```ts
export function buildModeModuleSource(mode: 'dev' | 'build'): string {
  return `export const isStatic = ${mode === 'build'};\n`;
}
```

- [ ] **Step 4: plugin index で新モジュールを解決**

Modify `packages/note-first-presenter/src/plugin/index.ts`:

- import に `buildModeModuleSource` を追加。
- モジュール ID 定数を追加:

```ts
const MODE_ID = 'virtual:nfp/mode';
const RESOLVED_MODE_ID = '\0' + MODE_ID;
```

- `resolveId` を両対応に:

```ts
resolveId(id) {
  if (id === MODULE_ID) return RESOLVED_ID;
  if (id === MODE_ID) return RESOLVED_MODE_ID;
  return null;
},
```

- `load` を両対応に:

```ts
load(id) {
  if (id === RESOLVED_ID) return buildVirtualConfigModuleSource(current);
  if (id === RESOLVED_MODE_ID) return buildModeModuleSource(current.mode);
  return null;
},
```

- [ ] **Step 5: 既存呼び出し元に `mode` を渡す**

Modify `packages/note-first-presenter/src/server.ts` — `noteFirstPresenterPlugin({ ... })` の引数に `mode: 'dev'` を追加。
Modify `packages/note-first-presenter/src/plugin/index.ts` の `configureServer` 内 `onChange` で `current = { ...current, ... }` は `mode` を保持するため変更不要（spread で維持）。

- [ ] **Step 6: テストを実行して通ることを確認**

Run: `vp test -F note-first-presenter virtual-modules`
Expected: PASS（新規 2 件 + 既存）。`vp check` も後続 Task で通すが、ここで型エラーが出る場合は `RuntimeConfigInput` 利用箇所に `mode` を補う。

- [ ] **Step 7: コミット**

```bash
git add packages/note-first-presenter/src/plugin packages/note-first-presenter/src/server.ts
git commit -m "Add mode virtual module for build/dev distinction"
```

---

## Task 8: クライアントの URL 切替ヘルパー（`runtime-mode.ts`）

dev/build でデータ取得 URL を切り替える単一の窓口。

**Files:**

- Create: `packages/client/src/lib/runtime-mode.ts`
- Modify: `packages/client/src/app.d.ts`
- Test: `packages/client/src/lib/__tests__/runtime-mode.test.ts`

- [ ] **Step 1: `virtual:nfp/mode` の型と runtime-config の `mode` を宣言**

Modify `packages/client/src/app.d.ts`:

- `const config: { ... }` の型に `mode: 'dev' | 'build';` を追加。
- ファイル末尾に追加:

```ts
declare module 'virtual:nfp/mode' {
  export const isStatic: boolean;
}
```

- [ ] **Step 2: 失敗するテストを書く**

テストでは仮想モジュールをモックする。Create `packages/client/src/lib/__tests__/runtime-mode.test.ts`:

```ts
import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('virtual:nfp/mode', () => ({ isStatic: false }));

describe('runtime-mode (dev)', () => {
  it('returns api URLs in dev mode', async () => {
    const { metaUrl, dbUrl, slideUrl } = await import('../runtime-mode');
    expect(metaUrl()).toBe('/api/slides/meta');
    expect(dbUrl()).toBe('/api/db');
    expect(slideUrl('abc', 1)).toBe('/api/slide/abc/1');
  });
});
```

- [ ] **Step 3: テストを実行して落ちることを確認**

Run: `vp test -F @note-first-presenter/client runtime-mode`
Expected: FAIL（`runtime-mode` 未定義）。

- [ ] **Step 4: 実装を書く**

Create `packages/client/src/lib/runtime-mode.ts`:

```ts
import { isStatic } from 'virtual:nfp/mode';

export { isStatic };

export function metaUrl(): string {
  return isStatic ? '/nfp-data/meta.json' : '/api/slides/meta';
}

export function dbUrl(): string {
  return isStatic ? '/nfp-data/db.json' : '/api/db';
}

export function slideUrl(hash: string, n: number): string {
  return isStatic
    ? `/nfp-data/slides/${hash}/${String(n).padStart(4, '0')}.webp`
    : `/api/slide/${hash}/${n}`;
}
```

- [ ] **Step 5: テストを実行して通ることを確認**

Run: `vp test -F @note-first-presenter/client runtime-mode`
Expected: PASS（1 件）。

- [ ] **Step 6: コミット**

```bash
git add packages/client/src/lib/runtime-mode.ts packages/client/src/lib/__tests__/runtime-mode.test.ts packages/client/src/app.d.ts
git commit -m "Add runtime-mode URL helper for static build"
```

---

## Task 9: クライアントを URL ヘルパー経由に切替 + 読み取り専用化

`SlideImage` / `SlidesMetaStore` / `+page.svelte` / `slideshow/+page.svelte` / `Outliner.svelte` を build モード対応にする。

**Files:**

- Modify: `packages/client/src/lib/slide-image/SlideImage.svelte`
- Modify: `packages/client/src/lib/slides-meta/slides-meta-store.svelte.ts`
- Modify: `packages/client/src/lib/outliner/Outliner.svelte`
- Modify: `packages/client/src/routes/+page.svelte`
- Modify: `packages/client/src/routes/slideshow/+page.svelte`

- [ ] **Step 1: SlideImage を URL ヘルパー経由に**

Modify `packages/client/src/lib/slide-image/SlideImage.svelte` の `<script>` 末尾に追加し、`<img>` の src を差し替える:

```svelte
<script lang="ts">
	import { slideUrl } from '$lib/runtime-mode';

	interface Props {
		hash: string;
		slide: number;
		alt?: string;
	}

	const { hash, slide, alt = '' }: Props = $props();
	const src = $derived(slideUrl(hash, slide));
</script>

<img {src} {alt} loading="lazy" />
```

（`<style>` は変更なし）

- [ ] **Step 2: SlidesMetaStore を URL ヘルパー経由に**

Modify `packages/client/src/lib/slides-meta/slides-meta-store.svelte.ts`:

- import に `import { metaUrl } from '$lib/runtime-mode';` を追加。
- `load()` 内 `this.data = await api<SlidesMeta>('/api/slides/meta');` を `this.data = await api<SlidesMeta>(metaUrl());` に変更。

- [ ] **Step 3: Outliner に editable prop を追加**

Modify `packages/client/src/lib/outliner/Outliner.svelte`:

- `interface Props` に `editable?: boolean;` を追加。
- `EditorView` 生成オプションに次を追加（`attributes` の隣）:

```ts
editable: () => props.editable ?? true,
```

- [ ] **Step 4: presenter `+page.svelte` を読み取り専用対応**

Modify `packages/client/src/routes/+page.svelte`:

- import に追加: `import { dbUrl, isStatic } from '$lib/runtime-mode';`
- `DbStore` 生成の `save` を build モードで no-op に:

```ts
const db = new DbStore({
  initial: { version: 1, title: '', outline: EMPTY_DOC },
  save: (state) => (isStatic ? Promise.resolve() : api('/api/db', { method: 'PUT', body: state })),
});
```

- `onMount` 内 `const initial = (await api('/api/db')) as DbV1;` を `const initial = (await api(dbUrl())) as DbV1;` に変更。
- title 入力を build モードで readonly に（`<input type="text" ... readonly={isStatic} />` を追加）。
- `<Outliner ... />` に `editable={!isStatic}` を追加。

- [ ] **Step 5: slideshow `+page.svelte` は SlideImage 経由なので追加変更不要を確認**

`slideshow/+page.svelte` は `SlideImage` と `SlidesMetaStore` のみ利用しデータ取得 URL を直書きしていないため、Step 1/2 の変更で build モードに追従する。確認のみ（変更なし）。

- [ ] **Step 6: 既存テスト・型チェックを実行**

Run:

```bash
vp test -F @note-first-presenter/client
vp check
```

Expected: PASS。Svelte コンポーネントテストが `virtual:nfp/mode` 解決で落ちる場合は、当該テストの先頭で `vi.mock('virtual:nfp/mode', () => ({ isStatic: false }))` を追加する。

- [ ] **Step 7: コミット**

```bash
git add packages/client/src
git commit -m "Switch client data fetching to runtime-mode and add read-only build mode"
```

---

## Task 10: adapter 切替と prerender 設定

`NFP_STATIC` 環境変数で adapter を切り替え、build 時は `/` と `/slideshow` を prerender する。

**Files:**

- Modify: `packages/client/svelte.config.js`
- Create: `packages/client/src/routes/+layout.ts`

- [ ] **Step 1: svelte.config.js で adapter を切替**

Modify `packages/client/svelte.config.js`:

```js
import adapterAuto from '@sveltejs/adapter-auto';
import adapterStatic from '@sveltejs/adapter-static';

const isStatic = process.env.NFP_STATIC === '1';
const outDir = process.env.NFP_OUT_DIR || 'build';

const config = {
  kit: {
    adapter: isStatic
      ? adapterStatic({
          pages: outDir,
          assets: outDir,
          fallback: undefined,
          precompress: false,
          strict: true,
        })
      : adapterAuto(),
  },
};

export default config;
```

- [ ] **Step 2: layout で build 時のみ prerender 有効化**

Create `packages/client/src/routes/+layout.ts`:

```ts
import { isStatic } from 'virtual:nfp/mode';

export const prerender = isStatic;
export const ssr = true;
```

- [ ] **Step 3: 通常（dev/adapter-auto）ビルドが壊れていないことを確認**

Run:

```bash
vp check
vp build -F @note-first-presenter/client
```

Expected: 通常ビルドが成功（adapter-auto、prerender 無効）。`vp build` が無い/別名の場合は `vp run --help` で確認し、SvelteKit ビルドに相当する script を使う。

- [ ] **Step 4: コミット**

```bash
git add packages/client/svelte.config.js packages/client/src/routes/+layout.ts
git commit -m "Add adapter-static switch and prerender for static build"
```

---

## Task 11: CLI config デフォルト解決

config 値・CLI フラグ・デフォルトを統合して絶対パスへ解決するヘルパー。

**Files:**

- Create: `packages/note-first-presenter/src/config/defaults.ts`
- Test: `packages/note-first-presenter/src/config/__tests__/defaults.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

Create `packages/note-first-presenter/src/config/__tests__/defaults.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { resolveBuildOptions, resolveExportOptions } from '../defaults';

const cwd = '/proj';

describe('resolveBuildOptions', () => {
  it('defaults outDir to dist', () => {
    expect(resolveBuildOptions({ cwd, config: null, flags: {} }).outDir).toBe(
      path.join(cwd, 'dist'),
    );
  });
  it('lets a CLI flag override config and default', () => {
    const out = resolveBuildOptions({
      cwd,
      config: { build: { outDir: 'site' } },
      flags: { outDir: 'public' },
    });
    expect(out.outDir).toBe(path.join(cwd, 'public'));
  });
});

describe('resolveExportOptions', () => {
  it('applies defaults and resolves imageDir under outDir', () => {
    const out = resolveExportOptions({
      cwd,
      config: { export: { format: { template: 'tpl.eta', extension: 'md' } } },
      flags: {},
    });
    expect(out.outDir).toBe(path.join(cwd, 'export'));
    expect(out.imageDir).toBe(path.join(cwd, 'export', 'images'));
    expect(out.imageRelDir).toBe('images');
    expect(out.templatePath).toBe(path.join(cwd, 'tpl.eta'));
    expect(out.extension).toBe('md');
  });
  it('throws when export.format is missing', () => {
    expect(() => resolveExportOptions({ cwd, config: { export: {} }, flags: {} })).toThrow(
      /format/i,
    );
  });
});
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `vp test -F note-first-presenter defaults`
Expected: FAIL（未定義）。

- [ ] **Step 3: 実装を書く**

Create `packages/note-first-presenter/src/config/defaults.ts`:

```ts
import path from 'node:path';
import type { NoteFirstPresenterConfig } from './schema';

export interface BuildOptions {
  outDir: string;
}

export interface ResolveBuildArgs {
  cwd: string;
  config: NoteFirstPresenterConfig | null;
  flags: { outDir?: string };
}

export function resolveBuildOptions(args: ResolveBuildArgs): BuildOptions {
  const configured = args.config?.build?.outDir;
  const dir = args.flags.outDir ?? configured ?? 'dist';
  return { outDir: path.resolve(args.cwd, dir) };
}

export interface ExportOptions {
  outDir: string;
  imageDir: string;
  imageRelDir: string;
  templatePath: string;
  extension: string;
}

export interface ResolveExportArgs {
  cwd: string;
  config: NoteFirstPresenterConfig | null;
  flags: { outDir?: string; imageDir?: string; template?: string };
}

export function resolveExportOptions(args: ResolveExportArgs): ExportOptions {
  const exportCfg = args.config?.export;
  const template = args.flags.template ?? exportCfg?.format?.template;
  const extension = exportCfg?.format?.extension;
  if (!template || !extension) {
    throw new Error('export requires "format.template" and "format.extension" in config');
  }
  const outDir = path.resolve(args.cwd, args.flags.outDir ?? exportCfg?.outDir ?? 'export');
  const imageRelDir = args.flags.imageDir ?? exportCfg?.imageDir ?? 'images';
  return {
    outDir,
    imageDir: path.resolve(outDir, imageRelDir),
    imageRelDir,
    templatePath: path.resolve(args.cwd, template),
    extension,
  };
}
```

注意: `imageRelDir` はテンプレートが参照する相対 URL 断片。ネストした相対パスを指定された場合も文字列としてそのまま使う（POSIX 想定）。

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `vp test -F note-first-presenter defaults`
Expected: PASS（4 件）。

- [ ] **Step 5: コミット**

```bash
git add packages/note-first-presenter/src/config/defaults.ts packages/note-first-presenter/src/config/__tests__/defaults.test.ts
git commit -m "Add build/export option resolution with defaults"
```

---

## Task 12: `runExport`（CLI 側オーケストレーション）

config / slides を解決し、client のパイプライン export を呼ぶ。slides 未解決時はエラー。

**Files:**

- Create: `packages/note-first-presenter/src/export.ts`
- Reference: `packages/note-first-presenter/src/server.ts`（clientRoot 解決・config/slides 解決のパターン）

- [ ] **Step 1: 実装を書く**

Create `packages/note-first-presenter/src/export.ts`:

```ts
import path from 'node:path';
import { runPipelineExport } from '@note-first-presenter/client/pipeline/export';
import { resolveExportOptions } from './config/defaults';
import { loadNfpConfig } from './config/load-config';
import { resolveSlidesPath } from './config/resolve-slides-path';

export interface RunExportArgs {
  outDir?: string;
  imageDir?: string;
  template?: string;
}

export async function runExport(flags: RunExportArgs): Promise<void> {
  const cwd = process.cwd();
  const { config, filePath } = await loadNfpConfig(cwd);
  const slidesStatus = await resolveSlidesPath({
    cwd,
    configuredSlides: config?.slides,
    configFile: filePath,
  });
  if (slidesStatus.kind !== 'resolved') {
    throw new Error(`slides not available: ${slidesStatus.kind}`);
  }
  const opts = resolveExportOptions({ cwd, config, flags });
  const name = path.basename(slidesStatus.path, path.extname(slidesStatus.path)) || 'notes';

  const outFile = await runPipelineExport({
    slidesPath: slidesStatus.path,
    dbPath: path.join(cwd, '.note-first-presenter.json'),
    cacheRoot: path.join(cwd, 'node_modules', '.note-first-presenter'),
    outDir: opts.outDir,
    imageDir: opts.imageDir,
    imageRelDir: opts.imageRelDir,
    templatePath: opts.templatePath,
    extension: opts.extension,
    name,
  });
  console.log(`Exported to ${outFile}`);
}
```

注意: `@note-first-presenter/client/pipeline/export` のサブパス import が解決できるよう、client の `package.json` に `exports` サブパスを追加する必要がある（Task 14 で対応）。本 Task ではまず実装を書き、解決は Task 14 で確定する。

- [ ] **Step 2: 型チェック（client サブパス未設定なら一旦保留）**

Run: `vp check -F note-first-presenter`
Expected: client サブパス未設定だと未解決エラーになり得る。エラーが出た場合は Task 14 の `exports` 追加後に再確認するため、ここではコミットのみ進める（テストは Task 15 の統合テストで担保）。

- [ ] **Step 3: コミット**

```bash
git add packages/note-first-presenter/src/export.ts
git commit -m "Add runExport CLI orchestration"
```

---

## Task 13: `runBuild`（CLI 側オーケストレーション）

clientRoot へ chdir し `NFP_STATIC=1` で SvelteKit を静的ビルド、その後 `nfp-data/` を書き出す。

**Files:**

- Create: `packages/note-first-presenter/src/build.ts`
- Reference: `packages/note-first-presenter/src/server.ts`

- [ ] **Step 1: 実装を書く**

Create `packages/note-first-presenter/src/build.ts`:

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite-plus';
import { findClosestPkgJsonPath } from 'vitefu';
import { writeBuildData } from '@note-first-presenter/client/pipeline/build-data';
import { resolveBuildOptions } from './config/defaults';
import { loadNfpConfig } from './config/load-config';
import { resolveSlidesPath } from './config/resolve-slides-path';
import { noteFirstPresenterPlugin } from './plugin';

export interface RunBuildArgs {
  outDir?: string;
}

export async function runBuild(flags: RunBuildArgs): Promise<void> {
  const cwd = process.cwd();
  const { config, filePath } = await loadNfpConfig(cwd);
  const slidesStatus = await resolveSlidesPath({
    cwd,
    configuredSlides: config?.slides,
    configFile: filePath,
  });
  const { outDir } = resolveBuildOptions({ cwd, config, flags });

  const clientPkgJsonStart = path.dirname(
    fileURLToPath(import.meta.resolve('@note-first-presenter/client/package.json')),
  );
  const clientPkgJson = await findClosestPkgJsonPath(clientPkgJsonStart);
  if (!clientPkgJson) throw new Error('Cannot resolve @note-first-presenter/client');
  const clientRoot = path.dirname(clientPkgJson);

  process.chdir(clientRoot);
  process.env.NFP_STATIC = '1';
  process.env.NFP_OUT_DIR = outDir;

  await build({
    root: clientRoot,
    configFile: path.join(clientRoot, 'vite.config.ts'),
    plugins: [noteFirstPresenterPlugin({ cwd, slidesStatus, fullConfig: config, mode: 'build' })],
  });

  await writeBuildData({
    outDir,
    dbPath: path.join(cwd, '.note-first-presenter.json'),
    cacheRoot: path.join(cwd, 'node_modules', '.note-first-presenter'),
    slidesStatus,
  });

  console.log(`Built static site to ${outDir}`);
}
```

注意: `build` が `vite-plus` から named export されているか `node_modules/vite-plus` の型で確認する。無ければ Vite の `build` 相当 API（`vite-plus` 経由の programmatic build）を使う。`adapter-static` の出力先は `svelte.config.js` が `NFP_OUT_DIR` を読むため、ここで env を設定してから `build()` する。

- [ ] **Step 2: 型チェック（client サブパス未設定なら保留）**

Run: `vp check -F note-first-presenter`
Expected: Task 14 の `exports` 追加後に解決。ここではコミットのみ。

- [ ] **Step 3: コミット**

```bash
git add packages/note-first-presenter/src/build.ts
git commit -m "Add runBuild CLI orchestration"
```

---

## Task 14: client の pipeline サブパス export を公開

CLI から `@note-first-presenter/client/pipeline/*` を import できるよう `exports` を追加する。

**Files:**

- Modify: `packages/client/package.json`（`exports` フィールド。`package.json` の依存欄は触らない）

- [ ] **Step 1: exports サブパスを追加**

Modify `packages/client/package.json` — トップレベルに `exports` を追加（依存欄は変更しない）:

```json
"exports": {
  "./pipeline/export": "./src/lib/pipeline/export.ts",
  "./pipeline/build-data": "./src/lib/pipeline/build-data.ts"
}
```

注意: client は publish 時に `src` を含む（`files` に `src` あり）。パイプラインモジュールは `$lib` エイリアスを使うため、CLI（非 Vite の tsdown/Node 実行）から TS ソースを直接 import すると `$lib` が解決できない懸念がある。`$lib` 依存を避けるため、`render-slides.ts` / `export.ts` / `build-data.ts` 内の `$lib/server/...` import を**相対パス**（`../server/...`）へ変更する。具体的には:

- `render-slides.ts`: `import { ... } from '$lib/server/pdf-renderer'` → `from '../server/pdf-renderer'`
- `export.ts`: `import { readDb } from '$lib/server/db-io'` → `from '../server/db-io'`
- `build-data.ts`: `import { readDb } from '$lib/server/db-io'` → `from '../server/db-io'`

- [ ] **Step 2: client テストが相対 import 変更後もグリーンか確認**

Run: `vp test -F @note-first-presenter/client`
Expected: PASS（import 変更は等価）。

- [ ] **Step 3: CLI 側の型チェックを確認**

Run: `vp check`
Expected: PASS（`@note-first-presenter/client/pipeline/*` が解決）。解決しない場合、CLI パッケージの `tsconfig`/bundler 設定（`moduleResolution: bundler`）で TS サブパスが引けるか確認し、必要なら client の `exports` の `types` 条件を補う。

- [ ] **Step 4: コミット**

```bash
git add packages/client/package.json packages/client/src/lib/pipeline
git commit -m "Expose pipeline subpath exports and drop $lib alias from pipeline modules"
```

---

## Task 15: CLI subcommands 配線 + 統合テスト

`cli.ts` に `build` / `export` サブコマンドを追加し、CLI から end-to-end で export が動くことを統合テストで確認する。

**Files:**

- Modify: `packages/note-first-presenter/src/cli.ts`
- Modify: `packages/note-first-presenter/src/index.ts`
- Test: `packages/note-first-presenter/src/__tests__/export-integration.test.ts`

- [ ] **Step 1: 失敗する統合テストを書く**

Create `packages/note-first-presenter/src/__tests__/export-integration.test.ts`:

```ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { runExport } from '../export';

const SAMPLE = path.resolve(
  import.meta.dirname,
  '../../../client/src/lib/server/__tests__/fixtures/sample.pdf',
);
let tmp: string;
let origCwd: string;

beforeEach(async () => {
  origCwd = process.cwd();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-export-int-'));
  await fs.copyFile(SAMPLE, path.join(tmp, 'slides.pdf'));
  await fs.writeFile(
    path.join(tmp, '.note-first-presenter.json'),
    JSON.stringify({ version: 1, title: 'Deck', outline: { type: 'doc', content: [] } }),
  );
  await fs.writeFile(path.join(tmp, 'tpl.eta'), '# <%= it.title %> (<%= it.slideCount %>)');
  process.chdir(tmp);
});
afterEach(async () => {
  process.chdir(origCwd);
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('runExport (integration)', () => {
  it('renders the configured template into export/<name>.<ext>', async () => {
    await runExport({ template: 'tpl.eta' });
    const out = await fs.readFile(path.join(tmp, 'export', 'slides.md'), 'utf8');
    expect(out).toContain('# Deck');
    const img = await fs.stat(path.join(tmp, 'export', 'images', '0001.webp'));
    expect(img.size).toBeGreaterThan(0);
  });
});
```

注意: extension は config 由来。CLI フラグに extension 上書きは無いため、`tpl.eta` を渡しても extension は config の `export.format.extension` が必要。テストでは config ファイルを使わず flags で template を渡すが extension は未指定 → `resolveExportOptions` が throw する。これを避けるため、本テストでは config ファイル `note-first-presenter.config.ts` を置く方式に変更する（次 Step で調整）。

- [ ] **Step 2: テストを config ファイル方式に調整**

`export-integration.test.ts` の `beforeEach` に config 生成を追加し、`runExport({})` を引数なしで呼ぶ:

```ts
await fs.writeFile(
  path.join(tmp, 'note-first-presenter.config.ts'),
  `export default { slides: 'slides.pdf', export: { format: { template: 'tpl.eta', extension: 'md' } } };\n`,
);
```

そして `it` 内を `await runExport({});` に変更。`tpl.eta` 生成は維持。
（理由: `loadConfigFromFile` ベースのため tmp dir からは `export default { ... }` リテラルで書く必要がある — 既存 `load-config.test.ts` と同じ制約。）

- [ ] **Step 3: テストを実行して落ちることを確認**

Run: `vp test -F note-first-presenter export-integration`
Expected: FAIL（まだ `cli` 配線前でも `runExport` 自体は存在するため、import 解決後にロジックで PASS する可能性あり。falの主因は client サブパス/`$lib` 未解決や eta 実行差異。ここで実際の失敗内容を確認し、Task 5/14 の注記に従って修正する）。

- [ ] **Step 4: テストを通す**

`runExport` が end-to-end で通るよう、Task 5（eta API）・Task 14（サブパス/`$lib` 相対化）の注記を反映して修正する。
Run: `vp test -F note-first-presenter export-integration`
Expected: PASS（1 件）。

- [ ] **Step 5: cli.ts に subcommands を追加**

Modify `packages/note-first-presenter/src/cli.ts` の `mainCommand` に `subCommands` を追加:

```ts
export const mainCommand = defineCommand({
  meta: {
    name: 'note-first-presenter',
    version: '0.0.0',
    description: 'Start the presenter dev server',
  },
  args: {
    port: { type: 'string', default: '5173', alias: 'p' },
    host: { type: 'string', default: 'localhost' },
    open: { type: 'boolean', default: false, alias: 'o' },
  },
  subCommands: {
    build: defineCommand({
      meta: { name: 'build', description: 'Generate a static read-only site' },
      args: { 'out-dir': { type: 'string' } },
      async run({ args }) {
        const { runBuild } = await import('./build');
        await runBuild({ outDir: args['out-dir'] });
      },
    }),
    export: defineCommand({
      meta: { name: 'export', description: 'Export the deck via an eta template' },
      args: {
        'out-dir': { type: 'string' },
        'image-dir': { type: 'string' },
        template: { type: 'string' },
      },
      async run({ args }) {
        const { runExport } = await import('./export');
        await runExport({
          outDir: args['out-dir'],
          imageDir: args['image-dir'],
          template: args.template,
        });
      },
    }),
  },
  async run({ args }) {
    const { startServer } = await import('./server');
    await startServer({ port: Number(args.port), host: args.host, open: args.open });
  },
});
```

注意: citty では subcommand 指定時は親の `run` が実行されない（subcommand の `run` が走る）。引数なし起動で従来どおり dev サーバーが起動することを Step 7 で確認する。

- [ ] **Step 6: index.ts に公開 API を追加**

Modify `packages/note-first-presenter/src/index.ts` に追加:

```ts
export { runBuild } from './build';
export type { RunBuildArgs } from './build';
export { runExport } from './export';
export type { RunExportArgs } from './export';
```

- [ ] **Step 7: 全体確認**

Run:

```bash
vp check
vp test
```

Expected: PASS（全パッケージ）。`note-first-presenter --help` の手動確認で `build` / `export` がサブコマンドとして表示されることも確認（`vp run` 経由 or ビルド後 bin）。

- [ ] **Step 8: コミット**

```bash
git add packages/note-first-presenter/src
git commit -m "Wire build/export subcommands and add export integration test"
```

---

## Task 16: build の統合確認（E2E、最小）

CLI build が静的成果物を出力し、配信した slideshow がナビゲートできることを確認する。

**Files:**

- Create: `packages/note-first-presenter/src/__tests__/build-integration.test.ts`
- Reference: `e2e/`（既存 Playwright 構成。重い E2E は任意）

- [ ] **Step 1: build 統合テスト（成果物検証）を書く**

Create `packages/note-first-presenter/src/__tests__/build-integration.test.ts`:

```ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { runBuild } from '../build';

const SAMPLE = path.resolve(
  import.meta.dirname,
  '../../../client/src/lib/server/__tests__/fixtures/sample.pdf',
);
let tmp: string;
let origCwd: string;

beforeEach(async () => {
  origCwd = process.cwd();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-build-int-'));
  await fs.copyFile(SAMPLE, path.join(tmp, 'slides.pdf'));
  await fs.writeFile(
    path.join(tmp, '.note-first-presenter.json'),
    JSON.stringify({ version: 1, title: 'Deck', outline: { type: 'doc', content: [] } }),
  );
});
afterEach(async () => {
  process.chdir(origCwd);
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('runBuild (integration)', () => {
  it('emits static HTML and nfp-data', async () => {
    const outDir = path.join(tmp, 'dist');
    await runBuild({ outDir });
    // prerendered shells
    await fs.access(path.join(outDir, 'index.html'));
    await fs.access(path.join(outDir, 'slideshow.html'));
    // static data
    const meta = JSON.parse(await fs.readFile(path.join(outDir, 'nfp-data', 'meta.json'), 'utf8'));
    expect(meta.status).toBe('resolved');
    await fs.access(path.join(outDir, 'nfp-data', 'db.json'));
    await fs.access(path.join(outDir, 'nfp-data', 'slides', meta.hash, '0001.webp'));
  }, 120_000);
});
```

注意: 実際の prerender 出力ファイル名（`slideshow.html` か `slideshow/index.html`）は adapter-static の設定（`trailingSlash`）に依存する。Step 2 で実出力を確認し、アサーションのパスを実際の出力に合わせて修正する。`runBuild` は `process.chdir(clientRoot)` するため `afterEach` で必ず戻す。

- [ ] **Step 2: 実行して実出力に合わせて調整**

Run: `vp test -F note-first-presenter build-integration`
Expected: 初回は prerender 出力パスのズレで FAIL し得る。実際の `dist` 構成を確認し、`index.html` / `slideshow` の出力パスにアサーションを合わせて PASS させる。adapter-static が SPA fallback を要求してエラーになる場合は、`/` と `/slideshow` が完全 prerender 可能（外部データ取得はクライアント JS 実行時のみ）であることを前提に `strict: true` のままにする。prerender がデータ取得で失敗する場合は `+page.svelte` のデータ取得が `onMount`（ブラウザのみ）であることを再確認する。

- [ ] **Step 3: コミット**

```bash
git add packages/note-first-presenter/src/__tests__/build-integration.test.ts
git commit -m "Add build integration test for static output"
```

- [ ] **Step 4: (任意) E2E でナビゲーション確認**

既存 `e2e/` の Playwright に、build 成果物を `vite preview`/静的サーバーで配信して slideshow が矢印キーで進むケースを追加してよい。重く環境依存が高いため、CI 方針に応じて省略可。実施する場合は `playwright.config.ts` の `webServer` を静的配信に向ける fixture を追加する。

---

## Task 17: 仕上げ（ドキュメント・最終チェック）

**Files:**

- Modify: ルート `README.md`（build/export の使い方）
- Reference: spec `docs/superpowers/specs/2026-05-30-build-export-design.md`

- [ ] **Step 1: README に build/export の節を追加**

ルート `README.md` に、`note-first-presenter build`（静的サイト生成、`build.outDir`）と `note-first-presenter export`（eta テンプレート、`export.outDir`/`imageDir`/`format`）の使い方・config 例・テンプレート context（`title` / `slides[].image` / `slides[].notes` / `toMarkdown` / `toHtml`）を追記する。

- [ ] **Step 2: 全体の最終チェック**

Run:

```bash
vp check && vp test
```

Expected: 全 PASS。

- [ ] **Step 3: コミット**

```bash
git add README.md
git commit -m "Document build/export subcommands"
```

---

## Self-Review メモ

- **Spec カバレッジ:** CLI surface(Task15) / 共通パイプライン(Task1-6) / export 出力単位・context・ヘルパー(Task1,2,4,5) / build adapter-static・読み取り専用・静的データ(Task7-10,13) / config デフォルト(Task11) / テスト(各 Task + Task15,16) を網羅。
- **型整合:** `NoteNode`(Task1) / `RenderAllResult`(Task3) / `ExportContext`(Task4) / `resolveExportOptions`(Task11) のシグネチャを後続 Task の呼び出しと一致させた。
- **既知の確定待ち（実装時に実 API で確証する点、各 Step に注記済み）:**
  - `eta` の file render API 形（Task5）
  - `vite-plus` の `build` named export 有無（Task13）
  - client TS サブパス export の型解決（Task14）
  - adapter-static の prerender 出力ファイル名（Task16）
- これらは「実行して実際の出力/エラーに合わせて修正」をステップ内で指示済み。
