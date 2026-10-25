import { expect, test } from '@playwright/test';

import { avanzaScansione, confineDiRivelazione, creaScansione } from '../../src/components/markdown-in-arrivo.js';
import { attendiFineStoria, flussoConConfine } from './aiuto-confine.mjs';
import { cadenzaAPacchetti, cadenzaRegolare } from './aiuto-scenari-fluido.mjs';

/*
 * ⭐⭐⭐ 22/10/2026 — I CANCELLI DELLO STREAMING FLUIDO. Owner: «lo streaming del testo è molto scattoso … si ferma … in
 *   conversazioni lunghe non deve scattare. Voglio il massimo del massimo della tecnologia».
 *
 * ⛔ PERCHÉ ESISTONO. La cura del 20/09 (`ff0e47788`, il ritmo di Hermes, verificata dall'owner: «RISOLTO») è stata tolta il
 *   29/09 (`0238eea02`) per far tornare verde un altro cancello, e nessuna prova se n'è accorta: nessuna prova diceva che il testo
 *   dovesse SCORRERE. Questi cancelli lo dicono, e ognuno è stato visto diventare rosso togliendo il pezzo che protegge (i
 *   mutanti sono nel rapporto `RAPPORTO-STREAMING-FLUIDO-2026-10-22.md`):
 *   · FLUIDO-01 — il renderer incrementale dà a OGNI prefisso lo stesso DOM del renderer «tutto insieme» (confini nuovi, recinto
 *     e tabella che crescono sul posto): la garanzia del 02/09, ora su tutti i tagli e a ogni carattere;
 *   · FLUIDO-02 — mentre il testo scorre non compare MAI la sintassi a metà (`**`, `](`, `##`, le barre di una tabella, i
 *     backtick di un recinto);
 *   · FLUIDO-03 — a pacchetti (la forma del filo vero) il testo scorre senza fermarsi con testo da mostrare, molto più regolare
 *     del «mostra tutto» di prima (la stessa misura sulla stessa cadenza, nella stessa prova), e nessun testo VISIBILE resta
 *     indietro oltre il limite dichiarato (fermate e ritardo letti su ciò che si vede: `oracoloDelVisibile`, 23/10/2026 sera); le
 *     scene sorelle -LINK, -CODICE e -SPAZIO fanno lo stesso con un collegamento, un «](» nel codice e un indirizzo con uno spazio;
 *   · FLUIDO-04 — «Riduci il movimento» dell'app e la storia rigiocata restano istantanei; una finestra nascosta riceve tutto;
 *   · FLUIDO-05 — il recinto aperto e la tabella crescono SUL POSTO (gli stessi nodi da un fotogramma all'altro);
 *   · FLUIDO-06 — in una conversazione lunga i turni chiusi non si impaginano fuori vista, e mentre il testo scorre il segnavia
 *     e il piede non riscrivono niente a vuoto (il costo per fotogramma non dipende dal numero di turni);
 *   · FLUIDO-07 — all'avvio vale la scelta delle Impostazioni («Dissolvenza» di serie) e il ritmo è acceso: è il cancello che
 *     mancava — dal 14/09 `main.js` forzava `none` all'avvio, e nessuna prova diceva quale modalità trova chi apre l'app;
 *   · FLUIDO-08 — un turno montato fuori vista non si salta prima del suo primo disegno (altrimenti vale l'altezza di stima e,
 *     entrando in vista, si accorcia sotto lo scrittore che segue: trovato dalla suite intera il 22/10);
 *   · FLUIDO-09 — in «Dissolvenza» il codice in linea entra insieme alle sue parole (trovato nelle foto del giro vero).
 * ⛔ Mai il 4174: server proprio (playwright.config.mjs, porta 4176, archivio vuoto); la sessione è finta e il flusso è una rotta.
 */

const SID = 'streaming-fluido';

async function apri(page) {
  await page.addInitScript(() => { try { localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })); } catch { /* niente storage */ } });
  await page.route((url) => url.pathname === `/api/v1/sessions/${SID}/events`, flussoConConfine);
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.evaluate((sid) => window.__talosHarnessUiRuntime.passaASessione(sid, 'workspace', 'Streaming fluido', 'local:prova', { conclusa: false, modello: 'local:prova' }), SID);
  await attendiFineStoria(page);
}

/* Un testo con TUTTO ciò che il renderer incrementale taglia e fa crescere sul posto, compresi i casi di confine: un titolo
   subito dopo un paragrafo, una tabella subito dopo un paragrafo (senza riga vuota), un recinto subito dopo una voce d'elenco,
   un separatore rientrato dentro una voce (seguito della voce, non un blocco), una citazione col suo seguito pigro. */
const TESTO_RICCO = [
  'Intro con **grassetto**, *corsivo*, `codice` e un [collegamento](https://example.com/pagina).',
  '## Titolo subito dopo il paragrafo',
  'Un paragrafo',
  'su due righe.',
  '',
  '- prima voce',
  '  - sottovoce con **forza**',
  '  ---',
  '- seconda voce',
  '```js',
  'const a = 1;',
  '',
  'const b = [a, 2];',
  '```',
  'Paragrafo dopo il recinto.',
  '| Colonna A | Colonna B |',
  '|:---|---:|',
  '| uno | `due` |',
  '| tre | **quattro** |',
  '',
  '> una citazione',
  'col seguito pigro',
  '',
  '1. primo',
  '2. secondo',
  '---',
  '### Fine',
  'Ultima riga.',
].join('\n');

