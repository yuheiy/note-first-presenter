import { mount } from 'svelte';
import { getLocale, getTextDirection } from '#lib/paraglide/runtime';

document.documentElement.lang = getLocale();
document.documentElement.dir = getTextDirection();

const isSlideshow = location.pathname.startsWith('/slideshow');
const { default: Component } = isSlideshow
  ? await import('./Slideshow.svelte')
  : await import('./Presenter.svelte');

mount(Component, { target: document.getElementById('app')! });
