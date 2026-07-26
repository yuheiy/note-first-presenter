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

Issues are tracked as GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Testing layers

Four layers, keyed by filename. Client uses `test.projects` to split into `node` and `browser` (Chromium); nfp defines `test` directly; root defines integration via `test.include`. e2e runs under Playwright. Rationale: `docs/adr/0005-four-test-layers-keyed-by-filename.md`.

| Pattern                                              | Layer                        | Vitest project       | Run with                  |
| ---------------------------------------------------- | ---------------------------- | -------------------- | ------------------------- |
| `**/*.test.ts` (excluding `*.browser.test.{ts,tsx}`) | node                         | `node` (client only) | `vp run test:unit`        |
| `packages/client/src/**/*.browser.test.{ts,tsx}`     | browser (vitest, Chromium)   | `browser`            | `vp run test:unit`        |
| `test/*.test.ts`                                     | CLI integration (source bin) | —                    | `vp run test:integration` |
| `e2e/**/*.e2e.ts`                                    | end-to-end (Playwright)      | —                    | `vp run test:e2e`         |

The suffix, not the extension, is the key: needing a real browser does not imply JSX (`plugins/paste.ts` needs `DOMParser` and no React at all).

e2e splits into two Playwright projects: `dev` (against the CLI dev server on 5173) and `static` (`e2e/static/`, against the emitted `dist/` on 4173, built by the `static-build` setup project). `--project=dev` skips the ~60s build.

`vp run test` runs all layers: `test:unit` → `test:integration` → `test:e2e`.

Run tests through `vp test` / `vp run test`. To run one layer, scope `vp test` (e.g. `vp test --project browser <path>`). Since vite-plus 0.2.x the old bare-`vitest` breakage (second `@vitest/runner`: unit tests died, browser-mode tests hung silently) is gone — the catalog now pins stock `vitest` exactly at vp's bundled version. That exact pin is what keeps it safe: don't bump the `vitest` catalog entry independently of `vite-plus`; let `vp migrate` move them in lockstep.

## Messages (i18n)

Client UI strings live in `packages/client/messages/{en,ja}.json` and are compiled by Paraglide into `packages/client/src/lib/paraglide/`. Rationale and the full accounting of what the move cost: `docs/adr/0016-paraglide-for-client-i18n.md`.

- **`src/lib/paraglide/` is generated and gitignored — never edit it.** Rebuild with **`vp run messages`**. Every `vp run` entry point (`dev`, `test:*`) chains it already, and the client's `prepare` covers installs and the published tarball; the task is cached, so it is free when current.
- **`vp check` is the exception** — it is a built-in, not a `vp run` task, so it cannot chain. If `src/lib/paraglide/` is missing (cleaned tree, or CI that caches `node_modules`) it reports unresolved-import errors, and `vp install` will _not_ fix it because pnpm only runs `prepare` when it actually installs. Run `vp run messages` first.
- **`vp run dev` starts a watcher alongside the server**, so editing a catalog recompiles and reaches the browser without a restart (the dev server itself has no Paraglide plugin). `vp run client#dev` runs the watcher alone. Note that `vp run` takes only one task name — `vp run --parallel client#dev demo#dev` silently passes `demo#dev` as an argument to the first task, so the two must be selected with a repeated `--filter` instead.
- **Adding a message means editing both catalogs.** A missing translation is not a build error — Paraglide silently falls back to English. `src/__tests__/messageCatalogs.test.ts` is what catches it.
- **Compiler options are CLI flags on the `compile-messages` script.** Paraglide has no config file; `project.inlang/settings.json` holds only locales and plugins. Each flag's reason is tabulated in ADR-0016.
- Call messages as `m.some_key()` — never `m[key]()`, which defeats tree-shaking. Arguments are typed `NonNullable<unknown>`, so passing a string where a number is meant type-checks.

## CLI packaging

The `note-first-presenter` CLI ships `.ts` source directly — no build step (Node `>=22.18` type-strips on import). Rationale and full rules: `docs/adr/0010-source-distribution-no-build-step.md`.

The one trap `vp check` can't catch: **every runtime dependency must be in the package's `dependencies`** (e.g. `pdfjs-dist`, `@napi-rs/canvas`, `eta`). An undeclared import resolves from the hoisted workspace locally but breaks for published users. The other constraints are enforced at type-check time — `module: nodenext` (nodenext resolution) rejects extensionless/directory imports (TS2835), `erasableSyntaxOnly` rejects non-strippable syntax (TS1294).