test('STREAMING-FLUIDO-01 — il renderer incrementale dà lo stesso DOM del tutto-insieme a OGNI prefisso, a passi di un carattere e a salti', async ({ page }) => {
  await apri(page);
  const esito = await page.evaluate((testo) => {
    const { nuovoStatoRender, renderizzaIncrementale, renderizzaTutto } = window.__talosHarnessUiRuntime.streamingPerProve;
    const normalizza = (html) => html.replace(/ class="stream-settle"/g, '').replace(/ stream-settle/g, '').replace(/stream-settle /g, '');
    const confronta = (passi) => {
      const contenitore = document.createElement('div');
      const stato = nuovoStatoRender();
      const atteso = document.createElement('div');
      for (const fino of passi) {
        const prefisso = testo.slice(0, fino);
        renderizzaIncrementale(contenitore, stato, prefisso);
        atteso.replaceChildren(renderizzaTutto(prefisso));
        const a = normalizza(contenitore.innerHTML);
        const b = normalizza(atteso.innerHTML);
        if (a !== b) return { fino, prefisso: prefisso.slice(-60), incrementale: a.slice(-400), tuttoInsieme: b.slice(-400) };
      }
      return null;
    };
    const unoAUno = Array.from({ length: testo.length }, (_, i) => i + 1);
    let seme = 7;
    const salti = [];
    for (let i = 0; i < testo.length;) { seme = (seme * 1103515245 + 12345) % 2147483648; i = Math.min(testo.length, i + 1 + (seme % 37)); salti.push(i); }
    return { unoAUno: confronta(unoAUno), aSalti: confronta(salti), passi: unoAUno.length + salti.length };
  }, TESTO_RICCO);
  expect(esito.passi).toBeGreaterThan(TESTO_RICCO.length);
  expect(esito.unoAUno, `a passi di un carattere il DOM diverge: ${JSON.stringify(esito.unoAUno)}`).toBeNull();
  expect(esito.aSalti, `a salti il DOM diverge: ${JSON.stringify(esito.aSalti)}`).toBeNull();
});

/*
 * ⛔⛔ 23/10/2026 sera (revisione avversaria di fbc96a282, F1) — FERMATE E RITARDO SI LEGGONO SU CIÒ CHE SI VEDE.
 * Prima `misura` contava come «testo da mostrare» ogni carattere arrivato e non ancora passato dal contatore `mostrato`, anche quelli
 *   che non si vedono mai. Un `` ` `` o un `**` arrivato per ultimo in un pacchetto lo trattiene la regola dei segni fino al pacchetto
 *   dopo (`markdown-in-arrivo.js`, fino a ~480 ms di buco): per il contatore è un carattere che aspetta, a schermo non manca niente.
 *   Misurato in simulazione su 30 cadenze: FLUIDO-03-CODICE era rosso sul contatore in 11, e nel contratto per l'occhio in 30 su 30
 *   — passava col seme di serie per caso. ⇒ Il ritardo sul carattere grezzo NON è un limite che il codice rispetti: non si misura.
 * L'ORACOLO: per ogni arrivo, fin dove le regole mostrerebbero SUBITO tutto l'arrivato (`confineDiRivelazione(arrivato,
 *   arrivato.length)`, un ritmo infinitamente veloce), disegnato col renderer vero: quella è la lunghezza visibile che lo schermo deve
 *   raggiungere. Fermo = fotogrammi senza crescita visibile mentre ne manca; ritardo = quanto ci mette lo schermo a raggiungerla.
 * ⛔ E L'ORACOLO NON PUÒ GIUDICARE SE STESSO: è lo stesso codice sotto prova. Se `confineDiRivelazione` trattenesse testo vero (la
 *   fermata di 3cf97a30d davanti a «](», 9 s sulla riga col codice in linea), anche l'oracolo lo tratterrebbe e la misura direbbe
 *   «niente da mostrare». ⇒ La guardia: ciò che l'oracolo trattiene dev'essere SOLO una fila di segni in coda (`*`, `_`, `` ` ``,
 *   `~`) — l'unica cosa che la regola dei segni tiene senza che a schermo manchi niente. Provata al contrario: col sorgente di
 *   3cf97a30d la guardia nomina il testo trattenuto e il cancello è rosso.
 */
