/*
 * La Review del mockup come dati: le voci di `state.realSession.reviewFiles`
 * (percorso, righe del diff [tipo, testo] con il segno già nel testo, giro,
 * ricevuta quando c'è, conteggi quando il server li ha già fatti).
 */
export const REVIEW = Object.freeze({
  corrente: 'src/session-registry.mjs',
  voci: [
    {
      path: 'src/session-registry.mjs', giro: 5, ricevuta: 'a1f4…9c02', nuovo: false, aggiunte: 18, rimozioni: 2,
      code: [
        ['ctx', '@@ -178,8 +178,24 @@ export const SOGLIE_STALLO_PREDEFINITE'],
        ['ctx', '  /*'],
        ['ctx', '   * Le soglie sono PARAMETRI, non numeri nella logica.'],
        ['ctx', '   */'],
        ['del', '− const SOGLIE = { silenzioMs: 30_000 };'],
        ['del', '− export function guardiaDiStallo(eventi) { return valuta(eventi, SOGLIE); }'],
        ['add', '+ export const SOGLIE_STALLO_PREDEFINITE = Object.freeze({'],
        ['add', '+   silenzioMs: 60_000,        // 30-60 s è lo stato dell\'arte (ricerca 04/09)'],
        ['add', '+   ripetizioniPerAllarme: 3,  // misurato: 65 identiche su 634 chiamate'],
        ['add', '+   finestraChiamate: 10,'],
        ['add', '+ });'],
        ['add', '+'],
        ['add', '+ export function guardiaDiStallo(eventi, { istanti, adesso, soglie } = {}) {'],
        ['add', '+   const soglieEffettive = { ...SOGLIE_STALLO_PREDEFINITE, ...(soglie ?? {}) };'],
        ['add', '+   return { silenzio: valutaSilenzio(eventi, istanti, adesso, soglieEffettive),'],
        ['add', '+            giroAVuoto: valutaRipetizioni(eventi, soglieEffettive), interviene: false };'],
        ['add', '+ }'],
      ],
    },
    { path: 'tests/session-registry.test.mjs', giro: 5, ricevuta: 'b73c…10ee', nuovo: true, aggiunte: 64, rimozioni: 0, code: [] },
    { path: 'src/http-app.mjs', giro: 6, ricevuta: '91aa…4f07', nuovo: false, aggiunte: 30, rimozioni: 0, code: [] },
  ],
});
