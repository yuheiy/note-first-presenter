import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/cli.ts'],
    dts: {
      tsgo: true,
    },
    // `cli` is an entry so the bin has something to import, not an API. Excluding
    // it keeps it out of the generated `exports` while still emitting dist/cli.mjs.
    exports: {
      exclude: ['cli'],
    },
    deps: {
      // The client ships as unbuilt `.ts` (docs/adr/0020) because Vite is what
      // loads it. dbSchema is the one file Node reads instead, so it cannot stay
      // external — a bare `@note-first-presenter/client/dbSchema` in dist/ would
      // hand a published user's Node the very `.ts`-under-node_modules it cannot
      // strip. Bundling copies it into dist/ and leaves valibot a bare import.
      // ADR-0013's "the client owns the definition" is about the source, and
      // that still holds: the copy is generated, never authored.
      alwaysBundle: [/^@note-first-presenter\/client(\/|$)/],
      // The whitelist that makes the old hazard loud. `vp pack` bakes an
      // *undeclared* import in as a resolved absolute path, which publishes a
      // package that only works on this machine; ADR-0010 fled the build step
      // partly to escape it. Anything bundled from node_modules now fails the
      // build instead, naming the specifier and its importer, so the rule about
      // declaring every runtime dependency has a machine enforcing it.
      //
      // Empty, not the client: `alwaysBundle`'s target reaches the graph through
      // the workspace symlink, which this does not count as node_modules — so
      // listing it here only earns an "unused entry" warning. Nothing legitimate
      // is bundled *from node_modules*, and that is exactly the claim.
      onlyBundle: [],
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
});
