// Browser-mode component tests import `expect` from `vite-plus/test`. The bundled
// browser-matcher augmentations target `declare module 'vitest'`, which resolves to a
// different physical package instance than `vite-plus/test`, so they never reach the
// `ExpectStatic`/`JestAssertion` the tests actually use. Re-augment `vite-plus/test`
// directly with the browser-only matchers the component tests rely on.
import type { Locator } from 'vite-plus/test/browser/context';
import type { Assertion, ExpectPollOptions } from 'vite-plus/test';

declare module 'vite-plus/test' {
  type Promisify<O> = {
    [K in keyof O]: O[K] extends (...args: infer A) => infer R
      ? O extends R
        ? Promisify<O[K]>
        : (...args: A) => Promise<R>
      : O[K];
  };

  interface ExpectStatic {
    /**
     * `expect.element(locator)` is a shorthand for `expect.poll(() => locator.element())`.
     */
    element: <T extends HTMLElement | SVGElement | null | Locator>(
      element: T,
      options?: ExpectPollOptions,
    ) => Promisify<Assertion<Awaited<HTMLElement | SVGElement | null>>>;
  }

  // jest-dom / @testing-library matchers used by the component tests. This is a curated
  // subset, not the full matcher set: add a new entry here when a test starts using
  // another jest-dom matcher (otherwise it fails type-check with TS2339). Signatures are
  // copied from the bundled `@vitest/browser/jest-dom.d.ts` (TestingLibraryMatchers) and
  // must be kept in sync with it across vite-plus upgrades.
  interface JestAssertion<T = any> {
    toBeInTheDocument(): T;
    toHaveAttribute(attr: string, value?: unknown): T;
    toHaveTextContent(
      text: string | number | RegExp,
      options?: { normalizeWhitespace: boolean },
    ): T;
    toHaveValue(value?: string | string[] | number | null): T;
  }
}
