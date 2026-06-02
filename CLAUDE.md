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

Four layers, keyed by filename. Rationale: `docs/adr/0005-four-test-layers-keyed-by-filename.md`.

| Pattern                                                | Layer                                     | Run with                                                                               |
| ------------------------------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `**/__tests__/*.test.ts`                               | unit (Node for nfp, happy-dom for client) | `vp test`                                                                              |
| `packages/client/src/**/__tests__/*.browser.test.ts`   | component (vitest browser, Chromium)      | `vp test -c vitest.browser.config.ts` (chained after unit by the client `test` script) |
| `packages/note-first-presenter/test/cli/*.cli.test.ts` | CLI integration (packed bin)              | `pnpm test:cli`                                                                        |
| `e2e/*.e2e.ts`                                         | end-to-end (Playwright, `basic` fixture)  | `pnpm test:e2e`                                                                        |

`pnpm ready` runs check → unit + component → CLI integration → e2e → builds.
