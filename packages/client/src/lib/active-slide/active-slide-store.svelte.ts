import { replaceState } from '$app/navigation';
import { page } from '$app/state';
import { BROWSER } from 'esm-env';

export class ActiveSlideStore {
  value: number = $state(1);
  #ready: boolean = false;

  hydrate() {
    if (!BROWSER) return;
    const param = page.url.searchParams.get('slide');
    if (param) {
      const n = Number(param);
      if (Number.isFinite(n) && n >= 1) this.value = Math.floor(n);
    }
    this.#ready = true;
  }

  syncToUrl() {
    if (!BROWSER || !this.#ready) return;
    const current = page.url.searchParams.get('slide');
    if (current === String(this.value)) return;
    const u = new URL(page.url);
    u.searchParams.set('slide', String(this.value));
    try {
      replaceState(u, page.state);
    } catch {
      // Router not yet initialized (first hydration tick). Safe to ignore;
      // later changes will sync once routing is ready.
    }
  }

  set(n: number) {
    this.value = n;
  }

  setFromEditor(n: number) {
    this.value = n;
  }

  setFromList(n: number) {
    this.value = n;
  }
}
