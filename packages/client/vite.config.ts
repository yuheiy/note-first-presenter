import { defineConfig } from 'vite-plus';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  fmt: {},
  lint: { options: { typeAware: true } },
});
