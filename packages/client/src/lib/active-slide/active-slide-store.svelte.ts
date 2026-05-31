import { BROWSER } from 'esm-env';

export class ActiveSlideStore {
  value: number = $state(1);

  hydrate() {
    if (!BROWSER) return;
    const param = new URL(location.href).searchParams.get('slide');
    if (param) {
      const n = Number(param);
      if (Number.isFinite(n) && n >= 1) this.value = Math.floor(n);
    }
  }

  syncToUrl() {
    if (!BROWSER) return;
    const u = new URL(location.href);
    if (u.searchParams.get('slide') === String(this.value)) return;
    u.searchParams.set('slide', String(this.value));
    history.replaceState(history.state, '', u);
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
