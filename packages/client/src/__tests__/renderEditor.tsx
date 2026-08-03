import { createStore, Provider } from 'jotai';
import { StrictMode } from 'react';
import { expect } from 'vite-plus/test';
import { render } from 'vitest-browser-react';
import { Editor } from '../components/workspace/Editor';

/**
 * Renders the Editor the way the app runs it — under `<StrictMode>`, with the
 * doubled mount that entails — and waits for the outliner, which appears only
 * once the document has landed.
 *
 * The store is this render's own. The app renders no Provider, so it reads
 * jotai's default store; injecting one here is what keeps a document fetched by
 * one test out of the next.
 *
 * The locale is pinned for the whole browser project in
 * vitest-setup.browser.ts — it is Paraglide's, not a provider's, so it cannot
 * be wrapped around a subtree. That is what lets expectations stay English
 * literals.
 */
export async function renderEditor() {
  const screen = await render(
    <StrictMode>
      <Provider store={createStore()}>
        <Editor />
      </Provider>
    </StrictMode>,
  );
  await expect.element(screen.getByRole('textbox', { name: 'Outliner' })).toBeInTheDocument();
  return screen;
}
