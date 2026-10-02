import { writable } from 'svelte/store';
export const appearanceModes = ['light', 'dark', 'system'];
export const normalizeMode = mode => appearanceModes.includes(mode) ? mode : 'system';
export const resolveAppearance = (mode, systemDark) => mode === 'dark' || (normalizeMode(mode) === 'system' && systemDark) ? 'dark' : 'light';
const key = 'pulse.appearance';
export function createAppearance({ storage, media, root, send } = {}) {
  let mode = 'system';
  try { mode = normalizeMode(storage?.getItem(key)); } catch { /* Storage may be unavailable in a browser. */ }
  const state = writable({ mode, resolved: resolveAppearance(mode, media?.matches) });
  const apply = (resolved = resolveAppearance(mode, media?.matches)) => {
    if (root) { root.dataset.theme = resolved; root.style.colorScheme = resolved; }
    state.set({ mode, resolved });
  };
  const persist = () => { try { storage?.setItem(key, mode); } catch { /* Native preferences still persist. */ } };
  const systemChanged = () => { if (!send && mode === 'system') apply(); };
  media?.addEventListener('change', systemChanged);
  apply();
  return {
    subscribe: state.subscribe,
    setMode(value) { mode = normalizeMode(value); persist(); apply(); send?.('appearance', { mode }); },
    acceptNative(value) { if (!value || !['light', 'dark'].includes(value.resolved)) return; mode = normalizeMode(value.mode); persist(); apply(value.resolved); },
    destroy() { media?.removeEventListener('change', systemChanged); }
  };
}
let storage;
try { storage = globalThis.localStorage; } catch { /* Restricted browser storage. */ }
export const appearance = createAppearance({ storage, media: globalThis.matchMedia?.('(prefers-color-scheme: dark)'), root: globalThis.document?.documentElement, send: globalThis.window?.HybridWebView?.SendEvent });
if (globalThis.window) window.addEventListener('pulse-native', event => {
  if (event.detail.type === 'appearance') appearance.acceptNative(event.detail.payload);
});
