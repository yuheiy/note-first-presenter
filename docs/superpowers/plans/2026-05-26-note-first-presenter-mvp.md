# note-first-presenter MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF を素材に、Workflowy 風 outliner で書いたノートに沿ってプレゼンを進行できる開発サーバー型ツール（dev サーバー機能のみ・MVP）を実装する。

**Architecture:** pnpm + Vite+ モノレポ。`packages/note-first-presenter`（CLI + Vite plugin）が SvelteKit dev server を programmatic に起動し、`packages/client`（SvelteKit アプリ）を利用者プロジェクトに向けて稼働させる。サーバーは pdfjs-dist + @napi-rs/canvas で PDF を WebP にレンダリングしディスクキャッシュ、`+server.ts` で配信。クライアントは ProseMirror ベースの outliner、ARIA listbox のスライドリスト、BroadcastChannel による一方向 (presenter → slideshow) 同期で動く。

**Tech Stack:** TypeScript, SvelteKit, Svelte 5 runes, Vite+, ProseMirror, pdfjs-dist, @napi-rs/canvas, chokidar, ofetch, valibot, citty, bowser, @inlang/paraglide-js v2, Vitest (browser mode via @vitest/browser-playwright), Playwright

**Reference:** `docs/superpowers/specs/2026-05-26-note-first-presenter-design.md`

各タスクは「最小単位の動作可能変更 + テスト + コミット」が原則。各タスク末尾で git commit するとレビューしやすい。複雑な仕様は spec を逐次参照すること。

---

## Phase 1: Workspace & Tooling Setup

### Task 1: Create `packages/note-first-presenter` skeleton

**Files:**

- Create: `packages/note-first-presenter/package.json`
- Create: `packages/note-first-presenter/tsconfig.json`
- Create: `packages/note-first-presenter/vite.config.ts`
- Create: `packages/note-first-presenter/src/index.ts`

- [ ] **Step 1: Create directory and package.json**

```bash
mkdir -p packages/note-first-presenter/src
```

`packages/note-first-presenter/package.json`:

```json
{
  "name": "note-first-presenter",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": {
    "note-first-presenter": "./dist/cli.mjs"
  },
  "main": "./dist/index.mjs",
  "exports": {
    ".": "./dist/index.mjs",
    "./package.json": "./package.json"
  },
  "files": ["dist"],
  "scripts": {
    "build": "vp pack",
    "dev": "vp pack --watch",
    "test": "vp test",
    "check": "vp check"
  },
  "peerDependencies": {
    "@note-first-presenter/client": "workspace:*"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../utils/tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```ts
import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: { dts: { tsgo: true }, exports: true },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
});
```

- [ ] **Step 4: Create placeholder entry**

`packages/note-first-presenter/src/index.ts`:

```ts
export type NoteFirstPresenterConfig = {
  slides?: string;
};

export function defineConfig(config: NoteFirstPresenterConfig): NoteFirstPresenterConfig {
  return config;
}
```

- [ ] **Step 5: Run install and verify**

```bash
pnpm install
```

Expected: 成功、`packages/note-first-presenter/node_modules/` ができる。

- [ ] **Step 6: Commit**

```bash
git add packages/note-first-presenter
git commit -m "feat(cli): scaffold note-first-presenter package"
```

---

### Task 2: Create `packages/client` SvelteKit skeleton

**Files:**

- Create: `packages/client/package.json`
- Create: `packages/client/svelte.config.js`
- Create: `packages/client/vite.config.ts`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/src/app.html`
- Create: `packages/client/src/routes/+layout.svelte`
- Create: `packages/client/src/routes/+page.svelte` (placeholder)

- [ ] **Step 1: Create directory and package.json**

```bash
mkdir -p packages/client/src/routes packages/client/static packages/client/messages packages/client/project.inlang packages/client/tests/fixtures
```

`packages/client/package.json`:

```json
{
  "name": "@note-first-presenter/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vp test",
    "test:e2e": "playwright test",
    "check": "vp check"
  }
}
```

- [ ] **Step 2: Install runtime deps via CLI (do not hand-edit package.json)**

```bash
pnpm -F @note-first-presenter/client add svelte @sveltejs/kit @sveltejs/vite-plugin-svelte
pnpm -F @note-first-presenter/client add prosemirror-model prosemirror-state prosemirror-view prosemirror-transform prosemirror-commands prosemirror-history prosemirror-keymap
pnpm -F @note-first-presenter/client add ofetch valibot bowser esm-env @inlang/paraglide-js pdfjs-dist @napi-rs/canvas chokidar
pnpm -F @note-first-presenter/client add -D @types/node typescript svelte-check
pnpm -F @note-first-presenter/client add -D @vitest/browser-playwright vitest-browser-svelte playwright @playwright/test
```

- [ ] **Step 3: Create svelte.config.js**

```js
import adapter from '@sveltejs/adapter-auto';

const config = {
  kit: {
    adapter: adapter(),
  },
};

export default config;
```

- [ ] **Step 4: Create vite.config.ts**

```ts
import { defineConfig } from 'vite-plus';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  fmt: {},
  lint: { options: { typeAware: true } },
});
```

- [ ] **Step 5: Create tsconfig.json**

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```

- [ ] **Step 6: Create app.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

(`<html lang>` は Task 19 で Paraglide プレースホルダーに置き換える)

- [ ] **Step 7: Create placeholder routes**

`packages/client/src/routes/+layout.svelte`:

```svelte
<slot />
```

`packages/client/src/routes/+page.svelte`:

```svelte
<h1>note-first-presenter</h1>
```

- [ ] **Step 8: Add to .gitignore**

既存 `.gitignore` の末尾に追記:

```
packages/*/dist
packages/*/.svelte-kit
packages/client/src/lib/paraglide
```

- [ ] **Step 9: Run check**

```bash
pnpm -F @note-first-presenter/client exec svelte-kit sync
pnpm -F @note-first-presenter/client check || true
```

(初期は warning が出てもよい)

- [ ] **Step 10: Commit**

```bash
git add packages/client .gitignore
git commit -m "feat(client): scaffold SvelteKit client app"
```

---

### Task 3: Configure root scripts

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Update root scripts**

```json
{
  "scripts": {
    "ready": "vp check && vp run -r test && pnpm -F @note-first-presenter/client test:e2e",
    "dev": "vp run @note-first-presenter/client#dev",
    "test": "vp run -r test",
    "test:e2e": "pnpm -F @note-first-presenter/client test:e2e",
    "prepare": "vp config"
  }
}
```

- [ ] **Step 2: Verify**

```bash
pnpm test || true
```

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: wire root scripts"
```

---

## Phase 2: CLI Skeleton

### Task 4: CLI argument parsing with citty

**Files:**

- Create: `packages/note-first-presenter/src/cli.ts`
- Create: `packages/note-first-presenter/src/__tests__/cli.test.ts`

- [ ] **Step 1: Install citty**

```bash
pnpm -F note-first-presenter add citty
```

- [ ] **Step 2: Write failing test**

`packages/note-first-presenter/src/__tests__/cli.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../cli';

describe('parseCliArgs', () => {
  it('parses --port', () => {
    const args = parseCliArgs(['--port', '4000']);
    expect(args.port).toBe(4000);
  });

  it('defaults port to 5173', () => {
    const args = parseCliArgs([]);
    expect(args.port).toBe(5173);
  });

  it('parses --host', () => {
    const args = parseCliArgs(['--host', '0.0.0.0']);
    expect(args.host).toBe('0.0.0.0');
  });

  it('parses --open flag', () => {
    const args = parseCliArgs(['--open']);
    expect(args.open).toBe(true);
  });

  it('open defaults to false', () => {
    const args = parseCliArgs([]);
    expect(args.open).toBe(false);
  });
});
```

- [ ] **Step 3: Run, expect fail**

```bash
pnpm -F note-first-presenter test
```

- [ ] **Step 4: Implement cli.ts (parseCliArgs only first)**

```ts
import { defineCommand } from 'citty';

export interface CliArgs {
  port: number;
  host: string;
  open: boolean;
}

export function parseCliArgs(argv: string[]): CliArgs {
  // citty の defineCommand を使うと厳密だが、簡易 parser で十分
  const args: CliArgs = { port: 5173, host: 'localhost', open: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' || a === '-p') {
      args.port = Number(argv[++i]);
    } else if (a === '--host') {
      args.host = argv[++i] ?? 'localhost';
    } else if (a === '--open' || a === '-o') {
      args.open = true;
    }
  }
  return args;
}
```

- [ ] **Step 5: Run, expect pass**

- [ ] **Step 6: Add citty-based main command (for help/version)**

`packages/note-first-presenter/src/cli.ts` の末尾に追記:

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
  async run({ args }) {
    const { startServer } = await import('./server');
    await startServer({
      port: Number(args.port),
      host: args.host,
      open: args.open,
    });
  },
});
```

- [ ] **Step 7: Commit**

```bash
git add packages/note-first-presenter
git commit -m "feat(cli): parse CLI arguments"
```

---

### Task 5: Programmatic SvelteKit dev server starter

**Files:**

- Create: `packages/note-first-presenter/src/server.ts`
- Create: `packages/note-first-presenter/bin/note-first-presenter.mjs`

- [ ] **Step 1: Install runtime deps**

```bash
pnpm -F note-first-presenter add vite vitefu @sveltejs/kit @sveltejs/vite-plugin-svelte
```

- [ ] **Step 2: Implement server.ts**

```ts
import { createServer } from 'vite';
import { findClosestPkgJsonPath } from 'vitefu';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSlidesPath } from './config/resolve-slides-path';
import { loadNfpConfig } from './config/load-config';
import { noteFirstPresenterPlugin } from './plugin';

export interface StartServerOptions {
  port: number;
  host: string;
  open: boolean;
}

export async function startServer(opts: StartServerOptions): Promise<void> {
  const cwd = process.cwd();
  const { config, filePath } = await loadNfpConfig(cwd);
  const slidesStatus = await resolveSlidesPath({
    cwd,
    configuredSlides: config?.slides,
    configFile: filePath,
  });

  const clientPkgJson = await findClosestPkgJsonPath(
    path.dirname(fileURLToPath(import.meta.resolve('@note-first-presenter/client/package.json'))),
  );
  if (!clientPkgJson) throw new Error('Cannot resolve @note-first-presenter/client');
  const clientRoot = path.dirname(clientPkgJson);

  const server = await createServer({
    root: clientRoot,
    server: { port: opts.port, host: opts.host, open: opts.open ? '/' : false },
    plugins: [
      noteFirstPresenterPlugin({
        cwd,
        config,
        slidesStatus,
      }),
    ],
  });

  await server.listen();
  server.printUrls();

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
```

(`resolveSlidesPath`、`loadNfpConfig`、`noteFirstPresenterPlugin` は次のタスクで実装する)

- [ ] **Step 3: Create bin entry**

`packages/note-first-presenter/bin/note-first-presenter.mjs`:

```js
#!/usr/bin/env node
import { runMain } from 'citty';
import { mainCommand } from '../dist/cli.mjs';

await runMain(mainCommand);
```

- [ ] **Step 4: Update `package.json` bin field**

```json
"bin": { "note-first-presenter": "./bin/note-first-presenter.mjs" }
```

- [ ] **Step 5: Commit**

```bash
git add packages/note-first-presenter
git commit -m "feat(cli): programmatic SvelteKit dev server starter"
```

---

### Task 6: Config loader

**Files:**

- Create: `packages/note-first-presenter/src/config/load-config.ts`
- Create: `packages/note-first-presenter/src/config/schema.ts`
- Create: `packages/note-first-presenter/src/config/__tests__/load-config.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadNfpConfig } from '../load-config';

async function makeTmp() {
  return fs.mkdtemp(path.join(tmpdir(), 'nfp-config-'));
}

