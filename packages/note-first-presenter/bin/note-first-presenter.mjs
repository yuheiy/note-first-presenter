#!/usr/bin/env node
// A stub, not the entry: `bin` has to name a path that exists before a build, so
// the real CLI stays in dist/ and this only forwards to it (docs/adr/0020).
// Static, because the reason this used to be a dynamic import is gone with the
// source distribution — the `process.emitWarning` shim that silenced the
// type-stripping warning had to run before the first `.ts` loaded, and a static
// import would have been hoisted above it.
import '../dist/cli.mjs';
