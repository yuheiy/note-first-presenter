// Empty on purpose: this file exists only so knip's SvelteKit plugin detects
// the workspace (auto-providing route entries, the $lib alias, and $app/$env
// ignores). All real SvelteKit config is passed inline to sveltekit() — by the
// CLI (packages/note-first-presenter/src/vite/index.ts) and by the client's
// vite.config.ts. Do not add configuration here; see docs/adr/0007 (追記).
export default {};