describe('loadNfpConfig', () => {
  it('returns null when no config file exists', async () => {
    const dir = await makeTmp();
    const result = await loadNfpConfig(dir);
    expect(result.config).toBeNull();
    expect(result.filePath).toBeNull();
  });

  it('loads .ts config', async () => {
    const dir = await makeTmp();
    const file = path.join(dir, 'note-first-presenter.config.ts');
    await fs.writeFile(
      file,
      `import { defineConfig } from 'note-first-presenter';\nexport default defineConfig({ slides: './x.pdf' });`,
    );
    const result = await loadNfpConfig(dir);
    expect(result.config?.slides).toBe('./x.pdf');
    expect(result.filePath).toBe(file);
  });

  it('rejects unknown keys via valibot', async () => {
    const dir = await makeTmp();
    const file = path.join(dir, 'note-first-presenter.config.js');
    await fs.writeFile(file, `export default { invalidKey: true };`);
    await expect(loadNfpConfig(dir)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Implement schema.ts**

```ts
import * as v from 'valibot';

export const configSchema = v.object({
  slides: v.optional(v.string()),
  build: v.optional(
    v.object({
      outDir: v.optional(v.string()),
    }),
  ),
  export: v.optional(
    v.object({
      outDir: v.optional(v.string()),
      imageDir: v.optional(v.string()),
      format: v.optional(
        v.object({
          template: v.string(),
          extension: v.string(),
        }),
      ),
    }),
  ),
});

export type NoteFirstPresenterConfig = v.InferOutput<typeof configSchema>;
```

- [ ] **Step 3: Implement load-config.ts**

```ts
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfigFromFile } from 'vite';
import * as v from 'valibot';
import { configSchema, type NoteFirstPresenterConfig } from './schema';

const CONFIG_NAMES = ['note-first-presenter.config.ts', 'note-first-presenter.config.js'] as const;

export async function loadNfpConfig(cwd: string): Promise<{
  config: NoteFirstPresenterConfig | null;
  filePath: string | null;
}> {
  for (const name of CONFIG_NAMES) {
    const fullPath = path.join(cwd, name);
    if (!existsSync(fullPath)) continue;
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'development' },
      fullPath,
      cwd,
    );
    if (!loaded) continue;
    const parsed = v.parse(configSchema, loaded.config);
    return { config: parsed, filePath: fullPath };
  }
  return { config: null, filePath: null };
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm -F note-first-presenter test
```

- [ ] **Step 5: Commit**

```bash
git add packages/note-first-presenter
git commit -m "feat(cli): load and validate config file"
```

---

### Task 7: Slides path resolver

**Files:**

- Create: `packages/note-first-presenter/src/config/resolve-slides-path.ts`
- Create: `packages/note-first-presenter/src/config/__tests__/resolve-slides-path.test.ts`

- [ ] **Step 1: Install dep**

```bash
pnpm -F note-first-presenter add tinyglobby
```

- [ ] **Step 2: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveSlidesPath } from '../resolve-slides-path';

async function makeTmp() {
  return fs.mkdtemp(path.join(tmpdir(), 'nfp-slides-'));
}

describe('resolveSlidesPath', () => {
  it('returns no-config-no-file when nothing exists', async () => {
    const cwd = await makeTmp();
    const result = await resolveSlidesPath({ cwd, configuredSlides: undefined, configFile: null });
    expect(result.kind).toBe('no-config-no-file');
  });

  it('returns resolved when a single PDF exists', async () => {
    const cwd = await makeTmp();
    const pdf = path.join(cwd, 'slides.pdf');
    await fs.writeFile(pdf, '%PDF-1.4');
    const result = await resolveSlidesPath({ cwd, configuredSlides: undefined, configFile: null });
    expect(result).toEqual({ kind: 'resolved', path: pdf });
  });

  it('returns no-config-multiple-files when many', async () => {
    const cwd = await makeTmp();
    await fs.writeFile(path.join(cwd, 'a.pdf'), '%PDF-1.4');
    await fs.writeFile(path.join(cwd, 'b.pdf'), '%PDF-1.4');
    const result = await resolveSlidesPath({ cwd, configuredSlides: undefined, configFile: null });
    expect(result.kind).toBe('no-config-multiple-files');
  });

  it('returns configured-but-missing when path does not exist', async () => {
    const cwd = await makeTmp();
    const result = await resolveSlidesPath({
      cwd,
      configuredSlides: './missing.pdf',
      configFile: path.join(cwd, 'note-first-presenter.config.ts'),
    });
    expect(result.kind).toBe('configured-but-missing');
  });

  it('resolves configured path relative to config file directory', async () => {
    const cwd = await makeTmp();
    const sub = path.join(cwd, 'docs');
    await fs.mkdir(sub, { recursive: true });
    const pdf = path.join(sub, 'main.pdf');
    await fs.writeFile(pdf, '%PDF-1.4');
    const result = await resolveSlidesPath({
      cwd,
      configuredSlides: './docs/main.pdf',
      configFile: path.join(cwd, 'note-first-presenter.config.ts'),
    });
    expect(result).toEqual({ kind: 'resolved', path: pdf });
  });
});
```

- [ ] **Step 3: Implement resolve-slides-path.ts**

```ts
import { existsSync } from 'node:fs';
import path from 'node:path';
import { glob } from 'tinyglobby';

export type SlidesStatus =
  | { kind: 'resolved'; path: string }
  | { kind: 'configured-but-missing'; configuredPath: string }
  | { kind: 'no-config-no-file' }
  | { kind: 'no-config-multiple-files'; candidates: string[] };

export interface ResolveSlidesArgs {
  cwd: string;
  configuredSlides: string | undefined;
  configFile: string | null;
}

export async function resolveSlidesPath(args: ResolveSlidesArgs): Promise<SlidesStatus> {
  if (args.configuredSlides) {
    const base = args.configFile ? path.dirname(args.configFile) : args.cwd;
    const abs = path.resolve(base, args.configuredSlides);
    return existsSync(abs)
      ? { kind: 'resolved', path: abs }
      : { kind: 'configured-but-missing', configuredPath: abs };
  }

  const pdfs = await glob('*.pdf', { cwd: args.cwd, absolute: true });
  if (pdfs.length === 0) return { kind: 'no-config-no-file' };
  if (pdfs.length === 1) return { kind: 'resolved', path: pdfs[0] };
  return { kind: 'no-config-multiple-files', candidates: pdfs };
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add packages/note-first-presenter
git commit -m "feat(cli): resolve slides path with auto-detect"
```

---

## Phase 3: Vite Plugin & Virtual Module

### Task 8: Vite plugin providing runtime config virtual module

**Files:**

- Create: `packages/note-first-presenter/src/plugin/index.ts`
- Create: `packages/note-first-presenter/src/plugin/virtual-modules.ts`
- Create: `packages/note-first-presenter/src/plugin/__tests__/virtual-modules.test.ts`

- [ ] **Step 1: Write failing test for virtual module emission**

```ts
import { describe, expect, it } from 'vitest';
import { buildVirtualConfigModuleSource } from '../virtual-modules';

describe('buildVirtualConfigModuleSource', () => {
  it('emits cwd, slidesStatus, dbPath, cacheRoot', () => {
    const src = buildVirtualConfigModuleSource({
      cwd: '/proj',
      slidesStatus: { kind: 'resolved', path: '/proj/a.pdf' },
      fullConfig: null,
    });
    expect(src).toContain(`"cwd":"/proj"`);
    expect(src).toContain(`"slidesStatus"`);
    expect(src).toContain(`"dbPath":"/proj/.note-first-presenter.json"`);
    expect(src).toContain(`"cacheRoot":"/proj/node_modules/.note-first-presenter"`);
  });
});
```

- [ ] **Step 2: Implement virtual-modules.ts**

```ts
import path from 'node:path';
import type { SlidesStatus } from '../config/resolve-slides-path';
import type { NoteFirstPresenterConfig } from '../config/schema';

export interface RuntimeConfigInput {
  cwd: string;
  slidesStatus: SlidesStatus;
  fullConfig: NoteFirstPresenterConfig | null;
}

export function buildVirtualConfigModuleSource(input: RuntimeConfigInput): string {
  const cfg = {
    cwd: input.cwd,
    slidesStatus: input.slidesStatus,
    dbPath: path.join(input.cwd, '.note-first-presenter.json'),
    cacheRoot: path.join(input.cwd, 'node_modules', '.note-first-presenter'),
    fullConfig: input.fullConfig,
  };
  return `export default ${JSON.stringify(cfg)};\n`;
}
```

- [ ] **Step 3: Run, expect pass**

- [ ] **Step 4: Implement plugin/index.ts**

```ts
import type { Plugin } from 'vite';
import { buildVirtualConfigModuleSource, type RuntimeConfigInput } from './virtual-modules';

const MODULE_ID = 'virtual:nfp/runtime-config';
const RESOLVED_ID = '\0' + MODULE_ID;

export interface NfpPluginOptions extends RuntimeConfigInput {}

export function noteFirstPresenterPlugin(opts: NfpPluginOptions): Plugin {
  let current = opts;
  return {
    name: 'note-first-presenter',
    resolveId(id) {
      if (id === MODULE_ID) return RESOLVED_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_ID) return buildVirtualConfigModuleSource(current);
      return null;
    },
  };
}
```

- [ ] **Step 5: Add ambient type declaration**

`packages/client/src/app.d.ts` (create if missing):

```ts
declare module 'virtual:nfp/runtime-config' {
  import type { NoteFirstPresenterConfig } from 'note-first-presenter';
  type SlidesStatus =
    | { kind: 'resolved'; path: string }
    | { kind: 'configured-but-missing'; configuredPath: string }
    | { kind: 'no-config-no-file' }
    | { kind: 'no-config-multiple-files'; candidates: string[] };
  const config: {
    cwd: string;
    slidesStatus: SlidesStatus;
    dbPath: string;
    cacheRoot: string;
    fullConfig: NoteFirstPresenterConfig | null;
  };
  export default config;
}
```

- [ ] **Step 6: Commit**

```bash
git add packages
git commit -m "feat(plugin): expose runtime config via virtual module"
```

---

### Task 9: File watchers for dynamic re-evaluation

**Files:**

- Create: `packages/note-first-presenter/src/plugin/file-watchers.ts`
- Modify: `packages/note-first-presenter/src/plugin/index.ts`

- [ ] **Step 1: Implement file-watchers.ts**

```ts
import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import type { SlidesStatus } from '../config/resolve-slides-path';

export interface WatcherInput {
  cwd: string;
  slidesStatus: SlidesStatus;
  vite: ViteDevServer;
  onChange: () => Promise<void> | void;
}

export function initFileWatchers(input: WatcherInput): () => Promise<void> {
  const watchers: FSWatcher[] = [];
  const rootWatcher = chokidar.watch('*.pdf', {
    cwd: input.cwd,
    depth: 0,
    ignoreInitial: true,
  });
  rootWatcher.on('add', () => void input.onChange());
  rootWatcher.on('unlink', () => void input.onChange());
  watchers.push(rootWatcher);

  const configPaths = [
    path.join(input.cwd, 'note-first-presenter.config.ts'),
    path.join(input.cwd, 'note-first-presenter.config.js'),
  ];
  const configWatcher = chokidar.watch(configPaths, { ignoreInitial: true });
  configWatcher.on('add', () => void input.onChange());
  configWatcher.on('change', () => void input.onChange());
  configWatcher.on('unlink', () => void input.onChange());
  watchers.push(configWatcher);

  if (input.slidesStatus.kind === 'resolved') {
    const pdfWatcher = chokidar.watch(input.slidesStatus.path, {
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });
    pdfWatcher.on('change', () => void input.onChange());
    watchers.push(pdfWatcher);
  }

  return async () => {
    await Promise.all(watchers.map((w) => w.close()));
  };
}
```

- [ ] **Step 2: Wire into plugin (configureServer)**

`packages/note-first-presenter/src/plugin/index.ts` を更新:

```ts
import { initFileWatchers } from './file-watchers';
import { loadNfpConfig } from '../config/load-config';
import { resolveSlidesPath } from '../config/resolve-slides-path';

export function noteFirstPresenterPlugin(opts: NfpPluginOptions): Plugin {
  let current = opts;
  let closeWatchers: (() => Promise<void>) | null = null;
  return {
    name: 'note-first-presenter',
    resolveId(id) {
      if (id === MODULE_ID) return RESOLVED_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_ID) return buildVirtualConfigModuleSource(current);
      return null;
    },
    configureServer(server) {
      closeWatchers = initFileWatchers({
        cwd: current.cwd,
        slidesStatus: current.slidesStatus,
        vite: server,
        onChange: async () => {
          const { config, filePath } = await loadNfpConfig(current.cwd);
          const slidesStatus = await resolveSlidesPath({
            cwd: current.cwd,
            configuredSlides: config?.slides,
            configFile: filePath,
          });
          current = { ...current, fullConfig: config, slidesStatus };
          // invalidate the virtual module so it re-emits
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        },
      });
    },
    async closeBundle() {
      await closeWatchers?.();
    },
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/note-first-presenter
git commit -m "feat(plugin): watch PDFs / config and trigger full-reload"
```

---

## Phase 4: Server-side PDF Rendering

### Task 10: PDF cache path helper

**Files:**

- Create: `packages/client/src/lib/server/slide-cache.ts`
- Create: `packages/client/src/lib/server/__tests__/slide-cache.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { slideCachePath } from '../slide-cache';

describe('slideCachePath', () => {
  it('produces zero-padded 4-digit filenames under hash dir', () => {
    const p = slideCachePath('/proj/node_modules/.note-first-presenter', 'abc123', 7);
    expect(p).toBe('/proj/node_modules/.note-first-presenter/slides/abc123/0007.webp');
  });
  it('pads to 4 digits even at 1000+', () => {
    const p = slideCachePath('/r', 'h', 1234);
    expect(p).toBe('/r/slides/h/1234.webp');
  });
});
```

- [ ] **Step 2: Implement**

```ts
import path from 'node:path';

export function slideCachePath(cacheRoot: string, hash: string, pageNumber: number): string {
  return path.join(cacheRoot, 'slides', hash, `${String(pageNumber).padStart(4, '0')}.webp`);
}
```

- [ ] **Step 3: Add prune helper test**

```ts
it('prunes other hashes', async () => {
  const dir = await makeTmp();
  const slidesDir = path.join(dir, 'slides');
  await fs.mkdir(path.join(slidesDir, 'old'), { recursive: true });
  await fs.mkdir(path.join(slidesDir, 'new'), { recursive: true });
  await pruneOtherHashes(dir, 'new');
  expect(existsSync(path.join(slidesDir, 'old'))).toBe(false);
  expect(existsSync(path.join(slidesDir, 'new'))).toBe(true);
});
```

- [ ] **Step 4: Implement pruneOtherHashes in slide-cache.ts**

```ts
import { promises as fs } from 'node:fs';

export async function pruneOtherHashes(cacheRoot: string, currentHash: string): Promise<void> {
  const slidesDir = path.join(cacheRoot, 'slides');
  let entries: string[];
  try {
    entries = await fs.readdir(slidesDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  await Promise.all(
    entries
      .filter((name) => name !== currentHash)
      .map((name) => fs.rm(path.join(slidesDir, name), { recursive: true, force: true })),
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/server
git commit -m "feat(server): slide cache path helper and pruning"
```

---

### Task 11: PDF renderer with memoized load

**Files:**

- Create: `packages/client/src/lib/server/pdf-renderer.ts`
- Create: `packages/client/src/lib/server/__tests__/pdf-renderer.test.ts`
- Create: `packages/client/src/lib/server/__tests__/fixtures/sample.pdf` (commit a small PDF, e.g. 3-page test)

- [ ] **Step 1: Write integration test (will need a sample PDF in fixtures)**

サンプル PDF 生成スクリプト or 既存の小 PDF を `__tests__/fixtures/sample.pdf` にコミットする（< 10KB が望ましい）。生成方法は本タスク範囲外。

```ts
import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { resetPdfState, getSlideImage } from '../pdf-renderer';

const fixture = path.resolve(__dirname, 'fixtures/sample.pdf');

describe('pdf-renderer', () => {
  it('renders first page to webp and caches', async () => {
    const cacheRoot = await fs.mkdtemp(path.join(tmpdir(), 'nfp-cache-'));
    resetPdfState({ slidesPath: fixture, cacheRoot });
    const r1 = await getSlideImage(1);
    expect(r1.data.byteLength).toBeGreaterThan(0);
    expect(r1.pageCount).toBeGreaterThan(0);
    const r2 = await getSlideImage(1);
    expect(r1.data.equals(r2.data)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement pdf-renderer.ts**

```ts
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { slideCachePath, pruneOtherHashes } from './slide-cache';

const TARGET_SCALE = 2.0;
const WEBP_QUALITY = 85;

export class SlidesUnavailableError extends Error {
  constructor(public readonly status: unknown) {
    super('slides unavailable');
  }
  toJSON() {
    return this.status;
  }
}

export class PageOutOfRangeError extends Error {
  constructor(
    public readonly page: number,
    public readonly pageCount: number,
  ) {
    super(`page ${page} out of range (1..${pageCount})`);
  }
}

interface PdfState {
  slidesPath: string;
  cacheRoot: string;
  pdfP: Promise<{ hash: string; pdf: pdfjs.PDFDocumentProxy; pageCount: number }> | null;
}

let state: PdfState | null = null;

// For tests / dev reload
export function resetPdfState(input: { slidesPath: string; cacheRoot: string }) {
  state = { slidesPath: input.slidesPath, cacheRoot: input.cacheRoot, pdfP: null };
}

export function invalidatePdf() {
  if (state) state.pdfP = null;
}

function ensureState(): PdfState {
  if (!state) throw new Error('PDF state not initialized');
  return state;
}

async function loadAndHash(
  s: PdfState,
): Promise<{ hash: string; pdf: pdfjs.PDFDocumentProxy; pageCount: number }> {
  const bytes = await fs.readFile(s.slidesPath);
  const hash = createHash('sha256').update(bytes).digest('hex');
  await pruneOtherHashes(s.cacheRoot, hash);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  return { hash, pdf, pageCount: pdf.numPages };
}

function getPdf() {
  const s = ensureState();
  s.pdfP ??= loadAndHash(s);
  return s.pdfP;
}

export async function getSlidesMeta(): Promise<{ hash: string; pageCount: number }> {
  const { hash, pageCount } = await getPdf();
  return { hash, pageCount };
}

export async function getSlideImage(
  pageNumber: number,
): Promise<{ data: Buffer; hash: string; pageCount: number }> {
  const s = ensureState();
  const { hash, pdf, pageCount } = await getPdf();
  if (pageNumber < 1 || pageNumber > pageCount)
    throw new PageOutOfRangeError(pageNumber, pageCount);
  const cachePath = slideCachePath(s.cacheRoot, hash, pageNumber);
  try {
    const data = await fs.readFile(cachePath);
    return { data, hash, pageCount };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const data = await renderPage(pdf, pageNumber);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, data);
  return { data, hash, pageCount };
}

async function renderPage(pdf: pdfjs.PDFDocumentProxy, pageNumber: number): Promise<Buffer> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: TARGET_SCALE });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  await page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  return canvas.encode('webp', WEBP_QUALITY);
}
```

- [ ] **Step 3: Run, expect pass**

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/lib/server
git commit -m "feat(server): render PDF pages to webp with disk cache"
```

---

### Task 12: SvelteKit endpoint `/api/slides/meta`

**Files:**

- Create: `packages/client/src/routes/api/slides/meta/+server.ts`

- [ ] **Step 1: Implement endpoint**

```ts
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import runtimeConfig from 'virtual:nfp/runtime-config';
import { resetPdfState, getSlidesMeta } from '$lib/server/pdf-renderer';

let initialized = false;
function init() {
  if (initialized) return;
  if (runtimeConfig.slidesStatus.kind === 'resolved') {
    resetPdfState({
      slidesPath: runtimeConfig.slidesStatus.path,
      cacheRoot: runtimeConfig.cacheRoot,
    });
  }
  initialized = true;
}

export const GET: RequestHandler = async () => {
  init();
  if (runtimeConfig.slidesStatus.kind !== 'resolved') {
    return json(runtimeConfig.slidesStatus, { status: 422 });
  }
  const meta = await getSlidesMeta();
  return json({ status: 'resolved', ...meta });
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/routes/api/slides/meta
git commit -m "feat(api): slides metadata endpoint"
```

---

### Task 13: SvelteKit endpoint `/api/slide/[hash]/[n]`

**Files:**

- Create: `packages/client/src/routes/api/slide/[hash]/[n]/+server.ts`

- [ ] **Step 1: Implement endpoint**

```ts
import type { RequestHandler } from './$types';
import {
  getSlideImage,
  SlidesUnavailableError,
  PageOutOfRangeError,
} from '$lib/server/pdf-renderer';

export const GET: RequestHandler = async ({ params, setHeaders }) => {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1) return new Response('invalid page', { status: 400 });

  try {
    const { data, hash } = await getSlideImage(n);
    if (params.hash !== hash) return new Response('hash mismatch', { status: 404 });
    setHeaders({
      'content-type': 'image/webp',
      'cache-control': 'public, max-age=31536000, immutable',
      etag: `"${hash}-${n}"`,
    });
    return new Response(new Uint8Array(data));
  } catch (err) {
    if (err instanceof SlidesUnavailableError) {
      return new Response(JSON.stringify(err.toJSON()), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (err instanceof PageOutOfRangeError) return new Response('out of range', { status: 404 });
    throw err;
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/routes/api/slide
git commit -m "feat(api): slide image endpoint with HTTP cache"
```

---

### Task 14: Hook PDF invalidation into Vite plugin file watchers

**Files:**

- Modify: `packages/note-first-presenter/src/plugin/index.ts`

- [ ] **Step 1: On change, also invalidate PDF state**

`onChange` 内で virtual module 経由でクライアント側に新しい slidesStatus が届くため、`+server.ts` の `init` フラグをリセットさせる必要がある。簡易解として、`init()` ガードを `runtimeConfig` の参照ごとに再評価できる形に直す:

```ts
// packages/client/src/lib/server/pdf-renderer.ts に追加
// state.slidesPath が変わったら自動で reset するヘルパー
export function ensurePdfState(args: { slidesPath: string; cacheRoot: string }) {
  if (!state || state.slidesPath !== args.slidesPath) {
    resetPdfState(args);
  }
}
```

`+server.ts` 側の `init()` を:

```ts
function init() {
  if (runtimeConfig.slidesStatus.kind === 'resolved') {
    ensurePdfState({
      slidesPath: runtimeConfig.slidesStatus.path,
      cacheRoot: runtimeConfig.cacheRoot,
    });
  }
}
```

(`initialized` フラグは削除、毎回呼んでもパスが同じならノーオペ)

- [ ] **Step 2: Commit**

```bash
git add packages
git commit -m "feat(server): re-init PDF state when slides path changes"
```

---

## Phase 5: DB Server-side

### Task 15: DB I/O module

**Files:**

- Create: `packages/client/src/lib/db/schema.ts`
- Create: `packages/client/src/lib/server/db-io.ts`
- Create: `packages/client/src/lib/server/__tests__/db-io.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readDb, writeDb } from '../db-io';

async function makeTmp() {
  return fs.mkdtemp(path.join(tmpdir(), 'nfp-db-'));
}

describe('db-io', () => {
  it('returns default when file missing', async () => {
    const dir = await makeTmp();
    const dbPath = path.join(dir, '.note-first-presenter.json');
    const db = await readDb(dbPath);
    expect(db.version).toBe(1);
    expect(db.title).toBe('');
  });

  it('writes pretty-printed JSON with trailing newline', async () => {
    const dir = await makeTmp();
    const dbPath = path.join(dir, '.note-first-presenter.json');
    await writeDb(dbPath, { version: 1, title: 'hello', outline: { type: 'doc', content: [] } });
    const text = await fs.readFile(dbPath, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('  "title": "hello"');
  });
});
```

- [ ] **Step 2: Implement schema.ts**

```ts
export interface DbV1 {
  version: 1;
  title: string;
  outline: unknown;
}

export function defaultDb(): DbV1 {
  return { version: 1, title: '', outline: { type: 'doc', content: [] } };
}
```

- [ ] **Step 3: Implement db-io.ts**

```ts
import { promises as fs } from 'node:fs';
import { defaultDb, type DbV1 } from '../db/schema';

export async function readDb(dbPath: string): Promise<DbV1> {
  try {
    const text = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultDb();
    throw err;
  }
}

export async function writeDb(dbPath: string, db: DbV1): Promise<void> {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib
git commit -m "feat(db): read/write .note-first-presenter.json"
```

---

### Task 16: DB endpoint with valibot validation

**Files:**

- Create: `packages/client/src/routes/api/db/+server.ts`

- [ ] **Step 1: Implement**

```ts
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import runtimeConfig from 'virtual:nfp/runtime-config';
import { readDb, writeDb } from '$lib/server/db-io';

const dbSchema = v.object({
  version: v.literal(1),
  title: v.string(),
  outline: v.unknown(),
});

export const GET: RequestHandler = async () => {
  const db = await readDb(runtimeConfig.dbPath);
  return json(db);
};

export const PUT: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const parsed = v.parse(dbSchema, body);
  await writeDb(runtimeConfig.dbPath, parsed);
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/routes/api/db
git commit -m "feat(api): db endpoint with valibot validation"
```

---

## Phase 6: Paraglide i18n

### Task 17: Paraglide project setup

**Files:**

- Create: `packages/client/project.inlang/settings.json`
- Create: `packages/client/messages/en.json`
- Create: `packages/client/messages/ja.json`

- [ ] **Step 1: Create project.inlang/settings.json**

```json
{
  "$schema": "https://inlang.com/schema/project-settings",
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@2/dist/index.js"
  ],
  "plugin.inlang.messageFormat": {
    "pathPattern": "./messages/{locale}.json"
  },
  "baseLocale": "en",
  "locales": ["en", "ja"]
}
```

- [ ] **Step 2: Create messages/en.json**

```json
{
  "$schema": "https://inlang.com/schema/inlang-message-format",
  "title_placeholder": "Untitled",
  "theme_label": "Theme",
  "theme_system": "System",
  "theme_light": "Light",
  "theme_dark": "Dark",
  "save_error": "Failed to save",
  "next_slide_label": "Slide {n} →",
  "open_slideshow": "▶ Slideshow",
  "toggle_slide_list": "Toggle slide list",
  "error_slides_not_found": "Configured PDF not found: {path}",
  "error_multiple_pdfs": "Multiple PDFs found: {files}. Specify one in note-first-presenter.config.ts.",
  "info_no_slides": "Add a PDF to the project root or set slides in note-first-presenter.config.ts.",
  "overflow_label": "Slide {n} (overflow)"
}
```

- [ ] **Step 3: Create messages/ja.json**

```json
{
  "$schema": "https://inlang.com/schema/inlang-message-format",
  "title_placeholder": "無題",
  "theme_label": "テーマ",
  "theme_system": "システム",
  "theme_light": "ライト",
  "theme_dark": "ダーク",
  "save_error": "保存に失敗しました",
  "next_slide_label": "スライド {n} →",
  "open_slideshow": "▶ スライドショー",
  "toggle_slide_list": "スライド一覧を開閉",
  "error_slides_not_found": "設定された PDF が見つかりません: {path}",
  "error_multiple_pdfs": "PDF が複数見つかりました: {files}。note-first-presenter.config.ts で 1 つに指定してください。",
  "info_no_slides": "プロジェクト直下に PDF を追加するか、note-first-presenter.config.ts で slides を設定してください。",
  "overflow_label": "スライド {n} (超過)"
}
```

- [ ] **Step 4: Add paraglide plugin to vite.config.ts**

`packages/client/vite.config.ts`:

```ts
import { defineConfig } from 'vite-plus';
import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

export default defineConfig({
  plugins: [
    sveltekit(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['preferredLanguage', 'baseLocale'],
    }),
  ],
  fmt: {},
  lint: { options: { typeAware: true } },
});
```

- [ ] **Step 5: Trigger paraglide codegen (vite build/dev runs it)**

```bash
pnpm -F @note-first-presenter/client exec svelte-kit sync
```

(paraglide-js は Vite プラグインなので、`vite dev` 起動時にも生成される。手動で確認するならビルド系コマンドで一度走らせる)

- [ ] **Step 6: Commit**

```bash
git add packages/client/messages packages/client/project.inlang packages/client/vite.config.ts
git commit -m "feat(i18n): set up Paraglide v2 with en/ja"
```

---

### Task 18: hooks.server.ts and lang/dir in app.html

**Files:**

- Create: `packages/client/src/hooks.server.ts`
- Modify: `packages/client/src/app.html`

- [ ] **Step 1: Update app.html**

```html
<!doctype html>
<html lang="%paraglide.lang%" dir="%paraglide.dir%">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- [ ] **Step 2: Create hooks.server.ts**

```ts
import type { Handle } from '@sveltejs/kit';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';

export const handle: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request, locale }) => {
    event.request = request;
    return resolve(event, {
      transformPageChunk: ({ html }) =>
        html
          .replace('%paraglide.lang%', locale)
          .replace('%paraglide.dir%', getTextDirection(locale)),
    });
  });
```

- [ ] **Step 3: Verify dev server boots**

```bash
pnpm -F @note-first-presenter/client dev
```

Expected: `http://localhost:5173/` で「note-first-presenter」と表示、HTML の `<html lang="en" dir="ltr">` 確認。Accept-Language: ja で `<html lang="ja">` になる（curl で確認）:

```bash
curl -H "Accept-Language: ja" -s http://localhost:5173/ | head -1
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src
git commit -m "feat(i18n): SSR-correct lang/dir via paraglideMiddleware"
```

---

## Phase 7: SvelteKit App Shell

### Task 19: Theme store and CSS

**Files:**

- Create: `packages/client/src/lib/theme/theme-store.svelte.ts`
- Create: `packages/client/src/lib/theme/apply-theme.ts`
- Create: `packages/client/src/app.css`
- Modify: `packages/client/src/routes/+layout.svelte`

- [ ] **Step 1: Create theme-store.svelte.ts**

```ts
export type ThemeMode = 'system' | 'light' | 'dark';

export class ThemeStore {
  mode = $state<ThemeMode>('system');
  private mql: MediaQueryList | null = null;

  readonly resolved = $derived<'light' | 'dark'>(
    this.mode === 'light' || this.mode === 'dark'
      ? this.mode
      : this.mql?.matches
        ? 'dark'
        : 'light',
  );

  init() {
    this.mode = (localStorage.getItem('nfp:theme') as ThemeMode | null) ?? 'system';
    this.mql = window.matchMedia('(prefers-color-scheme: dark)');
    $effect(() => {
      localStorage.setItem('nfp:theme', this.mode);
    });
    $effect(() => {
      document.documentElement.dataset.theme = this.resolved;
    });
    const onChange = () => {
      // trigger reactivity on system theme change
      this.mode = this.mode;
    };
    this.mql.addEventListener('change', onChange);
  }
}
```

- [ ] **Step 2: Create app.css**

```css
:root[data-theme='light'] {
  --color-bg: #ffffff;
  --color-fg: #1a1a1a;
  --color-muted: #6a6a6a;
  --color-border: #e0e0e0;
  --color-accent: #2563eb;
}

:root[data-theme='dark'] {
  --color-bg: #0a0a0a;
  --color-fg: #f0f0f0;
  --color-muted: #9a9a9a;
  --color-border: #2a2a2a;
  --color-accent: #60a5fa;
}

html {
  color-scheme: light dark;
  background: var(--color-bg);
  color: var(--color-fg);
}

* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font-family: system-ui, sans-serif;
}
```

- [ ] **Step 3: Wire into +layout.svelte**

```svelte
<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { ThemeStore } from '$lib/theme/theme-store.svelte';

  const theme = new ThemeStore();
  onMount(() => theme.init());
</script>

<slot />
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src
git commit -m "feat(theme): system/light/dark theme store and CSS variables"
```

---

### Task 20: ofetch client wrapper

**Files:**

- Create: `packages/client/src/lib/server-client.ts`

- [ ] **Step 1: Implement**

```ts
import { ofetch } from 'ofetch';

export const api = ofetch.create({
  retry: 0,
  responseType: 'json',
  ignoreResponseError: false,
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/lib/server-client.ts
git commit -m "feat(client): unified ofetch instance"
```

---

### Task 21: DbStore with debounced save

**Files:**

- Create: `packages/client/src/lib/db/client.ts`
- Create: `packages/client/src/lib/db/__tests__/client.svelte.test.ts`

- [ ] **Step 1: Write component test (browser mode)**

```ts
import { describe, expect, it, vi } from 'vitest';
import { DbStore } from '../client';

describe('DbStore', () => {
  it('debounces saves at 500ms', async () => {
    vi.useFakeTimers();
    const calls: unknown[] = [];
    const store = new DbStore({
      initial: { version: 1, title: '', outline: {} },
      save: async (db) => {
        calls.push(db);
      },
    });
    store.setTitle('a');
    store.setTitle('ab');
    store.setTitle('abc');
    expect(calls.length).toBe(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls.length).toBe(1);
    expect((calls[0] as any).title).toBe('abc');
  });
});
```

- [ ] **Step 2: Implement client.ts**

```ts
import type { DbV1 } from './schema';

export interface DbStoreOptions {
  initial: DbV1;
  save: (db: DbV1) => Promise<void>;
}

export class DbStore {
  state = $state<DbV1>();
  saveStatus = $state<'idle' | 'saving' | 'error'>('idle');
  lastError = $state<string | null>(null);

  private save: (db: DbV1) => Promise<void>;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: DbStoreOptions) {
    this.state = opts.initial;
    this.save = opts.save;
  }

  setTitle(title: string) {
    this.state!.title = title;
    this.scheduleSave();
  }

  setOutline(outline: unknown) {
    this.state!.outline = outline;
    this.scheduleSave();
  }

  private scheduleSave() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 500);
  }

  async flush() {
    if (!this.state) return;
    this.saveStatus = 'saving';
    try {
      await this.save({ ...this.state });
      this.saveStatus = 'idle';
      this.lastError = null;
    } catch (err) {
      this.saveStatus = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }
}
```

- [ ] **Step 3: Run, expect pass**

```bash
pnpm -F @note-first-presenter/client test
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/lib/db
git commit -m "feat(db): DbStore with debounced auto-save"
```

---

## Phase 8: ProseMirror Outliner Foundation

### Task 22: Outliner schema

**Files:**

- Create: `packages/client/src/lib/outliner/schema.ts`
- Create: `packages/client/src/lib/outliner/__tests__/schema.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { outlinerSchema } from '../schema';

describe('outlinerSchema', () => {
  it('builds a doc with bullet_list > list_item > paragraph', () => {
    const doc = outlinerSchema.node('doc', null, [
      outlinerSchema.node('bullet_list', null, [
        outlinerSchema.node('list_item', null, [
          outlinerSchema.node('paragraph', null, [outlinerSchema.text('hello')]),
        ]),
      ]),
    ]);
    expect(doc.firstChild?.firstChild?.firstChild?.textContent).toBe('hello');
  });
  it('list_item has collapsed attr default false', () => {
    const li = outlinerSchema.node('list_item', null, [outlinerSchema.node('paragraph', null, [])]);
    expect(li.attrs.collapsed).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { Schema } from 'prosemirror-model';

export const outlinerSchema = new Schema({
  nodes: {
    doc: { content: 'bullet_list?' },
    bullet_list: {
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM: () => ['ul', 0],
    },
    list_item: {
      content: 'paragraph block*',
      attrs: { collapsed: { default: false } },
      parseDOM: [
        {
          tag: 'li',
          getAttrs(dom) {
            const el = dom as HTMLElement;
            return { collapsed: el.dataset.collapsed === 'true' };
          },
        },
      ],
      toDOM(node) {
        return ['li', { 'data-collapsed': String(node.attrs.collapsed) }, 0];
      },
    },
    paragraph: {
      content: 'text*',
      marks: '',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
  marks: {},
});
```

- [ ] **Step 3: Run, expect pass**

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/lib/outliner
git commit -m "feat(outliner): ProseMirror schema for outline"
```

---

### Task 23: Separator detection helper

**Files:**

- Create: `packages/client/src/lib/outliner/separator.ts`
- Create: `packages/client/src/lib/outliner/__tests__/separator.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { outlinerSchema } from '../schema';
import { isTopLevelSeparator } from '../separator';

function liWithText(text: string) {
  return outlinerSchema.node('list_item', null, [
    outlinerSchema.node('paragraph', null, [outlinerSchema.text(text)]),
  ]);
}

describe('isTopLevelSeparator', () => {
  it('true for "---"', () => {
    expect(isTopLevelSeparator(liWithText('---'))).toBe(true);
  });
  it('false for "---x"', () => {
    expect(isTopLevelSeparator(liWithText('---x'))).toBe(false);
  });
  it('false when first child is not paragraph', () => {
    const li = outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, [outlinerSchema.text('x')]),
    ]);
    expect(isTopLevelSeparator(li)).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { Node } from 'prosemirror-model';

export function isTopLevelSeparator(item: Node): boolean {
  if (item.type.name !== 'list_item') return false;
  const first = item.firstChild;
  if (!first || first.type.name !== 'paragraph') return false;
  return first.textContent === '---';
}
```

- [ ] **Step 3: Run, expect pass**

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/lib/outliner
git commit -m "feat(outliner): top-level separator detection"
```

---

### Task 24: Note groups + active slide calculation

**Files:**

- Create: `packages/client/src/lib/outliner/active-slide.ts`
- Create: `packages/client/src/lib/outliner/__tests__/active-slide.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { outlinerSchema } from '../schema';
import { computeActiveSlide, deriveNoteGroups } from '../active-slide';

function docOf(items: Array<{ text: string }>) {
  const list = items.map((it) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, it.text ? [outlinerSchema.text(it.text)] : []),
    ]),
  );
  return outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, list)]);
}

describe('deriveNoteGroups', () => {
  it('empty doc → 1 group', () => {
    const doc = outlinerSchema.node('doc', null);
    expect(deriveNoteGroups(doc)).toHaveLength(1);
  });
  it('items only → 1 group', () => {
    const doc = docOf([{ text: 'a' }, { text: 'b' }]);
    expect(deriveNoteGroups(doc)).toHaveLength(1);
  });
  it('--- → 2 groups', () => {
    const doc = docOf([{ text: 'a' }, { text: '---' }, { text: 'b' }]);
    expect(deriveNoteGroups(doc)).toHaveLength(2);
  });
});

describe('computeActiveSlide', () => {
  it('caret in first group → 1', () => {
    const doc = docOf([{ text: 'a' }, { text: '---' }, { text: 'b' }]);
    const sel = TextSelection.create(doc, 2);
    expect(computeActiveSlide(doc, sel)).toBe(1);
  });
  it('caret on separator → next slide (2)', () => {
    const doc = docOf([{ text: 'a' }, { text: '---' }, { text: 'b' }]);
    // 直前 li の終端を超えた位置 = separator のテキスト中
    const sepPos = 1 + 1 + 'a'.length + 1 + 1 + 2; // 大まかに separator 内
    const sel = TextSelection.create(doc, sepPos);
    expect(computeActiveSlide(doc, sel)).toBe(2);
  });
  it('caret in second group → 2', () => {
    const doc = docOf([{ text: 'a' }, { text: '---' }, { text: 'b' }]);
    const sel = TextSelection.create(doc, doc.content.size - 2);
    expect(computeActiveSlide(doc, sel)).toBe(2);
  });
});
```

- [ ] **Step 2: Implement active-slide.ts**

```ts
import type { Node } from 'prosemirror-model';
import type { Selection } from 'prosemirror-state';
import { isTopLevelSeparator } from './separator';

export interface NoteGroup {
  slideIndex: number;
  itemPositions: number[];
  rangeStart: number;
  rangeEnd: number;
  precedingSeparatorPos: number | null;
}

export function deriveNoteGroups(doc: Node): NoteGroup[] {
  const list = doc.firstChild;
  if (!list || list.type.name !== 'bullet_list') {
    return [
      {
        slideIndex: 1,
        itemPositions: [],
        rangeStart: 0,
        rangeEnd: doc.content.size,
        precedingSeparatorPos: null,
      },
    ];
  }
  const groups: NoteGroup[] = [];
  let current: NoteGroup = {
    slideIndex: 1,
    itemPositions: [],
    rangeStart: 1, // inside doc → bullet_list opens at 0, first item starts at 1
    rangeEnd: 1,
    precedingSeparatorPos: null,
  };
  let offset = 1;
  list.forEach((item) => {
    const itemStart = offset;
    const itemEnd = offset + item.nodeSize;
    if (isTopLevelSeparator(item)) {
      current.rangeEnd = itemStart;
      groups.push(current);
      current = {
        slideIndex: current.slideIndex + 1,
        itemPositions: [],
        rangeStart: itemStart, // include separator in next group's range so caret-on-separator hits next
        rangeEnd: itemEnd,
        precedingSeparatorPos: itemStart,
      };
    } else {
      current.itemPositions.push(itemStart);
      current.rangeEnd = itemEnd;
    }
    offset = itemEnd;
  });
  groups.push(current);
  return groups;
}

export function computeActiveSlide(doc: Node, selection: Selection): number {
  const groups = deriveNoteGroups(doc);
  const caret = selection.from;
  for (const g of groups) {
    if (caret >= g.rangeStart && caret <= g.rangeEnd) return g.slideIndex;
  }
  return groups.at(-1)?.slideIndex ?? 1;
}
```

- [ ] **Step 3: Run, expect pass**

(テストの caret 計算は ProseMirror の position に合わせて微調整が必要。テスト失敗時は実 doc を console.log してオフセットを確認)

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/lib/outliner
git commit -m "feat(outliner): derive note groups and active slide from caret"
```

---

### Task 25: Outliner Svelte component shell

**Files:**

- Create: `packages/client/src/lib/outliner/Outliner.svelte`
- Create: `packages/client/src/lib/outliner/__tests__/Outliner.svelte.test.ts`

- [ ] **Step 1: Write component browser test**

```ts
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Outliner from '../Outliner.svelte';

describe('Outliner', () => {
  it('renders editor with initial content', async () => {
    render(Outliner, {
      doc: {
        type: 'doc',
        content: [
          {
            type: 'bullet_list',
            content: [
              {
                type: 'list_item',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
              },
            ],
          },
        ],
      },
      onChange: () => {},
      onActiveSlideChange: () => {},
    });
    await expect.element(page.getByRole('textbox')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement Outliner.svelte (minimal)**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorState } from 'prosemirror-state';
  import { EditorView } from 'prosemirror-view';
  import { history } from 'prosemirror-history';
  import { outlinerSchema } from './schema';
  import { computeActiveSlide } from './active-slide';

  let { doc, onChange, onActiveSlideChange } = $props<{
    doc: unknown;
    onChange: (doc: unknown) => void;
    onActiveSlideChange: (n: number) => void;
  }>();

  let mountEl: HTMLDivElement;
  let view: EditorView | null = null;

  onMount(() => {
    const state = EditorState.create({
      schema: outlinerSchema,
      doc: outlinerSchema.nodeFromJSON(doc as any),
      plugins: [history()],
    });
    view = new EditorView(mountEl, {
      state,
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Outliner' },
      dispatchTransaction(tr) {
        const next = view!.state.apply(tr);
        view!.updateState(next);
        if (tr.docChanged) onChange(next.doc.toJSON());
        if (tr.docChanged || tr.selectionSet) {
          onActiveSlideChange(computeActiveSlide(next.doc, next.selection));
        }
      },
    });
    return () => {
      view?.destroy();
      view = null;
    };
  });
</script>

<div bind:this={mountEl} class="outliner-root"></div>

<style>
  .outliner-root :global(ul) { padding-left: 1.5em; margin: 0; }
  .outliner-root :global(p) { margin: 0; }
</style>
```

- [ ] **Step 3: Run, expect pass**

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/lib/outliner
git commit -m "feat(outliner): minimal Svelte wrapper around ProseMirror"
```

---

## Phase 9: Outliner Commands

### Task 26: Indent / outdent commands

**Files:**

- Create: `packages/client/src/lib/outliner/commands/indent.ts`
- Create: `packages/client/src/lib/outliner/__tests__/indent.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { outlinerSchema } from '../schema';
import { indentItem, outdentItem } from '../commands/indent';

function makeState(text: string[]) {
  const list = outlinerSchema.node(
    'bullet_list',
    null,
    text.map((t) =>
      outlinerSchema.node('list_item', null, [
        outlinerSchema.node('paragraph', null, t ? [outlinerSchema.text(t)] : []),
      ]),
    ),
  );
  const doc = outlinerSchema.node('doc', null, [list]);
  return EditorState.create({ doc });
}

describe('indentItem', () => {
  it('makes second item child of first', () => {
    let state = makeState(['a', 'b']);
    // caret in second item
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 2)),
    );
    let result: any = null;
    indentItem(state, (tr) => {
      result = state.apply(tr);
    });
    expect(result?.doc.firstChild.childCount).toBe(1);
    expect(result?.doc.firstChild.firstChild.childCount).toBe(2); // paragraph + nested ul
  });
});
```

- [ ] **Step 2: Implement indent.ts**

```ts
import type { Command } from 'prosemirror-state';
import { findParentNodeOfType, ReplaceAroundStep } from 'prosemirror-transform';
import { outlinerSchema } from '../schema';
import { Slice, Fragment } from 'prosemirror-model';

export const indentItem: Command = (state, dispatch) => {
  const { $from } = state.selection;
  // find current list_item at top of nesting hierarchy
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type !== outlinerSchema.nodes.list_item) depth--;
  if (depth === 0) return false;
  const itemPos = $from.before(depth);
  const item = $from.node(depth);
  const parentList = $from.node(depth - 1);
  if (!parentList || parentList.type !== outlinerSchema.nodes.bullet_list) return false;
  const indexInList = $from.index(depth - 1);
  if (indexInList === 0) return false; // no preceding sibling to indent into
  const prevSiblingPos = itemPos - parentList.child(indexInList - 1).nodeSize;
  const prevSibling = parentList.child(indexInList - 1);

  // append current item as last block of prevSibling
  const tr = state.tr;
  // remove current item
  tr.delete(itemPos, itemPos + item.nodeSize);
  // build new prevSibling content: existing children + (new bullet_list with item)
  let newChildren: any[] = [];
  prevSibling.content.forEach((child) => newChildren.push(child));
  // if last child is already bullet_list, append into it
  const lastIsList = prevSibling.lastChild?.type === outlinerSchema.nodes.bullet_list;
  if (lastIsList) {
    const lastList = newChildren.pop();
    newChildren.push(lastList.copy(lastList.content.append(Fragment.from(item))));
  } else {
    newChildren.push(outlinerSchema.nodes.bullet_list.create(null, Fragment.from(item)));
  }
  const newPrev = prevSibling.copy(Fragment.fromArray(newChildren));
  tr.replaceWith(prevSiblingPos, prevSiblingPos + prevSibling.nodeSize, newPrev);

  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};

// Outdent: inverse — promote current item to be a sibling of its parent list_item
export const outdentItem: Command = (state, dispatch) => {
  // 実装は indentItem の逆操作。簡略化のため Phase 9 で TDD 駆動で詰める。
  // この時点では skeleton として false を返し、テストで挙動を固める。
  return false;
};
```

(完全な outdent 実装はテストを書きながら詰める。indent の正確な実装はテスト通過時に調整。実装の詳細は本タスクで TDD ループを回して完成させる。)

- [ ] **Step 3: Iterate test/impl until indent passes for single-item indent, and write tests + implementation for outdent**

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/lib/outliner
git commit -m "feat(outliner): indent/outdent commands"
```

---

### Task 27: Enter / Backspace / Delete handlers

**Files:**

- Create: `packages/client/src/lib/outliner/commands/enter.ts`
- Create: `packages/client/src/lib/outliner/commands/backspace.ts`
- Create: `packages/client/src/lib/outliner/commands/delete.ts`
- Create テスト群

- [ ] **Step 1: TDD `insertSiblingItem` (Enter)**

仕様: 現在の list_item をカーソル位置で split し、後半を新しい兄弟 list_item にする。末尾なら空の兄弟。

```ts
export const insertSiblingItem: Command = (state, dispatch) => {
  const { $from } = state.selection;
  // find list_item
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type !== outlinerSchema.nodes.list_item) depth--;
  if (depth === 0) return false;
  const item = $from.node(depth);
  const itemEnd = $from.after(depth);
  const caretInItem = $from.pos;

  if (dispatch) {
    const tr = state.tr;
    // split list_item at caret
    tr.split($from.pos, depth - $from.depth + 1 /* ? */);
    dispatch(tr.scrollIntoView());
  }
  return true;
};
```

(実装は split helper を使って TDD で詰める。詳細な position 計算は Test red→green を回しながら確定)

- [ ] **Step 2: TDD `smartBackspace`**

仕様:

- 空の list_item で Backspace → そのアイテムを削除（カーソルは直前 list_item の末尾へ）
- 内容ありの先頭で Backspace → 直前 list_item と結合
- それ以外 → 通常の文字削除（false を返し標準処理に委譲）

```ts
export const smartBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty) return false;
  // find list_item depth
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type !== outlinerSchema.nodes.list_item) depth--;
  if (depth === 0) return false;
  const item = $from.node(depth);

  // caret at start of paragraph (offset 1 inside list_item)?
  const isAtItemStart = $from.parentOffset === 0 && $from.depth === depth + 1;
  if (!isAtItemStart) return false;

  const isEmpty = item.firstChild?.content.size === 0 && item.childCount === 1;
  if (isEmpty) {
    // delete the item
    const tr = state.tr.delete($from.before(depth), $from.after(depth));
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  }
  // merge with previous item: join
  const before = $from.before(depth);
  if (before <= 1) return false;
  const tr = state.tr.join(before);
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};
```

- [ ] **Step 3: TDD `smartDelete` (mirror of backspace at end)**

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/lib/outliner
git commit -m "feat(outliner): smart Enter/Backspace/Delete"
```

---

### Task 28: Move bullet up/down

**Files:**

- Create: `packages/client/src/lib/outliner/commands/move.ts`
- Create tests

- [ ] **Step 1: Tests**

list_item を sibling とスワップする command。同階層内の前/次の兄弟と入れ替え、なければ false。

- [ ] **Step 2: Implement**

```ts
export const moveItemUp: Command = (state, dispatch) => {
  const { $from } = state.selection;
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type !== outlinerSchema.nodes.list_item) depth--;
  if (depth === 0) return false;
  const indexInList = $from.index(depth - 1);
  if (indexInList === 0) return false;
  const parentList = $from.node(depth - 1);
  const item = $from.node(depth);
  const prev = parentList.child(indexInList - 1);
  const itemStart = $from.before(depth);
  const prevStart = itemStart - prev.nodeSize;
  const tr = state.tr.replaceWith(prevStart, itemStart + item.nodeSize, [item, prev]);
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};

export const moveItemDown: Command = (state, dispatch) => {
  /* mirror */
};
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/lib/outliner
git commit -m "feat(outliner): move bullet up/down"
```

---

### Task 29: Collapse / Expand / Duplicate

**Files:**

- Create: `packages/client/src/lib/outliner/commands/fold.ts`
- Create: `packages/client/src/lib/outliner/commands/duplicate.ts`

- [ ] **Step 1: Implement collapseItem / expandItem (toggle list_item.attrs.collapsed)**

```ts
import type { Command } from 'prosemirror-state';
import { outlinerSchema } from '../schema';

function setCollapsed(value: boolean): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    let depth = $from.depth;
    while (depth > 0 && $from.node(depth).type !== outlinerSchema.nodes.list_item) depth--;
    if (depth === 0) return false;
    const pos = $from.before(depth);
    const node = $from.node(depth);
    // no-op if no children list
    const hasChildList = node.lastChild?.type === outlinerSchema.nodes.bullet_list;
    if (!hasChildList) return false;
    const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: value });
    if (dispatch) dispatch(tr);
    return true;
  };
}

export const collapseItem = setCollapsed(true);
export const expandItem = setCollapsed(false);
```

- [ ] **Step 2: Implement duplicateItem (clone list_item just after current)**

```ts
export const duplicateItem: Command = (state, dispatch) => {
  const { $from } = state.selection;
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type !== outlinerSchema.nodes.list_item) depth--;
  if (depth === 0) return false;
  const node = $from.node(depth);
  const after = $from.after(depth);
  const tr = state.tr.insert(after, node.copy(node.content));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/lib/outliner
git commit -m "feat(outliner): collapse/expand and duplicate"
```

---

### Task 30: Keymap with bowser platform branch

**Files:**

- Create: `packages/client/src/lib/outliner/plugins/keymap.ts`
- Modify: `packages/client/src/lib/outliner/Outliner.svelte` to use it

- [ ] **Step 1: Implement keymap**

```ts
import { keymap } from 'prosemirror-keymap';
import { undo, redo } from 'prosemirror-history';
import Bowser from 'bowser';
import { indentItem, outdentItem } from '../commands/indent';
import { insertSiblingItem } from '../commands/enter';
import { smartBackspace, smartDelete } from '../commands/backspace';
import { moveItemUp, moveItemDown } from '../commands/move';
import { collapseItem, expandItem } from '../commands/fold';
import { duplicateItem } from '../commands/duplicate';

export function outlinerKeymap() {
  const isMac = Bowser.getParser(navigator.userAgent).getOSName() === 'macOS';
  return keymap({
    Enter: insertSiblingItem,
    Tab: indentItem,
    'Shift-Tab': outdentItem,
    Backspace: smartBackspace,
    Delete: smartDelete,
    'Mod-z': undo,
    'Mod-Shift-z': redo,
    'Mod-ArrowUp': collapseItem,
    'Mod-ArrowDown': expandItem,
    'Mod-Shift-d': duplicateItem,
    ...(isMac
      ? {
          'Mod-Shift-ArrowUp': moveItemUp,
          'Mod-Shift-ArrowDown': moveItemDown,
        }
      : {
          'Alt-Shift-ArrowUp': moveItemUp,
          'Alt-Shift-ArrowDown': moveItemDown,
          'Ctrl-y': redo,
        }),
  });
}
```

- [ ] **Step 2: Wire into Outliner.svelte plugins array**

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/lib/outliner
git commit -m "feat(outliner): assemble keymap with platform branch"
```

---

### Task 31: Separator decorations plugin

**Files:**

- Create: `packages/client/src/lib/outliner/plugins/separator-decorations.ts`

- [ ] **Step 1: Implement**

```ts
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { isTopLevelSeparator } from '../separator';
import { m } from '$lib/paraglide/messages';

function compute(doc: Node): DecorationSet {
  const list = doc.firstChild;
  if (!list || list.type.name !== 'bullet_list') return DecorationSet.empty;
  const decos: Decoration[] = [];
  let slide = 1;
  let offset = 1;
  list.forEach((item) => {
    if (isTopLevelSeparator(item)) {
      const next = slide + 1;
      decos.push(
        Decoration.node(offset, offset + item.nodeSize, {
          'data-separator': 'true',
          'data-next-slide-label': m.next_slide_label({ n: next }),
        }),
      );
      slide = next;
    }
    offset += item.nodeSize;
  });
  return DecorationSet.create(doc, decos);
}

export const separatorDecorations = new Plugin({
  state: {
    init: (_, s) => compute(s.doc),
    apply: (tr, old) => (tr.docChanged ? compute(tr.doc) : old),
  },
  props: {
    decorations(state) {
      return this.getState(state);
    },
  },
});
```

- [ ] **Step 2: Wire into Outliner.svelte and add CSS in outliner styles**

```css
.outliner-root :global(> ul > li[data-separator='true']) {
  margin-block: 1.5em;
  color: var(--color-muted);
  position: relative;
  transition:
    margin-block 200ms ease,
    color 200ms ease;
}
.outliner-root :global(> ul > li[data-separator='true']::before) {
  content: '';
  position: absolute;
  inset: 50% 0 auto 1em;
  border-top: 1px dashed var(--color-border);
  z-index: -1;
}
.outliner-root :global(> ul > li[data-separator='true']::after) {
  content: attr(data-next-slide-label);
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  padding-inline: 0.5em;
  background: var(--color-bg);
  font-size: 0.85em;
  color: var(--color-muted);
}
@starting-style {
  .outliner-root :global(> ul > li[data-separator='true']::before),
  .outliner-root :global(> ul > li[data-separator='true']::after) {
    opacity: 0;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/lib/outliner
git commit -m "feat(outliner): separator decorations with next-slide label"
```

---

### Task 32: Collapse animation CSS (interpolate-size + @starting-style)

**Files:**

- Modify: `packages/client/src/app.css` or outliner styles

- [ ] **Step 1: Add collapse animation CSS**

```css
:root {
  interpolate-size: allow-keywords;
}
.outliner-root :global(li > ul) {
  overflow: hidden;
  transition:
    height 200ms ease,
    opacity 200ms ease,
    display 200ms allow-discrete;
}
.outliner-root :global(li[data-collapsed='true'] > ul) {
  display: none;
  height: 0;
  opacity: 0;
}
@starting-style {
  .outliner-root :global(li:not([data-collapsed='true']) > ul) {
    height: 0;
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .outliner-root :global(li > ul) {
    transition: none;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src
git commit -m "feat(outliner): smooth collapse/expand animation"
```

---

### Task 33: Paste handler

**Files:**

- Create: `packages/client/src/lib/outliner/plugins/paste.ts`

- [ ] **Step 1: Implement (HTML list 検出 + plain text インデント検出)**

```ts
import { Plugin, PluginKey } from 'prosemirror-state';
import { Slice, Fragment } from 'prosemirror-model';
import { outlinerSchema } from '../schema';

const INTERNAL_MIME = 'application/x-nfp-outline';

function parseHtmlList(html: string): Slice | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('ul, ol');
  if (!root) return null;
  const list = walkList(root);
  return new Slice(Fragment.from(list), 0, 0);
}

function walkList(el: Element): any {
  const items: any[] = [];
  el.querySelectorAll(':scope > li').forEach((li) => {
    const text = Array.from(li.childNodes)
      .filter(
        (n) =>
          n.nodeType === Node.TEXT_NODE ||
          ((n as Element).tagName !== 'UL' && (n as Element).tagName !== 'OL'),
      )
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();
    const children: any[] = [
      outlinerSchema.node('paragraph', null, text ? [outlinerSchema.text(text)] : []),
    ];
    const nested = li.querySelector(':scope > ul, :scope > ol');
    if (nested) children.push(walkList(nested));
    items.push(outlinerSchema.node('list_item', null, children));
  });
  return outlinerSchema.node('bullet_list', null, items);
}

function parsePlainText(text: string): Slice | null {
  const lines = text.split('\n').filter((l) => l.length > 0 || text.includes('\n'));
  if (lines.length <= 1) return null;
  const stripped = lines.map((l) => {
    const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l) ?? /^(\s*)(.*)$/.exec(l)!;
    const indent = m[1] ?? '';
    const content = m[m.length - 1] ?? '';
    return { indent: indent.length, content };
  });
  const nonZero = stripped.map((s) => s.indent).filter((i) => i > 0);
  const unit = nonZero.length ? Math.min(...nonZero) : 1;
  // build tree by stack
  const root: any[] = [];
  const stack: { level: number; items: any[] }[] = [{ level: -1, items: root }];
  for (const { indent, content } of stripped) {
    const level = Math.round(indent / unit);
    while (stack.length > 1 && stack.at(-1)!.level >= level) stack.pop();
    const parent = stack.at(-1)!;
    const itemChildren: any[] = [
      outlinerSchema.node('paragraph', null, content ? [outlinerSchema.text(content)] : []),
    ];
    parent.items.push({ level, item: itemChildren });
    stack.push({ level, items: itemChildren });
  }
  // recursively turn structure into ProseMirror nodes — simplified flat for first pass
  const flat = stripped.map(({ content }) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, content ? [outlinerSchema.text(content)] : []),
    ]),
  );
  return new Slice(Fragment.from(outlinerSchema.node('bullet_list', null, flat)), 0, 0);
}

export const pasteHandler = new Plugin({
  key: new PluginKey('nfp-paste'),
  props: {
    handlePaste(view, event) {
      const dt = event.clipboardData;
      if (!dt) return false;
      const internal = dt.getData(INTERNAL_MIME);
      if (internal) {
        try {
          const slice = Slice.fromJSON(outlinerSchema, JSON.parse(internal));
          view.dispatch(view.state.tr.replaceSelection(slice));
          return true;
        } catch {
          /* fallthrough */
        }
      }
      const html = dt.getData('text/html');
      if (html) {
        const slice = parseHtmlList(html);
        if (slice) {
          view.dispatch(view.state.tr.replaceSelection(slice));
          return true;
        }
      }
      const text = dt.getData('text/plain');
      if (text && text.includes('\n')) {
        const slice = parsePlainText(text);
        if (slice) {
          view.dispatch(view.state.tr.replaceSelection(slice));
          return true;
        }
      }
      return false;
    },
  },
});
```

(完全な階層復元は時間がかかるため、まずはフラット化バージョンで commit し、後続イテレーションで木構造復元を改善する)

- [ ] **Step 2: Tests for parsePlainText / parseHtmlList**

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/lib/outliner
git commit -m "feat(outliner): paste handler for HTML lists and indented text"
```

---

### Task 34: Copy / cut with internal JSON

**Files:**

- Create: `packages/client/src/lib/outliner/plugins/clipboard.ts`

- [ ] **Step 1: Implement transformCopied / clipboardSerializer for internal JSON**

```ts
import { Plugin, PluginKey } from 'prosemirror-state';

const INTERNAL_MIME = 'application/x-nfp-outline';

export const clipboardPlugin = new Plugin({
  key: new PluginKey('nfp-clipboard'),
  props: {
    handleDOMEvents: {
      copy(view, event) {
        const { state } = view;
        const slice = state.selection.content();
        if (slice.size === 0) return false;
        const json = JSON.stringify(slice.toJSON());
        event.clipboardData?.setData(INTERNAL_MIME, json);
        // also write plain text indented representation
        const text = sliceToText(slice);
        event.clipboardData?.setData('text/plain', text);
        event.preventDefault();
        return true;
      },
    },
  },
});

function sliceToText(slice: any): string {
  // walk slice.content and produce indented bullet text
  const lines: string[] = [];
  function walk(node: any, depth: number) {
    node.forEach((child: any) => {
      if (child.type.name === 'list_item') {
        const text = child.firstChild?.textContent ?? '';
        lines.push('  '.repeat(depth) + '- ' + text);
        child.forEach((sub: any) => {
          if (sub.type.name === 'bullet_list') walk(sub, depth + 1);
        });
      } else if (child.type.name === 'bullet_list') {
        walk(child, depth);
      }
    });
  }
  walk(slice.content, 0);
  return lines.join('\n');
}
```

- [ ] **Step 2: Wire into Outliner.svelte plugins**

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/lib/outliner
git commit -m "feat(outliner): copy/cut with internal JSON and indented text"
```

---

### Task 35: Node selection (NodeRangeSelection)

**Files:**

- Create: `packages/client/src/lib/outliner/node-range-selection.ts`
- Create tests

- [ ] **Step 1: TDD NodeRangeSelection (連続兄弟 list_item 範囲)**

ProseMirror の `Selection` を継承し、anchor/head が同じ depth の sibling list_items を覆う範囲を表現。`map`, `eq`, `toJSON` 等の最低限のメソッドを実装。

- [ ] **Step 2: Implement bullet handle clicks for entering node selection**

```ts
// in Outliner.svelte plugins: handleClickOn for bullet handle
```

- [ ] **Step 3: Implement Shift+ArrowUp/Down extension**

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/lib/outliner
git commit -m "feat(outliner): node range selection with shift extension"
```

---

## Phase 10: Slide List & Image

### Task 36: SlideImage component

**Files:**

- Create: `packages/client/src/lib/slide-image/SlideImage.svelte`

- [ ] **Step 1: Implement**

```svelte
<script lang="ts">
  let { hash, slide, alt = '' } = $props<{ hash: string; slide: number; alt?: string }>();
</script>

<img src={`/api/slide/${hash}/${slide}`} alt={alt} loading="lazy" />

<style>
  img { width: 100%; height: 100%; object-fit: contain; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/lib/slide-image
git commit -m "feat(client): SlideImage component"
```

---

### Task 37: SlideList component (WAI-ARIA listbox)

**Files:**

- Create: `packages/client/src/lib/slide-list/SlideList.svelte`
- Create: `packages/client/src/lib/slide-list/__tests__/SlideList.svelte.test.ts`

- [ ] **Step 1: Browser test for keyboard nav**

```ts
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import SlideList from '../SlideList.svelte';

describe('SlideList', () => {
  it('Up/Down moves active item', async () => {
    let active = 2;
    render(SlideList, {
      hash: 'h',
      pageCount: 5,
      overflowStart: 6,
      activeSlide: active,
      onSelect: (n: number) => {
        active = n;
      },
    });
    const lb = page.getByRole('listbox');
    await lb.click();
    await page.keyboard.press('ArrowDown');
    expect(active).toBe(3);
  });
});
```

- [ ] **Step 2: Implement**

```svelte
<script lang="ts">
  import SlideImage from '$lib/slide-image/SlideImage.svelte';
  import { m } from '$lib/paraglide/messages';

  let { hash, pageCount, overflowStart, activeSlide, onSelect } = $props<{
    hash: string;
    pageCount: number;
    overflowStart: number;
    activeSlide: number;
    onSelect: (n: number) => void;
  }>();

  function keydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      onSelect(Math.min(activeSlide + 1, pageCount));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      onSelect(Math.max(activeSlide - 1, 1));
      e.preventDefault();
    } else if (e.key === 'Home') {
      onSelect(1);
      e.preventDefault();
    } else if (e.key === 'End') {
      onSelect(pageCount);
      e.preventDefault();
    } else if (e.key === 'PageDown') {
      onSelect(Math.min(activeSlide + 5, pageCount));
      e.preventDefault();
    } else if (e.key === 'PageUp') {
      onSelect(Math.max(activeSlide - 5, 1));
      e.preventDefault();
    }
  }
</script>

<ul role="listbox" aria-label="Slides" onkeydown={keydown}>
  {#each Array.from({ length: pageCount }, (_, i) => i + 1) as n (n)}
    <li
      role="option"
      aria-selected={n === activeSlide}
      tabindex={n === activeSlide ? 0 : -1}
      onclick={() => onSelect(n)}
    >
      {#if n < overflowStart}
        <SlideImage hash={hash} slide={n} alt={`Slide ${n}`} />
      {:else}
        <div class="placeholder">{m.overflow_label({ n })}</div>
      {/if}
      <span class="label">Slide {n}</span>
    </li>
  {/each}
</ul>

<style>
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 4px; cursor: pointer; }
  li[aria-selected='true'] { outline: 2px solid var(--color-accent); }
  .placeholder { aspect-ratio: 16/9; display: grid; place-items: center; border: 1px dashed var(--color-border); }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/lib/slide-list
git commit -m "feat(client): SlideList listbox with keyboard navigation"
```

---

### Task 38: ActiveSlideStore + SlidesMetaStore

**Files:**

- Create: `packages/client/src/lib/active-slide/active-slide-store.svelte.ts`
- Create: `packages/client/src/lib/slides-meta/slides-meta-store.svelte.ts`

- [ ] **Step 1: SlidesMetaStore**

```ts
import { api } from '$lib/server-client';

export type SlidesMeta =
  | { status: 'resolved'; hash: string; pageCount: number }
  | { status: 'configured-but-missing'; configuredPath: string }
  | { status: 'no-config-no-file' }
  | { status: 'no-config-multiple-files'; candidates: string[] };

export class SlidesMetaStore {
  data = $state<SlidesMeta | null>(null);
  error = $state<string | null>(null);

  async load() {
    try {
      this.data = await api<SlidesMeta>('/api/slides/meta');
    } catch (err: any) {
      if (err.data) this.data = err.data as SlidesMeta;
      else this.error = err.message;
    }
  }
}
```

- [ ] **Step 2: ActiveSlideStore**

```ts
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { get } from 'svelte/store';

export class ActiveSlideStore {
  value = $state(1);

  init() {
    const url = get(page).url;
    const param = url.searchParams.get('slide');
    if (param) this.value = Math.max(1, Number(param) || 1);
    $effect(() => {
      const u = new URL(window.location.href);
      u.searchParams.set('slide', String(this.value));
      window.history.replaceState({}, '', u);
    });
  }

  setFromEditor(n: number) {
    this.value = n;
  }
  setFromList(n: number) {
    this.value = n;
  }
  set(n: number) {
    this.value = n;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/lib
git commit -m "feat(client): SlidesMetaStore and ActiveSlideStore"
```

---

## Phase 11: Presenter View Integration

### Task 39: Presenter `+page.svelte`

**Files:**

- Create: `packages/client/src/routes/+page.svelte`
- Modify: `packages/client/src/routes/+layout.svelte` (keep slot)

- [ ] **Step 1: Build presenter page**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { api } from '$lib/server-client';
  import { DbStore } from '$lib/db/client';
  import { SlidesMetaStore } from '$lib/slides-meta/slides-meta-store.svelte';
  import { ActiveSlideStore } from '$lib/active-slide/active-slide-store.svelte';
  import { ThemeStore } from '$lib/theme/theme-store.svelte';
  import Outliner from '$lib/outliner/Outliner.svelte';
  import SlideList from '$lib/slide-list/SlideList.svelte';
  import { SyncPublisher } from '$lib/sync/sync-publisher';
  import { deriveNoteGroups } from '$lib/outliner/active-slide';

  const db = new DbStore({
    initial: { version: 1, title: '', outline: { type: 'doc', content: [] } },
    save: (state) => api('/api/db', { method: 'PUT', body: state }),
  });
  const meta = new SlidesMetaStore();
  const active = new ActiveSlideStore();
  const theme = new ThemeStore();
  const publisher = new SyncPublisher();

  let listOpen = $state(true);

  onMount(async () => {
    theme.init();
    active.init();
    const initial = await api('/api/db');
    db.state = initial;
    await meta.load();
    listOpen = (localStorage.getItem('nfp:listOpen') ?? 'true') === 'true';
  });

  $effect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('nfp:listOpen', String(listOpen));
    }
  });

  $effect(() => {
    publisher.publishActiveSlide(active.value);
  });

  const groups = $derived(deriveNoteGroups(/* outline doc */ db.state?.outline ?? { type: 'doc', content: [] } as any));
  const pdfCount = $derived(meta.data?.status === 'resolved' ? meta.data.pageCount : 0);
  const effectivePageCount = $derived(Math.max(pdfCount, groups.length));
</script>

<header>
  <input
    type="text"
    placeholder={m.title_placeholder()}
    bind:value={db.state.title}
    oninput={() => db.setTitle(db.state.title)}
  />
  {#if db.saveStatus === 'error'}
    <span role="alert" aria-live="polite">{m.save_error()}</span>
  {/if}
  <a href={`/slideshow?slide=${active.value}`} target="nfp-slideshow" rel="noopener">
    {m.open_slideshow()}
  </a>
  <fieldset role="radiogroup" aria-label={m.theme_label()}>
    <label><input type="radio" bind:group={theme.mode} value="system" /> {m.theme_system()}</label>
    <label><input type="radio" bind:group={theme.mode} value="light" /> {m.theme_light()}</label>
    <label><input type="radio" bind:group={theme.mode} value="dark" /> {m.theme_dark()}</label>
  </fieldset>
  <button onclick={() => (listOpen = !listOpen)} aria-expanded={listOpen} aria-label={m.toggle_slide_list()}>☰</button>
</header>

<main class:list-open={listOpen}>
  <section class="outliner-pane">
    <Outliner
      doc={db.state.outline}
      onChange={(doc) => db.setOutline(doc)}
      onActiveSlideChange={(n) => active.setFromEditor(n)}
    />
  </section>
  {#if listOpen}
    <aside class="list-pane">
      {#if meta.data?.status === 'resolved'}
        <SlideList
          hash={meta.data.hash}
          pageCount={effectivePageCount}
          overflowStart={pdfCount + 1}
          activeSlide={active.value}
          onSelect={(n) => active.setFromList(n)}
        />
      {/if}
    </aside>
  {/if}
</main>

<style>
  header { display: flex; gap: 0.5rem; align-items: center; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
  header input[type='text'] { flex: 1; font-size: 1.25rem; font-weight: 600; border: none; background: transparent; color: inherit; }
  main { display: grid; grid-template-columns: 1fr; height: calc(100vh - 48px); }
  main.list-open { grid-template-columns: 1fr 280px; }
  .outliner-pane { overflow: auto; padding: 1rem; min-width: 240px; }
  .list-pane { overflow: auto; border-left: 1px solid var(--color-border); min-width: 240px; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/routes/+page.svelte
git commit -m "feat(presenter): assemble presenter view"
```

---

## Phase 12: Slideshow View

### Task 40: Slideshow `+page.svelte`

**Files:**

- Create: `packages/client/src/routes/slideshow/+page.svelte`

- [ ] **Step 1: Build slideshow page**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { SlidesMetaStore } from '$lib/slides-meta/slides-meta-store.svelte';
  import { ActiveSlideStore } from '$lib/active-slide/active-slide-store.svelte';
  import { SyncSubscriber } from '$lib/sync/sync-subscriber';
  import SlideImage from '$lib/slide-image/SlideImage.svelte';

  const meta = new SlidesMetaStore();
  const active = new ActiveSlideStore();
  const sub = new SyncSubscriber();

  let cursorVisible = $state(true);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function resetCursor() {
    cursorVisible = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (cursorVisible = false), 5000);
  }

  function onKey(e: KeyboardEvent) {
    resetCursor();
    const next = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key);
    const prev = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey);
    if (next) { active.set(Math.min(active.value + 1, pageCount)); e.preventDefault(); }
    else if (prev) { active.set(Math.max(active.value - 1, 1)); e.preventDefault(); }
    else if (e.key === 'Home') { active.set(1); e.preventDefault(); }
    else if (e.key === 'End') { active.set(pageCount); e.preventDefault(); }
  }

  onMount(() => {
    document.documentElement.dataset.theme = 'dark';
    active.init();
    meta.load();
    sub.subscribe((msg) => {
      if (msg.type === 'active-slide') active.set(msg.slide);
    });
    window.addEventListener('keydown', onKey);
    resetCursor();
    return () => window.removeEventListener('keydown', onKey);
  });

  const pageCount = $derived(meta.data?.status === 'resolved' ? meta.data.pageCount : 0);
</script>

<svelte:window onclick={() => active.set(Math.min(active.value + 1, pageCount))} />

<div class="slideshow" class:no-cursor={!cursorVisible}>
  {#if meta.data?.status === 'resolved'}
    <SlideImage hash={meta.data.hash} slide={active.value} />
  {:else if meta.data?.status === 'no-config-no-file'}
    <p>{m.info_no_slides()}</p>
  {:else if meta.data?.status === 'configured-but-missing'}
    <p>{m.error_slides_not_found({ path: meta.data.configuredPath })}</p>
  {:else if meta.data?.status === 'no-config-multiple-files'}
    <p>{m.error_multiple_pdfs({ files: meta.data.candidates.join(', ') })}</p>
  {/if}
</div>

<style>
  .slideshow { background: #000; color: #fff; width: 100vw; height: 100vh; display: grid; place-items: center; }
  .slideshow.no-cursor { cursor: none; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/routes/slideshow
git commit -m "feat(slideshow): assemble slideshow view"
```

---

## Phase 13: BroadcastChannel Sync

### Task 41: SyncPublisher and SyncSubscriber

**Files:**

- Create: `packages/client/src/lib/sync/messages.ts`
- Create: `packages/client/src/lib/sync/sync-publisher.ts`
- Create: `packages/client/src/lib/sync/sync-subscriber.ts`

- [ ] **Step 1: messages.ts**

```ts
export type SyncMessage = { type: 'active-slide'; slide: number };
```

- [ ] **Step 2: sync-publisher.ts**

```ts
import { BROWSER } from 'esm-env';
import type { SyncMessage } from './messages';

export class SyncPublisher {
  private channel: BroadcastChannel | null = BROWSER
    ? new BroadcastChannel('nfp:active-slide')
    : null;

  publishActiveSlide(slide: number) {
    this.channel?.postMessage({ type: 'active-slide', slide } satisfies SyncMessage);
  }

  destroy() {
    this.channel?.close();
    this.channel = null;
  }
}
```

- [ ] **Step 3: sync-subscriber.ts**

```ts
import { BROWSER } from 'esm-env';
import type { SyncMessage } from './messages';

export class SyncSubscriber {
  private channel: BroadcastChannel | null = BROWSER
    ? new BroadcastChannel('nfp:active-slide')
    : null;
  private listeners: Array<(msg: SyncMessage) => void> = [];

  subscribe(handler: (msg: SyncMessage) => void) {
    if (!this.channel) return () => {};
    const fn = (ev: MessageEvent<SyncMessage>) => handler(ev.data);
    this.channel.addEventListener('message', fn);
    this.listeners.push(handler);
    return () => this.channel?.removeEventListener('message', fn);
  }

  destroy() {
    this.channel?.close();
    this.channel = null;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/lib/sync
git commit -m "feat(sync): BroadcastChannel publisher/subscriber"
```

---

## Phase 14: Slide Status / Error States

### Task 42: SlideListErrorOverlay / SlideListHint / SlideshowFallback

**Files:**

- Create: `packages/client/src/lib/slide-status/SlideListErrorOverlay.svelte`
- Create: `packages/client/src/lib/slide-status/SlideListHint.svelte`
- Create: `packages/client/src/lib/slide-status/SlideshowFallback.svelte`

- [ ] **Step 1: Implement components**

```svelte
<!-- SlideListErrorOverlay.svelte -->
<script lang="ts">
  let { message } = $props<{ message: string }>();
</script>
<div role="alert" aria-live="assertive" class="overlay">
  <p>{message}</p>
</div>
<style>
  .overlay { position: absolute; inset: 0; background: color-mix(in srgb, var(--color-bg) 85%, transparent); display: grid; place-items: center; padding: 1rem; text-align: center; }
</style>
```

```svelte
<!-- SlideListHint.svelte -->
<script lang="ts">
  let { message } = $props<{ message: string }>();
</script>
<div role="status" aria-live="polite" class="hint">{message}</div>
<style>
  .hint { padding: 1rem; color: var(--color-muted); font-size: 0.9rem; }
</style>
```

```svelte
<!-- SlideshowFallback.svelte -->
<script lang="ts">
  let { message } = $props<{ message: string }>();
</script>
<p>{message}</p>
<style>
  p { color: #fff; font-size: 1.25rem; text-align: center; }
</style>
```

- [ ] **Step 2: Wire into presenter +page.svelte slide-list pane (slot in overlay/hint for non-resolved states)**

- [ ] **Step 3: Wire into slideshow +page.svelte using SlideshowFallback**

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/lib/slide-status packages/client/src/routes
git commit -m "feat(status): error/empty state components and integration"
```

---

## Phase 15: E2E Tests

### Task 43: Playwright config and basic fixture

**Files:**

- Create: `packages/client/playwright.config.ts`
- Create: `packages/client/tests/fixtures/basic/slides.pdf` (copy a small PDF)

- [ ] **Step 1: Create playwright.config.ts**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm exec note-first-presenter --port 5173',
    cwd: 'tests/fixtures/basic',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 2: Add sample PDF to fixtures/basic/slides.pdf**

(`packages/client/src/lib/server/__tests__/fixtures/sample.pdf` の小さな PDF を流用)

- [ ] **Step 3: Install Playwright browsers**

```bash
pnpm -F @note-first-presenter/client exec playwright install chromium
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/playwright.config.ts packages/client/tests
git commit -m "test: Playwright config and basic fixture"
```

---

### Task 44: E2E: presenter flow

**Files:**

- Create: `packages/client/src/routes/+page.svelte.e2e.ts`

- [ ] **Step 1: Write test**

```ts
import { test, expect } from '@playwright/test';

test('typing --- creates new slide group', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Outliner' });
  await editor.click();
  await page.keyboard.type('first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('---');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second');
  // listbox should now have an option for the second slide group
  await expect(page.getByRole('option').nth(1)).toBeVisible();
});
```

- [ ] **Step 2: Run**

```bash
pnpm -F @note-first-presenter/client test:e2e
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/routes/+page.svelte.e2e.ts
git commit -m "test(e2e): presenter flow — separator creates new group"
```

---

### Task 45: E2E: slideshow sync

**Files:**

- Create: `packages/client/src/routes/slideshow-sync.e2e.ts`

- [ ] **Step 1: Write test**

```ts
import { test, expect } from '@playwright/test';

test('presenter listbox click updates slideshow image', async ({ context }) => {
  const presenter = await context.newPage();
  await presenter.goto('/');
  await presenter.waitForLoadState('networkidle');

  const slideshow = await context.newPage();
  await slideshow.goto('/slideshow');

  // wait for listbox to be populated
  await presenter.bringToFront();
  const option = presenter.getByRole('option').nth(1); // slide 2
  await option.click();

  await slideshow.bringToFront();
  await expect(slideshow.locator('img')).toHaveAttribute('src', /\/2$/);
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/routes/slideshow-sync.e2e.ts
git commit -m "test(e2e): slideshow follows presenter active slide"
```

---

### Task 46: E2E: slide rendering and persistence

**Files:**

- Create: `packages/client/src/routes/slide-rendering.e2e.ts`

- [ ] **Step 1: Write test**

```ts
import { test, expect } from '@playwright/test';

test('reload preserves outline and title', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/(Untitled|無題)/).fill('My Talk');
  const editor = page.getByRole('textbox', { name: 'Outliner' });
  await editor.click();
  await page.keyboard.type('hello world');
  await page.waitForTimeout(700); // debounce
  await page.reload();
  await expect(page.getByDisplayValue('My Talk')).toBeVisible();
  await expect(page.getByText('hello world')).toBeVisible();
});

test('slide images are served', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('img').first()).toHaveAttribute('src', /\/api\/slide\//);
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/routes/slide-rendering.e2e.ts
git commit -m "test(e2e): persistence and slide rendering"
```

---

## Phase 16: Polish

### Task 47: Run full check and fix lint/type errors

- [ ] **Step 1: Run check**

```bash
pnpm exec vp check
```

修正してから continue。

- [ ] **Step 2: Run all tests**

```bash
pnpm test
pnpm test:e2e
```

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix lint and type errors"
```

---

### Task 48: README updates

**Files:**

- Modify: `README.md`
- Modify: `packages/note-first-presenter/README.md`
- Modify: `packages/client/README.md`

- [ ] **Step 1: Update root README with MVP usage instructions**

````markdown
# note-first-presenter

Run `note-first-presenter` in a directory containing a PDF to start the
presenter dev server. See `docs/superpowers/specs/2026-05-26-note-first-presenter-design.md`
for the design.

## Quick start

```bash
pnpm install
pnpm dev
```
````

````

- [ ] **Step 2: Commit**

```bash
git add README.md packages/*/README.md
git commit -m "docs: MVP usage instructions"
````

---

## Summary of phases

| Phase                  | Tasks | Outcome                                                                  |
| ---------------------- | ----- | ------------------------------------------------------------------------ |
| 1. Setup               | 1-3   | Monorepo skeleton with two packages                                      |
| 2. CLI                 | 4-7   | CLI parses args, resolves config + slides path                           |
| 3. Vite Plugin         | 8-9   | Virtual module + file watchers                                           |
| 4. PDF Pipeline        | 10-14 | Server-side rendering + caching + endpoints                              |
| 5. DB Server           | 15-16 | DB I/O + endpoint with valibot                                           |
| 6. Paraglide           | 17-18 | i18n with SSR-correct lang/dir                                           |
| 7. App Shell           | 19-21 | Theme, layout, ofetch, DbStore                                           |
| 8. Outliner Foundation | 22-25 | Schema, separator, active-slide, Svelte wrapper                          |
| 9. Outliner Commands   | 26-35 | Indent/outdent, Enter/Backspace, move, fold, paste, copy, node selection |
| 10. Slide UI           | 36-38 | SlideImage, SlideList, ActiveSlide store, SlidesMeta store               |
| 11. Presenter          | 39    | Presenter `/` page wired up                                              |
| 12. Slideshow          | 40    | Slideshow `/slideshow` page wired up                                     |
| 13. Sync               | 41    | BroadcastChannel publisher/subscriber                                    |
| 14. Error States       | 42    | SlideStatus components and integration                                   |
| 15. E2E                | 43-46 | Playwright config and 3 E2E tests                                        |
| 16. Polish             | 47-48 | Lint/type fixes, README                                                  |

---

## Execution notes

- Each task should produce a passing test (where applicable) and a clean `vp check` before commit
- Phase 9 (outliner commands) has the highest implementation risk — expect multiple TDD iterations per command
- Phase 11/12 integration is where many small bugs surface — run dev server manually after Task 39 and 40 to verify visual correctness
- E2E tests in Phase 15 require a sample PDF in `tests/fixtures/basic/slides.pdf` that's small enough to commit (< 50KB ideally)
