// Folded in by Vite's `define` — the CLI's createViteConfig is the source of
// truth, and packages/client/vite.config.ts repeats it so tests and the IDE
// resolve it too (docs/adr/0014's asymmetry, docs/adr/0017 for the value).
//
// The union itself lives in lib/routes.ts, which is where the mode is reasoned
// about; spelling `'hash' | 'history'` here would be a second copy of it. The
// CLI's config.ts holds a third, across a package boundary. That one could in
// principle follow dbSchema's precedent (client owns it, CLI subpath-imports it,
// docs/adr/0013) — but the CLI is what defines and validates the option, so
// moving its home into the client to dedupe two string literals would invert
// ownership. Left alone deliberately.
declare const __NFP_ROUTER_MODE__: import('./lib/routes').RouterMode;
