<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Testing layers

Four layers, keyed by filename. Client uses `test.projects` to split into `server` (Node) and `client` (browser/Chromium); nfp defines `test` directly; root defines integration via `test.include`. e2e runs under Playwright. Rationale: `docs/adr/0005-four-test-layers-keyed-by-filename.md`.

| Pattern                                       | Layer                             | Vitest project  | Run with                  |
| --------------------------------------------- | --------------------------------- | --------------- | ------------------------- |
| `**/*.test.ts` (excluding `*.svelte.test.ts`) | server/unit (Node)                | `server`/`unit` | `vp run test:unit`        |
| `packages/client/src/**/*.svelte.test.ts`     | client (vitest browser, Chromium) | `client`        | `vp run test:unit`        |
| `test/*.test.ts`                              | CLI integration (packed bin)      | —               | `vp run test:integration` |
| `e2e/*.e2e.ts`                                | end-to-end (Playwright)           | —               | `vp run test:e2e`         |

`vp run test` runs all layers: `test:unit` → `test:integration` → `test:e2e`.

Run tests only through `vp test` / `vp run test`, never a bare `vitest`. Test files import `vite-plus/test`; launching the stock `vitest` (e.g. `vp exec vitest run`) loads a second `@vitest/runner` and breaks — unit tests die with `Cannot read properties of undefined (reading 'config')`, and **browser-mode tests hang silently** with no error. To run one layer, scope `vp test` (e.g. `vp test --project client <path>`).

## CLI packaging

The published `note-first-presenter` CLI is bundled with `vp pack`. `vp pack` externalizes declared dependencies as bare specifiers but bakes any **undeclared** import in as a resolved absolute path, which makes the package unpublishable. Declare every runtime dependency the CLI bundle reaches (e.g. `pdfjs-dist`, `@napi-rs/canvas`, `eta`) in the CLI package's `dependencies`, and verify a built `dist/` contains no `/Users/` or `/node_modules/` absolute paths. `vitest` hides this because Vite resolves `.ts` directly — verify against the packed bin.
