/*
 * «Gettone sempre» (owner 02/11/2026): il cookie della corsa, per chi apre un contesto suo. `playwright.config.mjs` lo mette già in `use.storageState`, e
 * `browser.newContext()` lo eredita; chi passa uno `storageState` proprio o usa `playwright.request.newContext()` lo chiede qui.
 * Con `TALOS_HARNESS_UI_BASE_URL` (un server acceso da altri) non c'è un gettone di corsa: niente cookie.
 */
export function cookieDellaCorsa(baseURL) {
  const gettone = process.env.TALOS_PW_GETTONE;
  if (!gettone) return [];
  return [{ name: 'talos_token', value: gettone, domain: new URL(baseURL).hostname, path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Strict' }];
}

export const statoColCookie = (baseURL) => ({ cookies: cookieDellaCorsa(baseURL), origins: [] });
