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

## Repo rules

Only rules that cannot live next to the code they govern. Everything else belongs in a comment at the site it applies to, or in `docs/adr/`.

- Build every URL the client app reads or writes through `packages/client/src/lib/routes.ts` — never assemble one inline. Base is spelled differently per use and every wrong spelling still works at the origin root, so nothing catches it. That file's own comments carry the rules (`docs/adr/0017`).
- Call messages as `m.some_key()`, never `m[key]()`, which defeats tree-shaking.
- Every runtime dependency of `packages/note-first-presenter` must be in its own `dependencies` (`pdfjs-dist`, `@napi-rs/canvas`, `eta`). `vp check` cannot catch this — an undeclared import resolves from the hoisted workspace locally and breaks only for published users — but `vp run note-first-presenter#build` now does, via `deps.onlyBundle` (`docs/adr/0020`). Read the failure as "declare it", not "add it to the whitelist".
- A test file's name and location pick its layer: `test/*.test.ts` is CLI integration, `e2e/**/*.e2e.ts` is Playwright, a package's `*.browser.test.{ts,tsx}` is real Chromium, and any other `*.test.ts` is Node. `vp run test` runs all four (`docs/adr/0005`). The two CLI-facing layers run the built `dist/`, so they declare `note-first-presenter#build` as a `dependsOn` in the root `vite.config.ts` rather than chaining it into the script.
- `vp run` takes one task name only. `vp run --parallel a#dev b#dev` silently passes `b#dev` as an argument to `a#dev`; select several with a repeated `--filter` instead, as the root `dev` script does.
- If `vp check` reports unresolved imports from `src/lib/paraglide/`, run `vp run messages` first.