function oracoloDelVisibile(testo, passi) {
  const prefissi = [];
  const trattenuti = [];
  let fino = 0;
  for (const passo of passi) {
    fino += passo.n;
    const arrivato = testo.slice(0, fino);
    const inizioRiga = arrivato.lastIndexOf('\n', arrivato.length - 1) + 1;
    const scansione = creaScansione();
    avanzaScansione(scansione, arrivato, inizioRiga);
    const p = Math.min(fino, confineDiRivelazione(arrivato, arrivato.length, { dentroFence: scansione.pos === inizioRiga && scansione.dentroFence }));
    prefissi.push(p);
    const resto = arrivato.slice(p);
    if (!/^[*_`~]*$/u.test(resto)) trattenuti.push(resto.slice(0, 40));
  }
  return { prefissi, trattenuti };
}

/*
 * ⛔ 23/10/2026 sera (cura F1/F2, trovato rilanciando i cancelli due volte sullo stesso codice): la prima corsa di `scorri` in una
 *   pagina e la seconda (crudo, poi ritmo) prendevano la base delle `_sequenza` A CASO fra 500000 e 600000. La chat scarta in silenzio
 *   una `_sequenza` già vista (`app.js`, `sequenzeViste`): se le due serie si sovrapponevano — ~586 eventi per corsa, quindi l'1,2%
 *   delle volte — la seconda corsa perdeva pezzi di testo e la prova misurava un testo bucato. Riprodotto forzando la sovrapposizione:
 *   arrivati 314 caratteri su 4.589. Visto dal vivo: FLUIDO-03-LINK rosso una volta su due giri, fermo 700 ms, sullo stesso codice
 *   verde al giro prima. ⇒ La base parte dopo l'ultima sequenza che la pagina ha già visto: mai due corse sugli stessi numeri.
 */
/** Fa scorrere `testo` nella chat con la cadenza `passi` e campiona lo schermo a ogni fotogramma. Con `oracolo` (i prefissi di
    `oracoloDelVisibile`) restituisce anche la lunghezza visibile che ogni arrivo rende dovuta. */
async function scorri(page, { testo, passi, modo, messageId, fine = true, campiona = null, oracolo = null }) {
  return page.evaluate(async ({ testo, passi, modo, messageId, fine, campiona, oracolo }) => {
    const rt = window.__talosHarnessUiRuntime;
    const rs = rt.realSessionState;
    const radice = window.__talosHarnessHost || document.documentElement;
    radice.dataset.talosStreamingAnimation = modo;
    if (!(rs.sequenzeViste instanceof Set)) throw new Error('`realSessionState.sequenzeViste` non è più esposta: la base delle sequenze non si può scegliere');
    let seq = 500000;
    for (const vista of rs.sequenzeViste) if (vista > seq) seq = vista;
    rt.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Domanda di prova', seguito: true }, _sequenza: seq += 1 }, rs.generation);
    const fotogrammi = [];
    const arrivi = [];
    let vivo = true;
    const vietati = campiona ? new Set() : null;
    const tick = () => {
      const copia = rs.messageElements.get(messageId)?.querySelector('.assistant-copy');
      const visibile = copia ? copia.textContent : '';
      fotogrammi.push([performance.now(), (rs.testoGrezzoMessaggi.get(messageId) || '').length, rs.renderIncrementale?.get(messageId)?.mostrato ?? 0, visibile.length]);
      if (vietati) for (const v of campiona) if (visibile.includes(v)) vietati.add(v);
      if (vivo) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    let previsto = performance.now();
    let dato = 0;
    for (const passo of passi) {
      previsto += passo.dopoMs;
      const manca = previsto - performance.now();
      if (manca > 1) await new Promise((ok) => setTimeout(ok, manca));
      const delta = testo.slice(dato, dato + passo.n);
      dato += passo.n;
      arrivi.push([performance.now(), dato]);
      rt.handleRealEvent({ type: 'TextMessageContent', messageId, delta, _sequenza: seq += 1 }, rs.generation);
    }
    const ultimoArrivo = performance.now();
    if (fine) rt.handleRealEvent({ type: 'TextMessageEnd', messageId, _sequenza: seq += 1 }, rs.generation);
    const scadenza = performance.now() + 5000;
    let completo = null;
    while (performance.now() < scadenza) {
      await new Promise((ok) => requestAnimationFrame(ok));
      if ((rs.renderIncrementale?.get(messageId)?.mostrato ?? 0) >= testo.length) { completo = performance.now(); break; }
    }
    await new Promise((ok) => setTimeout(ok, 120));
    vivo = false;
    /* dopo la corsa (così non pesa sul tempo misurato): la lunghezza visibile dovuta a ogni arrivo, col renderer vero e la coda in
       arrivo come la disegna la chat */
    let visibileDovuto = null;
    if (oracolo) {
      const { nuovoStatoRender, renderizzaIncrementale } = rt.streamingPerProve;
      visibileDovuto = oracolo.map((p) => {
        const d = document.createElement('div');
        renderizzaIncrementale(d, nuovoStatoRender(), testo.slice(0, p), { inArrivo: true });
        return d.textContent.length;
      });
    }
    return { fotogrammi, arrivi, ultimoArrivo, completo, vietati: vietati ? [...vietati] : [], visibileDovuto };
  }, { testo, passi, modo, messageId, fine, campiona, oracolo });
}

/** Le misure di una corsa: crescita per fotogramma, fermate con testo VISIBILE da mostrare, ritardo massimo del testo visibile
    (vedi `oracoloDelVisibile`). Senza `visibileDovuto` (le corse che non lo chiedono) si torna al contatore `mostrato`. Il contatore
    resta nel registro (`fermoContatore`, `ritardoContatore`) per confronto, non come limite. */
function misura({ fotogrammi, arrivi, visibileDovuto = null }) {
  const crescite = [];
  let fermo = 0;
  let fermoMax = 0;
  let fermoC = 0;
  let fermoContatore = 0;
  let ia = 0;
  let dovuto = 0;
  const tFine = arrivi.at(-1)[0];
  for (let i = 1; i < fotogrammi.length; i += 1) {
    const [t, arrivato, mostrato, visibile] = fotogrammi[i];
    while (ia < arrivi.length && arrivi[ia][0] <= t) { dovuto = visibileDovuto ? visibileDovuto[ia] : 0; ia += 1; }
    if (fotogrammi[i - 1][3] === 0 || t > tFine) continue;
    const d = visibile - fotogrammi[i - 1][3];
    crescite.push(d);
    const dt = t - fotogrammi[i - 1][0];
    const manca = visibileDovuto ? dovuto > visibile : arrivato > mostrato;
    if (d <= 0 && manca) { fermo += dt; fermoMax = Math.max(fermoMax, fermo); } else fermo = 0;
    if (d <= 0 && arrivato > mostrato) { fermoC += dt; fermoContatore = Math.max(fermoContatore, fermoC); } else fermoC = 0;
  }
  let ritardoMax = 0;
  let ritardoContatore = 0;
  let j = 0;
  let jc = 0;
  arrivi.forEach(([t, fino], i) => {
    const dovutoQui = visibileDovuto ? visibileDovuto[i] : null;
    while (j < fotogrammi.length && (fotogrammi[j][0] < t || (dovutoQui === null ? fotogrammi[j][2] < fino : fotogrammi[j][3] < dovutoQui))) j += 1;
    if (j < fotogrammi.length) ritardoMax = Math.max(ritardoMax, fotogrammi[j][0] - t);
    while (jc < fotogrammi.length && (fotogrammi[jc][0] < t || fotogrammi[jc][2] < fino)) jc += 1;
    if (jc < fotogrammi.length) ritardoContatore = Math.max(ritardoContatore, fotogrammi[jc][0] - t);
  });
  const media = crescite.reduce((s, x) => s + x, 0) / Math.max(1, crescite.length);
  const cv = Math.sqrt(crescite.reduce((s, x) => s + (x - media) ** 2, 0) / Math.max(1, crescite.length)) / Math.max(media, 1e-9);
  const intervalli = fotogrammi.slice(1).map((f, i) => f[0] - fotogrammi[i][0]).sort((a, b) => a - b);
  /* il buco più lungo fra due fotogrammi campionati, dal primo arrivo a poco dopo l'ultimo: se il browser smette di dipingere,
     il ritardo misurato è quel buco e non dice niente sul ritmo (22/10/2026: una corsa a CPU satura ha dato 16 s di «ritardo»
     con passi di 5 caratteri e nessuna fermata prima dell'ultimo arrivo, e non si è più riprodotta in nove corse senza carico) */
  let bucoFotogrammi = 0;
  const tInizio = arrivi[0][0];
  for (let i = 1; i < fotogrammi.length; i += 1) {
    if (fotogrammi[i][0] < tInizio || fotogrammi[i - 1][0] > tFine + 400) continue;
    bucoFotogrammi = Math.max(bucoFotogrammi, fotogrammi[i][0] - fotogrammi[i - 1][0]);
  }
  return { cv, max: Math.max(...crescite), fermoMax, ritardoMax, fermoContatore, ritardoContatore, fotogramma: intervalli[intervalli.length >> 1] || 16.7, bucoFotogrammi };
}

test('STREAMING-FLUIDO-02 — mentre scorre, la sintassi a metà non compare mai (grassetto, collegamento, titolo, tabella, recinto)', async ({ page }) => {
  await apri(page);
  const testo = 'Intro con **grassetto** e `codice` e un [collegamento](https://example.com/pagina) in mezzo.\n\n## Titolo della sezione\n\n- prima voce con *corsivo*\n- seconda voce\n\n| Colonna A | Colonna B |\n|---|---|\n| uno | due |\n| tre | quattro |\n\n```js\nconst x = 1;\n```\n\nFine del testo.';
  const corsa = await scorri(page, { testo, passi: cadenzaRegolare(testo.length, 3, 16), modo: 'typewriter', messageId: 'fluido-02', campiona: ['**', '](', '## ', '|', '```', '[collegamento'] });
  expect(corsa.completo, 'il testo deve completarsi').not.toBeNull();
  expect(corsa.vietati, `a schermo è comparsa la sintassi a metà: ${corsa.vietati.join(' · ')}`).toEqual([]);
});

test('STREAMING-FLUIDO-03 — a pacchetti il testo SCORRE: niente fermate con testo da mostrare, molto più regolare del «mostra tutto», ritardo entro il limite', async ({ page }) => {
  test.setTimeout(90_000);
  await apri(page);
  const parole = 'il modello scrive una risposta lunga con frasi normali e parole di lunghezza diversa, come fa davvero ';
  const testo = Array.from({ length: 30 }, (_, i) => `${parole}${i}.`).join(' ');
  const passi = cadenzaAPacchetti(testo.length);
  const oracolo = oracoloDelVisibile(testo, passi);
  expect(oracolo.trattenuti, `le regole trattengono testo che si vede: ${oracolo.trattenuti.join(' · ')}`).toEqual([]);
  const crudo = misura(await scorri(page, { testo, passi, modo: 'none', messageId: 'fluido-03-crudo', oracolo: oracolo.prefissi }));
  const corsa = await scorri(page, { testo, passi, modo: 'fade', messageId: 'fluido-03-ritmo', oracolo: oracolo.prefissi });
  const ritmo = misura(corsa);
  console.log(`STREAMING-FLUIDO-03 crudo=${JSON.stringify(crudo)} ritmo=${JSON.stringify(ritmo)}`);
  /* prima di tutto: la misura vale solo se il browser ha dipinto per tutto il flusso (un rosso qui è la macchina, non il ritmo) */
  expect(Math.max(crudo.bucoFotogrammi, ritmo.bucoFotogrammi), 'il browser non ha prodotto fotogrammi per questo tempo durante il flusso: misura non valida (macchina sotto carico?)').toBeLessThanOrEqual(150);
  /* il verso contrario: la stessa cadenza mostrata «tutta all'arrivo» è a scatti per questa stessa misura */
  expect(crudo.cv, 'la cadenza di prova deve essere a scatti senza ritmo').toBeGreaterThan(2);
  expect(ritmo.cv, `crescita per fotogramma: CV ${ritmo.cv.toFixed(2)} col ritmo contro ${crudo.cv.toFixed(2)} senza`).toBeLessThan(crudo.cv / 2);
  expect(ritmo.max, `passo più lungo: ${ritmo.max} col ritmo contro ${crudo.max} senza`).toBeLessThanOrEqual(Math.ceil(crudo.max / 2));
  expect(ritmo.fermoMax, `fermo con testo da mostrare per ${ritmo.fermoMax.toFixed(1)} ms`).toBeLessThanOrEqual(60);
  /* il contratto: 260 ms (RITMO_DI_SERIE.ritardoMaxMs) più due fotogrammi di misura */
  expect(ritmo.ritardoMax, `il testo visibile è rimasto indietro ${ritmo.ritardoMax.toFixed(1)} ms`).toBeLessThanOrEqual(260 + 2 * ritmo.fotogramma + 5);
  expect(corsa.completo - corsa.ultimoArrivo, 'a messaggio finito il resto esce entro fineMs (110 ms) e due fotogrammi').toBeLessThanOrEqual(110 + 3 * ritmo.fotogramma + 5);
});

/* 23/10/2026, revisione avversaria del ramo (mutante R1 vivo, «scena mancante»): l'indirizzo di un collegamento non si mostra mai a
   metà e passa IN UN COLPO (`markdown-in-arrivo.js`); il ritmo deve allinearsi a quel salto (`r.allinea`), o ripaga i caratteri già a
   schermo e si ferma dopo ogni collegamento. Owner 23/10: 260 ms di ritardo massimo e 110 ms alla fine sono il contratto. */
test('STREAMING-FLUIDO-03-LINK — a pacchetti, con un collegamento in ogni frase: dopo l\'indirizzo passato in un colpo il testo non si ferma, e il contratto dei 260 ms tiene', async ({ page }) => {
  test.setTimeout(90_000);
  await apri(page);
  const frase = (i) => `il modello cita [la documentazione del modulo ${i}](https://esempio.it/documentazione/del/modulo/con/un/percorso/lungo/${i}) e prosegue con frasi normali `;
  const testo = Array.from({ length: 30 }, (_, i) => `${frase(i)}${i}.`).join(' ');
  const passi = cadenzaAPacchetti(testo.length);
  const oracolo = oracoloDelVisibile(testo, passi);
  expect(oracolo.trattenuti, `le regole trattengono testo che si vede: ${oracolo.trattenuti.join(' · ')}`).toEqual([]);
  const crudo = misura(await scorri(page, { testo, passi, modo: 'none', messageId: 'fluido-03-link-crudo', oracolo: oracolo.prefissi }));
  /* revisione avversaria di 0d2f5a5d4: anche CHE COSA si dipinge — mai l'indirizzo, mai la parentesi di mezzo */
  const corsa = await scorri(page, { testo, passi, modo: 'fade', messageId: 'fluido-03-link', campiona: ['](', 'https://'], oracolo: oracolo.prefissi });
  const ritmo = misura(corsa);
  console.log(`STREAMING-FLUIDO-03-LINK crudo=${JSON.stringify(crudo)} ritmo=${JSON.stringify(ritmo)}`);
  expect(Math.max(crudo.bucoFotogrammi, ritmo.bucoFotogrammi), 'il browser non ha prodotto fotogrammi per questo tempo durante il flusso: misura non valida (macchina sotto carico?)').toBeLessThanOrEqual(150);
  expect(corsa.vietati, `a schermo è comparso l'indirizzo a metà: ${corsa.vietati.join(' · ')}`).toEqual([]);
  /* e la liscezza, come FLUIDO-03 (revisione avversaria: un salto anche sui collegamenti già chiusi passava tutto il resto) */
  expect(ritmo.cv, `crescita per fotogramma: CV ${ritmo.cv.toFixed(2)} col ritmo contro ${crudo.cv.toFixed(2)} senza`).toBeLessThan(crudo.cv / 2);
  expect(ritmo.max, `passo più lungo: ${ritmo.max} col ritmo contro ${crudo.max} senza`).toBeLessThanOrEqual(Math.ceil(crudo.max / 2));
  expect(ritmo.fermoMax, `fermo con testo da mostrare per ${ritmo.fermoMax.toFixed(1)} ms (dopo un collegamento?)`).toBeLessThanOrEqual(60);
  expect(ritmo.ritardoMax, `il testo visibile è rimasto indietro ${ritmo.ritardoMax.toFixed(1)} ms`).toBeLessThanOrEqual(260 + 2 * ritmo.fotogramma + 5);
  expect(corsa.completo - corsa.ultimoArrivo, 'a messaggio finito il resto esce entro fineMs (110 ms) e due fotogrammi').toBeLessThanOrEqual(110 + 3 * ritmo.fotogramma + 5);
});

/* 23/10/2026 sera, revisione avversaria di 0d2f5a5d4: un «](» che NON è un collegamento (dentro un codice in linea) teneva fermo il
   testo visibile 9,25 s su 3cf97a30d, aspettando una «)» che non arriva; e il salto senza condizioni di 0d2f5a5d4 dipingeva segni
   isolati (`**`, `` ` ``) su quelle righe. La riga va al ritmo come le altre.
   Revisione di fbc96a282 (F2): frasi alternate — il «](» del codice seguito da una «)» qualunque («(vedi sotto)»), e seguito da un
   collegamento che sta arrivando. Lì fbc96a282 saltava ancora fino alla «)» o in fondo: passi visibili da 57-63 caratteri, più del
   crudo (simulato su 10 cadenze: rosso in 10). */
test('STREAMING-FLUIDO-03-CODICE — a pacchetti, un «](» dentro un codice in linea non è un collegamento: il testo non si ferma, non salta e non compaiono segni isolati', async ({ page }) => {
  test.setTimeout(90_000);
  await apri(page);
  const frase = (i) => (i % 2
    ? `per unire le liste usa \`a](b\` nel passo ${i}, poi leggi [la guida ${i}](https://esempio.it/guida/${i}) e **ricontrolla il risultato** `
    : `per unire le liste usa \`a](b\` nel passo ${i}, poi **ricontrolla il risultato** (vedi sotto) e prosegue con frasi normali `);
  const testo = Array.from({ length: 30 }, (_, i) => `${frase(i)}${i}.`).join(' ');
  const passi = cadenzaAPacchetti(testo.length);
  const oracolo = oracoloDelVisibile(testo, passi);
  expect(oracolo.trattenuti, `le regole trattengono testo che si vede: ${oracolo.trattenuti.join(' · ')}`).toEqual([]);
  const crudo = misura(await scorri(page, { testo, passi, modo: 'none', messageId: 'fluido-03-codice-crudo', oracolo: oracolo.prefissi }));
  const corsa = await scorri(page, { testo, passi, modo: 'fade', messageId: 'fluido-03-codice', campiona: ['**', '`', 'https://'], oracolo: oracolo.prefissi });
  const ritmo = misura(corsa);
  console.log(`STREAMING-FLUIDO-03-CODICE crudo=${JSON.stringify(crudo)} ritmo=${JSON.stringify(ritmo)}`);
  expect(Math.max(crudo.bucoFotogrammi, ritmo.bucoFotogrammi), 'il browser non ha prodotto fotogrammi per questo tempo durante il flusso: misura non valida (macchina sotto carico?)').toBeLessThanOrEqual(150);
  expect(corsa.completo, 'il testo deve completarsi').not.toBeNull();
  expect(corsa.vietati, `a schermo sono comparsi segni isolati o un indirizzo: ${corsa.vietati.join(' · ')}`).toEqual([]);
  expect(ritmo.fermoMax, `fermo con testo visibile da mostrare per ${ritmo.fermoMax.toFixed(1)} ms`).toBeLessThanOrEqual(60);
  expect(ritmo.cv, `crescita per fotogramma: CV ${ritmo.cv.toFixed(2)} col ritmo contro ${crudo.cv.toFixed(2)} senza`).toBeLessThan(crudo.cv / 2);
  expect(ritmo.max, `passo più lungo: ${ritmo.max} col ritmo contro ${crudo.max} senza`).toBeLessThanOrEqual(Math.ceil(crudo.max / 2));
  expect(ritmo.ritardoMax, `il testo visibile è rimasto indietro ${ritmo.ritardoMax.toFixed(1)} ms`).toBeLessThanOrEqual(260 + 2 * ritmo.fotogramma + 5);
});

/* 23/10/2026 sera, revisione avversaria di fbc96a282 (F2): un collegamento con uno SPAZIO nell'indirizzo non è un collegamento
   (CommonMark 0.31.2 §6.3; il renderer vuole `[^)\s]+`) e alla fine si vede intero. Il salto si ferma allo spazio: oltre, sarebbe un
   salto su testo visibile (mutante N8, simulato: rosso in 10 cadenze su 10); prima, il ritmo spenderebbe tempo su caratteri che la
   coda nasconde finché lo spazio non è a schermo (la proposta 2 senza lo spazio: 67 ms di testo fermo in 2 cadenze su 10). */
test('STREAMING-FLUIDO-03-SPAZIO — a pacchetti, un indirizzo con uno spazio si vede e scorre: nessun salto su testo visibile, nessuna fermata', async ({ page }) => {
  test.setTimeout(90_000);
  await apri(page);
  const frase = (i) => `apri [il rapporto ${i}](C:/I miei documenti/rapporto ${i} del trimestre.md) e prosegue con frasi normali `;
  const testo = Array.from({ length: 30 }, (_, i) => `${frase(i)}${i}.`).join(' ');
  const passi = cadenzaAPacchetti(testo.length);
  const oracolo = oracoloDelVisibile(testo, passi);
  expect(oracolo.trattenuti, `le regole trattengono testo che si vede: ${oracolo.trattenuti.join(' · ')}`).toEqual([]);
  const crudo = misura(await scorri(page, { testo, passi, modo: 'none', messageId: 'fluido-03-spazio-crudo', oracolo: oracolo.prefissi }));
  const corsa = await scorri(page, { testo, passi, modo: 'fade', messageId: 'fluido-03-spazio', oracolo: oracolo.prefissi });
  const ritmo = misura(corsa);
  console.log(`STREAMING-FLUIDO-03-SPAZIO crudo=${JSON.stringify(crudo)} ritmo=${JSON.stringify(ritmo)}`);
  expect(Math.max(crudo.bucoFotogrammi, ritmo.bucoFotogrammi), 'il browser non ha prodotto fotogrammi per questo tempo durante il flusso: misura non valida (macchina sotto carico?)').toBeLessThanOrEqual(150);
  expect(corsa.completo, 'il testo deve completarsi').not.toBeNull();
  expect(ritmo.fermoMax, `fermo con testo visibile da mostrare per ${ritmo.fermoMax.toFixed(1)} ms`).toBeLessThanOrEqual(60);
  expect(ritmo.cv, `crescita per fotogramma: CV ${ritmo.cv.toFixed(2)} col ritmo contro ${crudo.cv.toFixed(2)} senza`).toBeLessThan(crudo.cv / 2);
  expect(ritmo.max, `passo più lungo: ${ritmo.max} col ritmo contro ${crudo.max} senza`).toBeLessThanOrEqual(Math.ceil(crudo.max / 2));
  expect(ritmo.ritardoMax, `il testo visibile è rimasto indietro ${ritmo.ritardoMax.toFixed(1)} ms`).toBeLessThanOrEqual(260 + 2 * ritmo.fotogramma + 5);
  expect(corsa.completo - corsa.ultimoArrivo, 'a messaggio finito il resto esce entro fineMs (110 ms) e due fotogrammi').toBeLessThanOrEqual(110 + 3 * ritmo.fotogramma + 5);
});

test('STREAMING-FLUIDO-04 — «Riduci il movimento» dell\'app e la storia restano istantanei; una finestra nascosta riceve tutto', async ({ page }) => {
  await apri(page);
  const esito = await page.evaluate(async () => {
    const rt = window.__talosHarnessUiRuntime;
    const rs = rt.realSessionState;
    const radice = window.__talosHarnessHost || document.documentElement;
    radice.dataset.talosStreamingAnimation = 'fade';
    const fotogramma = () => new Promise((ok) => requestAnimationFrame(() => ok()));
    const testoDi = (id) => rs.messageElements.get(id)?.querySelector('.assistant-copy')?.textContent || '';
    let seq = 700000;
    rt.handleRealEvent({ type: 'RunStarted', input: { consegna: 'x', seguito: true }, _sequenza: seq += 1 }, rs.generation);
    /* movimento ridotto dell'app: il testo intero al primo fotogramma */
    document.body.classList.add('reduce-motion');
    rt.handleRealEvent({ type: 'TextMessageContent', messageId: 'ridotto', delta: 'Testo intero subito, senza ritmo, con movimento ridotto.', _sequenza: seq += 1 }, rs.generation);
    await fotogramma(); await fotogramma();
    const ridotto = testoDi('ridotto');
    document.body.classList.remove('reduce-motion');
    /* finestra nascosta: niente fotogrammi, il testo arriva lo stesso */
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    let nascosto = '';
    try {
      rt.handleRealEvent({ type: 'TextMessageContent', messageId: 'nascosto', delta: 'Testo completo in una finestra nascosta, consegnato senza fotogrammi.', _sequenza: seq += 1 }, rs.generation);
      await new Promise((ok) => setTimeout(ok, 120));
      nascosto = testoDi('nascosto');
    } finally { delete document.visibilityState; }
    /* la storia rigiocata: istantanea */
    rs.deferHistoricalRendering = true;
    rt.handleRealEvent({ type: 'TextMessageContent', messageId: 'storia', delta: 'Testo della storia, disegnato tutto alla sua fine.', _sequenza: seq += 1 }, rs.generation);
    rt.handleRealEvent({ type: 'TextMessageEnd', messageId: 'storia', _sequenza: seq += 1 }, rs.generation);
    const storia = testoDi('storia');
    rs.deferHistoricalRendering = false;
    return { ridotto, nascosto, storia };
  });
  expect(esito.ridotto).toBe('Testo intero subito, senza ritmo, con movimento ridotto.');
  expect(esito.nascosto).toBe('Testo completo in una finestra nascosta, consegnato senza fotogrammi.');
  expect(esito.storia).toBe('Testo della storia, disegnato tutto alla sua fine.');
});

test('STREAMING-FLUIDO-05 — il recinto aperto e la tabella crescono SUL POSTO: gli stessi nodi da un fotogramma all\'altro', async ({ page }) => {
  await apri(page);
  const esito = await page.evaluate(async () => {
    const rt = window.__talosHarnessUiRuntime;
    const rs = rt.realSessionState;
    (window.__talosHarnessHost || document.documentElement).dataset.talosStreamingAnimation = 'typewriter';
    const fotogramma = () => new Promise((ok) => requestAnimationFrame(() => ok()));
    let seq = 800000;
    rt.handleRealEvent({ type: 'RunStarted', input: { consegna: 'x', seguito: true }, _sequenza: seq += 1 }, rs.generation);
    const id = 'sul-posto';
    const invia = (delta) => rt.handleRealEvent({ type: 'TextMessageContent', messageId: id, delta, _sequenza: seq += 1 }, rs.generation);
    const copia = () => rs.messageElements.get(id)?.querySelector('.assistant-copy');
    const attendiInPari = async () => { for (let i = 0; i < 400; i += 1) { await fotogramma(); if ((rs.renderIncrementale.get(id)?.mostrato ?? 0) >= (rs.testoGrezzoMessaggi.get(id) || '').length) return; } };
    invia('Prima il codice:\n\n```js\n');
    for (let i = 0; i < 6; i += 1) invia(`const riga${i} = ${i};\n`);
    await attendiInPari();
    const code = copia().querySelector('.code-block code');
    const testoCodice = code?.firstChild;
    for (let i = 6; i < 40; i += 1) { invia(`const riga${i} = ${i};\n`); await fotogramma(); }
    await attendiInPari();
    const recinto = { stessoCode: copia().querySelector('.code-block code') === code, stessoTesto: code?.firstChild === testoCodice, righe: (code?.textContent.match(/\n/g) || []).length };
    invia('```\n\n| a | b |\n|---|---|\n');
    for (let i = 0; i < 4; i += 1) invia(`| ${i} | ${i * 2} |\n`);
    await attendiInPari();
    const primaRiga = copia().querySelector('.md-table tbody tr');
    const tbody = copia().querySelector('.md-table tbody');
    for (let i = 4; i < 30; i += 1) { invia(`| ${i} | ${i * 2} |\n`); await fotogramma(); }
    await attendiInPari();
    const tabella = { stessaPrimaRiga: copia().querySelector('.md-table tbody tr') === primaRiga, stessoTbody: copia().querySelector('.md-table tbody') === tbody, righe: copia().querySelectorAll('.md-table tbody tr').length };
    rt.handleRealEvent({ type: 'TextMessageEnd', messageId: id, _sequenza: seq += 1 }, rs.generation);
    return { recinto, tabella };
  });
  expect(esito.recinto.righe).toBe(40);
  expect(esito.recinto.stessoCode, 'il blocco di codice aperto è rinato invece di crescere').toBe(true);
  expect(esito.recinto.stessoTesto, 'il codice si accoda allo stesso nodo di testo').toBe(true);
  expect(esito.tabella.righe).toBe(30);
  expect(esito.tabella.stessoTbody, 'la tabella è rinata invece di crescere').toBe(true);
  expect(esito.tabella.stessaPrimaRiga, 'le righe complete restano le stesse').toBe(true);
});

test('STREAMING-FLUIDO-06 — conversazione lunga: turni chiusi fuori impaginazione, e niente riscritto a vuoto mentre il testo scorre', async ({ page }) => {
  test.setTimeout(90_000);
  await apri(page);
  const esito = await page.evaluate(async () => {
    const rt = window.__talosHarnessUiRuntime;
    const rs = rt.realSessionState;
    const radice = window.__talosHarnessHost || document.documentElement;
    radice.dataset.talosStreamingAnimation = 'none';
    let seq = 900000;
    for (let t = 0; t < 120; t += 1) {
      rt.handleRealEvent({ type: 'RunStarted', input: { consegna: `Domanda ${t}`, seguito: true }, _sequenza: seq += 1 }, rs.generation);
      rt.handleRealEvent({ type: 'TextMessageContent', messageId: `vivo-${t}`, delta: `Risposta ${t} con **forza**.\n\n| a | b |\n|---|---|\n| ${t} | ${t + 1} |\n`, _sequenza: seq += 1 }, rs.generation);
      rt.handleRealEvent({ type: 'TextMessageEnd', messageId: `vivo-${t}`, _sequenza: seq += 1 }, rs.generation);
      rt.handleRealEvent({ type: 'RunFinished', outcome: { type: 'success' }, _sequenza: seq += 1 }, rs.generation);
    }
    await new Promise((ok) => setTimeout(ok, 600));
    const turni = [...document.querySelectorAll('#conversation > .talos-turn')];
    const cv = turni.map((t) => getComputedStyle(t).contentVisibility);
    radice.dataset.talosStreamingAnimation = 'fade';
    rt.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Ultima domanda', seguito: true }, _sequenza: seq += 1 }, rs.generation);
    await new Promise((ok) => setTimeout(ok, 300));
    /* da qui si contano le scritture fuori dal messaggio che scorre, e le LETTURE di geometria e di ricerca nel DOM: una lettura
       per turno a ogni fotogramma (il segnavia prima del 22/10) è lavoro che cresce con la conversazione */
    const fuori = [];
    const spia = new MutationObserver((lista) => {
      for (const r of lista) {
        const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (t?.closest?.('.talos-message__copy.is-streaming, .talos-message__copy:last-of-type')) continue;
        if (r.type === 'attributes' && r.attributeName === 'style' && t?.closest?.('.talos-conversation')) continue; // la riserva in coda
        fuori.push(`${t?.id ? `#${t.id}` : `${t?.tagName}.${String(t?.className || '').split(' ')[0]}`}@${r.attributeName || r.type}`);
      }
    });
    spia.observe(document.body, { attributes: true, childList: true, subtree: true, characterData: true });
    const letture = { rettangoli: 0, ricerche: 0, fotogrammi: 0 };
    const rettangolo = Element.prototype.getBoundingClientRect;
    const ricercaTutti = Element.prototype.querySelectorAll;
    Element.prototype.getBoundingClientRect = function conta(...a) { letture.rettangoli += 1; return rettangolo.apply(this, a); };
    Element.prototype.querySelectorAll = function conta(...a) { letture.ricerche += 1; return ricercaTutti.apply(this, a); };
    let contaFotogrammi = true;
    const fotogrammi = () => { if (!contaFotogrammi) return; letture.fotogrammi += 1; requestAnimationFrame(fotogrammi); };
    requestAnimationFrame(fotogrammi);
    const id = 'lungo-vivo';
    const testo = 'Una risposta normale che scorre mentre la conversazione è lunga, con parole e frasi che arrivano a pacchetti. '.repeat(8);
    for (let i = 0; i < testo.length; i += 30) {
      rt.handleRealEvent({ type: 'TextMessageContent', messageId: id, delta: testo.slice(i, i + 30), _sequenza: seq += 1 }, rs.generation);
      await new Promise((ok) => setTimeout(ok, 60));
    }
    await new Promise((ok) => setTimeout(ok, 400));
    contaFotogrammi = false;
    Element.prototype.getBoundingClientRect = rettangolo;
    Element.prototype.querySelectorAll = ricercaTutti;
    spia.disconnect();
    const conti = {};
    for (const f of fuori) conti[f] = (conti[f] || 0) + 1;
    return { turni: turni.length, chiusiVirtuali: cv.slice(0, -4).every((v) => v === 'auto'), codaViva: cv.slice(-4).every((v) => v !== 'auto'), scritture: fuori.length, conti, letture };
  });
  console.log(`STREAMING-FLUIDO-06 ${JSON.stringify(esito)}`);
  expect(esito.turni).toBeGreaterThan(200);
  expect(esito.chiusiVirtuali, 'i turni chiusi devono avere content-visibility:auto').toBe(true);
  expect(esito.codaViva, 'gli ultimi quattro restano sempre impaginati (la coda viva)').toBe(true);
  /* ~25 delta in 1,6 s: un riscritto a vuoto per fotogramma ne darebbe centinaia */
  expect(esito.scritture, `scritture fuori dal messaggio mentre scorre: ${JSON.stringify(esito.conti)}`).toBeLessThanOrEqual(30);
  /* letture per fotogramma: con 240 turni, una lettura per turno ne darebbe centinaia a fotogramma */
  const perFotogramma = (esito.letture.rettangoli + esito.letture.ricerche) / Math.max(1, esito.letture.fotogrammi);
  expect(perFotogramma, `letture di geometria e ricerche nel DOM per fotogramma: ${perFotogramma.toFixed(1)} (${JSON.stringify(esito.letture)})`).toBeLessThan(25);
});

test('STREAMING-FLUIDO-07 — all\'avvio vale la scelta delle Impostazioni («Dissolvenza» di serie): nessuno forza più il testo crudo', async ({ page }) => {
  await apri(page);
  const esito = await page.evaluate(async () => {
    const rt = window.__talosHarnessUiRuntime;
    const rs = rt.realSessionState;
    const radice = window.__talosHarnessHost || document.documentElement;
    /* niente si tocca prima di leggere: è la modalità che la persona trova aprendo l'app con le preferenze di serie */
    const modo = radice.dataset.talosStreamingAnimation;
    const fotogramma = () => new Promise((ok) => requestAnimationFrame(() => ok()));
    let seq = 950000;
    rt.handleRealEvent({ type: 'RunStarted', input: { consegna: 'x', seguito: true }, _sequenza: seq += 1 }, rs.generation);
    const testo = 'Un pacchetto grande che arriva tutto insieme e deve srotolarsi col ritmo, non comparire in un colpo. '.repeat(6);
    rt.handleRealEvent({ type: 'TextMessageContent', messageId: 'avvio', delta: testo, _sequenza: seq += 1 }, rs.generation);
    await fotogramma(); await fotogramma();
    const dopoDue = rs.renderIncrementale.get('avvio')?.mostrato ?? 0;
    await new Promise((ok) => setTimeout(ok, 600));
    const dopo600 = rs.renderIncrementale.get('avvio')?.mostrato ?? 0;
    return { modo, lunghezza: testo.length, dopoDue, dopo600 };
  });
  expect(esito.modo, 'la modalità a schermo dopo l\'avvio è la preferenza di serie, non «none» forzato').toBe('fade');
  expect(esito.dopoDue, 'col ritmo acceso un pacchetto grande non esce tutto in due fotogrammi').toBeLessThan(esito.lunghezza);
  expect(esito.dopoDue, 'ma comincia subito').toBeGreaterThan(0);
  expect(esito.dopo600, 'ed è tutto a schermo entro il ritardo massimo (260 ms) con margine').toBe(esito.lunghezza);
});

test('STREAMING-FLUIDO-08 — un turno montato fuori vista si salta solo dopo il suo primo disegno: lo scorrimento non cambia sotto chi lo segue', async ({ page }) => {
  await apri(page);
  const esito = await page.evaluate(async () => {
    const conversation = document.querySelector('#conversation');
    const scroller = conversation.closest('.talos-conversation');
    const fotogramma = () => new Promise((ok) => requestAnimationFrame(() => ok()));
    /* quaranta turni piccoli montati in un colpo con la vista in cima: quasi tutti nascono FUORI vista, come la storia
       rigiocata di una sessione riaperta */
    scroller.scrollTop = 0;
    for (let i = 0; i < 40; i += 1) {
      const turno = document.createElement('article');
      turno.className = 'talos-turn';
      turno.style.minHeight = '90px';
      const messaggio = document.createElement('div');
      messaggio.className = 'talos-message';
      messaggio.textContent = `Turno montato fuori vista ${i}`;
      turno.appendChild(messaggio);
      conversation.appendChild(turno);
    }
    for (let f = 0; f < 4; f += 1) await fotogramma();
    /* poi la vista va in fondo, dove entrano turni mai visti: se fossero stati saltati con l'altezza di stima (360 px), entrando
       in vista si accorcerebbero e lo scorrimento calerebbe sotto chi lo segue */
    scroller.scrollTop = scroller.scrollHeight;
    const altezze = [];
    for (let f = 0; f < 12; f += 1) { await fotogramma(); altezze.push(scroller.scrollHeight); }
    const turni = [...conversation.querySelectorAll(':scope > .talos-turn')];
    return {
      totali: turni.length,
      segnati: turni.filter((t) => t.hasAttribute('data-disegnato')).length,
      cvPrimo: getComputedStyle(turni[0]).contentVisibility,
      cvUltimo: getComputedStyle(turni.at(-1)).contentVisibility,
      variazione: Math.max(...altezze) - Math.min(...altezze),
    };
  });
  expect(esito.segnati, 'ogni turno disegnato una volta riceve il segno').toBe(esito.totali);
  expect(esito.cvPrimo, 'e i turni chiusi si saltano fuori vista').toBe('auto');
  expect(esito.cvUltimo, 'la coda viva no').not.toBe('auto');
  expect(esito.variazione, `lo scorrimento è cambiato di ${esito.variazione} px mentre i turni entravano in vista`).toBeLessThanOrEqual(2);
});

test('STREAMING-FLUIDO-09 — in «Dissolvenza» il codice in linea entra con le sue parole, non a piena intensità', async ({ page }) => {
  await apri(page);
  const esito = await page.evaluate(async () => {
    const rt = window.__talosHarnessUiRuntime;
    const rs = rt.realSessionState;
    (window.__talosHarnessHost || document.documentElement).dataset.talosStreamingAnimation = 'fade';
    let seq = 980000;
    rt.handleRealEvent({ type: 'RunStarted', input: { consegna: 'x', seguito: true }, _sequenza: seq += 1 }, rs.generation);
    const id = 'codice-in-linea';
    rt.handleRealEvent({ type: 'TextMessageContent', messageId: id, delta: 'Per controllare il progetto si lancia ', _sequenza: seq += 1 }, rs.generation);
    await new Promise((ok) => setTimeout(ok, 400));
    rt.handleRealEvent({ type: 'TextMessageContent', messageId: id, delta: '`npm test` e poi si legge il risultato con calma.', _sequenza: seq += 1 }, rs.generation);
    /* il primo fotogramma in cui il chip è a schermo: deve star ENTRANDO (animazione viva), come le parole intorno */
    const limite = performance.now() + 1000;
    let visto = null;
    while (performance.now() < limite) {
      await new Promise((ok) => requestAnimationFrame(() => ok()));
      const codice = rs.messageElements.get(id)?.querySelector('.assistant-copy code');
      if (codice && codice.textContent.length > 0) {
        visto = { classe: codice.classList.contains('stream-code'), animazioni: codice.getAnimations().map((a) => a.animationName || ''), testo: codice.textContent };
        break;
      }
    }
    return visto;
  });
  expect(esito, 'il codice in linea non è mai comparso').not.toBeNull();
  expect(esito.classe, `il chip «${esito?.testo}» non è marcato come in arrivo`).toBe(true);
  expect(esito.animazioni, 'il chip deve entrare con la sua dissolvenza').toContain('talos-codice-arriva');
});
