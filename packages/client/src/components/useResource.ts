import { useEffect, useState } from 'react';

/**
 * The state of one fetched thing.
 *
 * A discriminated union rather than the pair of `ready` / `loadFailed` booleans
 * the Svelte version carried, so "loaded but also failed" cannot be spelled.
 * See plans/react-rewrite-spec.md §3.2.
 */
export type Resource<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: string };

/**
 * Where one fetch has got to, for callers that pass the phase along without
 * caring what was fetched — the Workspace shell decides what to draw from this
 * alone, and never sees the db itself.
 */
export type ResourceStatus = Resource<unknown>['status'];

/**
 * A request wrapped so that it settles instead of rejecting, and so that the
 * same generation is only ever requested once.
 *
 * The generation is what makes both of the app's needs one mechanism: the entry
 * can warm generation 0 while the page chunk is still downloading (§1.3), and
 * `<StrictMode>`'s doubled effect then finds that same promise instead of firing
 * a second request. Bumping the generation is how live-reload asks for fresh
 * data (§3.3).
 *
 * Only the newest generation is kept, which fits the one-owner-per-document rule
 * of §3.3. Two consumers on different generations would cost one extra request
 * each time they crossed, never a loop.
 */
export type ResourceLoader<T> = (generation?: number) => Promise<Resource<T>>;

export function createResourceLoader<T>(request: () => Promise<T>): ResourceLoader<T> {
  let loaded: { generation: number; result: Promise<Resource<T>> } | null = null;
  return (generation = 0) => {
    if (loaded?.generation !== generation) {
      loaded = {
        generation,
        result: request().then(
          (data): Resource<T> => ({ status: 'ready', data, error: null }),
          (err: unknown): Resource<T> => ({
            status: 'error',
            data: null,
            error: err instanceof Error ? err.message : String(err),
          }),
        ),
      };
    }
    return loaded.result;
  };
}

const LOADING: Resource<never> = { status: 'loading', data: null, error: null };

/**
 * The one data-fetching hook: a loader in, render state out.
 *
 * `load` has to be stable, which module-level loaders built by
 * `createResourceLoader` are. Raising `generation` re-runs the request.
 */
export function useResource<T>(load: ResourceLoader<T>, generation = 0): Resource<T> {
  const [resource, setResource] = useState<Resource<T>>(LOADING);

  useEffect(() => {
    let current = true;
    void load(generation).then((next) => {
      if (current) setResource(next);
    });
    return () => {
      current = false;
    };
  }, [load, generation]);

  return resource;
}
