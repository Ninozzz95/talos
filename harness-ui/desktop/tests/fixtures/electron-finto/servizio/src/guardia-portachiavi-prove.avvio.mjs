/*
 * The fake local service (`../server.mjs`) as the shell sees it. Round k (11/11/2026): the desktop shell preloads
 * `<harness>/src/guardia-portachiavi-prove.avvio.mjs` before the server (`runtime.mjs`, `creaAvvioFiglio`), as in the real package.
 * The fake service opens no keychain, so its preload does nothing; without the file node would not start the service at all.
 */
export const LETTURA_ANTENATI_AVVIATA = false;
