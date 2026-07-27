#!/usr/bin/env node
// A stub, not the entry: `bin` has to name a path that exists before a build, so
// the real CLI stays in dist/ and this only forwards to it (docs/adr/0020). The
// type-stripping warning this used to silence is gone with the source
// distribution that emitted it.
await import('../dist/cli.mjs');
