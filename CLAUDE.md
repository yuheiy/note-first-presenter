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
| `test/*.test.ts`                              | CLI integration (source bin)      | —               | `vp run test:integration` |
| `e2e/*.e2e.ts`                                | end-to-end (Playwright)           | —               | `vp run test:e2e`         |

`vp run test` runs all layers: `test:unit` → `test:integration` → `test:e2e`.

Run tests only through `vp test` / `vp run test`, never a bare `vitest`. Test files import `vite-plus/test`; launching the stock `vitest` (e.g. `vp exec vitest run`) loads a second `@vitest/runner` and breaks — unit tests die with `Cannot read properties of undefined (reading 'config')`, and **browser-mode tests hang silently** with no error. To run one layer, scope `vp test` (e.g. `vp test --project client <path>`).

## CLI packaging

The `note-first-presenter` CLI ships `.ts` source directly — no build step (Node `>=22.18` type-strips on import). Rationale and full rules: `docs/adr/0010-source-distribution-no-build-step.md`.

The one trap `vp check` can't catch: **every runtime dependency must be in the package's `dependencies`** (e.g. `pdfjs-dist`, `@napi-rs/canvas`, `eta`). An undeclared import resolves from the hoisted workspace locally but breaks for published users. The other constraints are enforced at type-check time — `module: nodenext` (nodenext resolution) rejects extensionless/directory imports (TS2835), `erasableSyntaxOnly` rejects non-strippable syntax (TS1294).
