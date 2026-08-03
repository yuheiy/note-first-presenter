<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Agent skills

- Issue tracker: GitHub Issues + `gh` CLI とラベル語彙 — `docs/agents/issue-tracker.md`
- Domain docs: `CONTEXT.md`（用語集）+ `docs/adr/` の読み方 — `docs/agents/domain.md`

## Repo rules

Only rules that cannot live next to the code they govern. Everything else belongs in a comment at the site it applies to, or in `docs/adr/`.

- Compose every URL the client app emits through `packages/client/src/lib/urls.ts` — never assemble one inline. Matching URLs to pages is wouter's job, configured only in `packages/client/src/App.tsx`, and only within the boundaries its comments spell out (no `<Link>`, no `useSearchParams`, no pathless fallback Route). Both files' own comments carry the rules (`docs/adr/0017`).
- Call messages as `m.some_key()`, never `m[key]()`, which defeats tree-shaking.
- Run `vp run test`, never `vp test` — the checklist line above is upstream boilerplate that `vp` rewrites on sync, so it cannot be corrected in place. `vp test` runs Vitest from the root, where no browser project is configured, so every `*.browser.test.{ts,tsx}` dies in Node on `DOMParser is not defined`, and nothing about the output says the command was the problem. Root `dev` collides with a built-in the same way.
- A test file's name picks its layer: `e2e/**/*.e2e.ts` is Playwright, `*.browser.test.{ts,tsx}` is real Chromium, any other `*.test.ts` is Node (`docs/adr/0005`).
- `vp run test` never sees the published form. `vp run -w verify:package` does (CI on every change, `prepublishOnly` on the way out); assert distribution-specific facts there and nothing else (`docs/adr/0021`). When `note-first-presenter#build` fails on an undeclared import, read it as "declare it in `dependencies`", not "add it to the whitelist" (`docs/adr/0020`).
- `vp run` takes one task name only. `vp run --parallel a#dev b#dev` silently passes `b#dev` as an argument to `a#dev`; select several with a repeated `--filter` instead, as the root `dev` script does.
- If `vp check` reports unresolved imports from `src/lib/paraglide/`, run `vp run messages` first.
