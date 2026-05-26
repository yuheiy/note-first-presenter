import { BROWSER } from 'esm-env';

export class ActiveSlideStore {
  value: number = $state(1);

  hydrate() {
    if (!BROWSER) return;
    const param = new URL(window.location.href).searchParams.get('slide');
    if (param) {
      const n = Number(param);
      if (Number.isFinite(n) && n >= 1) this.value = Math.floor(n);
    }
  }

  syncToUrl() {
    if (!BROWSER) return;
    const u = new URL(window.location.href);
    u.searchParams.set('slide', String(this.value));
    window.history.replaceState({}, '', u);
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
