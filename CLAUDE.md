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

## Testing layers

Tests are split into three layers, determined by filename:

- `**/__tests__/*.test.ts` — unit (vitest, Node for nfp / happy-dom for client). The default `vp test` target.
- `packages/note-first-presenter/test/cli/*.cli.test.ts` — CLI integration (vitest, runs the packed bin via `globalSetup`). Run with `pnpm test:cli`.
- `e2e/*.e2e.ts` — end-to-end (Playwright against `pnpm -F ./e2e/fixtures/basic dev`). Run with `pnpm test:e2e`.

`pnpm ready` runs `vp check` → unit (`vp run -r test`) → CLI integration → e2e → builds. See `docs/superpowers/specs/2026-06-01-test-taxonomy-design.md` for the four-layer plan (incl. the deferred Svelte component layer), and `docs/superpowers/specs/2026-06-01-test-taxonomy-deferred.md` for what is pending an upstream vite-plus browser-mode fix.
