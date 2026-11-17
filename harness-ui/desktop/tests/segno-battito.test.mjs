/*
 * Giro 5 della bolla (decisione dell'owner 14/11/2026 08:18, giudice v1838-v1839; ROSSO del controllore dopo il giro 4, punto 3): il battito della pagina del segno.
 *   Prima «pronta» voleva dire solo HTTP 200 su `did-navigate` e `acceso()` era vero ancora prima del caricamento: con una pagina 200 il cui script manca, si rompe
 *   o non disegna, o con una pagina bloccata, il server teneva l'aiutante con `--no-overlay` e sullo schermo non c'era NESSUN cursore fino al riavvio.
 *   Ora la pagina manda un battito (`window.open('talos-segno:battito')`, la porta senza ponte del ripiego) solo DOPO aver disegnato, e poi a intervalli;
 *   `acceso()` è vero solo dopo il primo battito di OGNI schermo; senza battito per `msSenzaBattito`, su `unresponsive` o su `render-process-gone` il segno si
 *   spegne e il server lo sa (l'aiutante riaccende il suo cursore al confine del passo). Il segno si MOSTRA solo se in più nessun aiutante gira col suo
 *   cursore (`aiutante(conCursore)`, detto dal server): mai due cursori.
 *   Fonti: Hermes `apps/desktop/electron/hud-close.ts:7-12` (l'evento `unresponsive` di Electron dopo 5 s, «nobody acts on»: noi sì) e
 *   `apps/desktop/electron/main.ts:12294-12300` del clone 2026-10-22 (`ready-to-show` si può perdere: la pagina che «finisce di caricare» non basta).
 *   Electron, `web-preferences.md`: con `backgroundThrottling: false` la finestra nascosta continua a disegnare fotogrammi (il battito parte anche da nascosta).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as modulo from '../segno-finestra.mjs';
import * as messaggiDellaPagina from '../../frontend/src/components/computer-use/bolla-messaggi.js';
import { BASE, BATTITO, PRINCIPALE, SECONDO, finti, prossimoGiro, aspetta, vivi } from './fixtures/segno-finestre-finte.mjs';

const { creaSegnoFinestre } = modulo;
const visibili = (f) => vivi(f).map((w) => w.visibile);
/** Un segno acceso con le sue notizie al server; `ms` piccoli perché la prova non aspetti i numeri veri. */
function segnoCon(f, opzioni = {}) {
  const notizie = [];
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false, ritardoRicostruisci: 5, msPaginaPronta: 400, msSenzaBattito: 60, quandoCambia: (a) => notizie.push(a), ...opzioni });
  return { segno, notizie };
}
/** Le pagine arrivano con 200 e battono una volta ciascuna. */
const caricaEBatti = (f) => { for (const w of vivi(f)) w.carica(200); for (const w of vivi(f)) w.batti(); };

test('BATTITO-01 i numeri: la pagina e il guscio usano lo stesso indirizzo e lo stesso ritmo; il termine sta sotto un passo del compito e lascia più battiti persi', () => {
  assert.equal(modulo.INDIRIZZO_BATTITO, BATTITO, 'il guscio');
  assert.equal(messaggiDellaPagina.INDIRIZZO_BATTITO, BATTITO, 'la pagina');
  assert.notEqual(BATTITO, modulo.INDIRIZZO_RIPIEGO);
  assert.equal(typeof modulo.MS_BATTITO, 'number');
  assert.equal(messaggiDellaPagina.MS_BATTITO, modulo.MS_BATTITO, 'lo stesso ritmo dalle due parti');
  /* un passo del computer use dura almeno una foto dello schermo, una risposta del modello e il volo del cursore (250-850 ms): i tetti del ciclo sono 20 passi
     in 120 s (6 s a passo, `ciclo.mjs`), e la revisione del 10/11 ha misurato 8 s a passo. Il termine resta sotto i 3 s, e lascia almeno 3 battiti persi
     (una pausa del renderer o del raccoglitore non spegne il segno) */
  assert.ok(modulo.MS_SENZA_BATTITO <= 3000, `termine ${modulo.MS_SENZA_BATTITO} ms`);
  assert.ok(modulo.MS_SENZA_BATTITO >= 3 * modulo.MS_BATTITO, `termine ${modulo.MS_SENZA_BATTITO} ms per un battito ogni ${modulo.MS_BATTITO} ms`);
  /* il termine della prima pagina (giro 4) resta il più largo: è il tempo dell'avvio a freddo, non della pagina viva */
  assert.ok(modulo.MS_PAGINA_PRONTA > modulo.MS_SENZA_BATTITO);
});

test('BATTITO-02 acceso() è vero solo dopo il primo battito di OGNI schermo: prima del caricamento, a pagina arrivata con 200 e con uno schermo solo, è falso e non si vede niente', async () => {
  const f = finti();
  const { segno, notizie } = segnoCon(f);
  assert.equal(segno.acceso(), false, 'prima delle finestre: il server parte col cursore dell aiutante (main.mjs passa acceso() a creaAvvioFiglio)');
  await segno.aggiorna(BASE, 1);
  assert.equal(segno.acceso(), false, 'pagine chieste, non arrivate');
  for (const w of f.finestre) w.carica(200);
  assert.equal(segno.acceso(), false, 'HTTP 200 e did-finish-load non bastano: la pagina non ha ancora detto di aver disegnato');
  assert.deepEqual(visibili(f), [false, false], 'nessuna finestra si mostra al solo caricamento');
  f.finestre[0].batti();
  assert.equal(segno.acceso(), false, 'un battito su due schermi: sull altro non c è il cursore di TALOS');
  assert.deepEqual(visibili(f), [false, false]);
  f.finestre[1].batti();
  assert.equal(segno.acceso(), true, 'ogni schermo ha battuto');
  assert.deepEqual(visibili(f), [true, true], 'si mostrano insieme, col segno acceso');
  assert.deepEqual(notizie, [true], 'il server lo sa una volta: l aiutante che parte dopo spegne il suo cursore');
  for (const w of f.finestre) assert.equal(w.ordine.some(([n]) => n === 'show'), false, 'mai show(), che dà il fuoco');
  segno.chiudi();
  assert.deepEqual(notizie, [true, false]);
});

test('BATTITO-03 pagina arrivata con 200 il cui script manca, si rompe o non disegna (nessun battito): mai acceso, mai mostrata, il server non lo sente mai acceso', async () => {
  const f = finti();
  const { segno, notizie } = segnoCon(f, { msPaginaPronta: 40 });
  await segno.aggiorna(BASE, 1);
  for (const w of f.finestre) w.carica(200);
  await aspetta(20);
  assert.deepEqual([segno.acceso(), visibili(f), notizie], [false, [false, false], []], 'prima del termine della pagina: il cursore dell aiutante');
  await aspetta(60);
  assert.equal(segno.acceso(), false);
  assert.match(f.righe.join('\n'), /pagina/u, 'il guscio scrive perché il segno non c è');
  /* un battito arrivato dopo il termine della prima pagina non lo accende: è spento per l avvio, come una pagina mancata (giro 4) */
  for (const w of f.finestre) if (!w.distrutta) w.batti();
  await prossimoGiro();
  assert.deepEqual([segno.acceso(), notizie], [false, []]);
  assert.deepEqual(f.finestre.map((w) => w.visibile), [false, false]);
  segno.chiudi();
  assert.deepEqual(notizie, [], 'mai visto, mai una notizia');
});

test('BATTITO-04 pagina bloccata (i battiti smettono): entro il termine il segno si nasconde, acceso() falso, il server lo sa una volta; battiti regolari invece lo tengono', async () => {
  const f = finti();
  const { segno, notizie } = segnoCon(f, { msSenzaBattito: 60 });
  await segno.aggiorna(BASE, 1);
  caricaEBatti(f);
  for (let i = 0; i < 5; i++) { await aspetta(25); for (const w of f.finestre) w.batti(); }
  assert.deepEqual([segno.acceso(), visibili(f), notizie], [true, [true, true], [true]], 'battiti ogni 25 ms con termine 60: resta acceso');
  /* uno schermo solo si blocca: anche l altro si spegne (il cursore dell aiutante vale per tutti gli schermi) */
  for (let i = 0; i < 4; i++) { await aspetta(25); f.finestre[1].batti(); }
  assert.equal(segno.acceso(), false, 'la pagina del primo schermo non batte da più del termine');
  assert.deepEqual(visibili(f), [false, false], 'nascoste tutte e due');
  assert.deepEqual(notizie, [true, false], 'una notizia: l aiutante riaccende il suo cursore al confine del passo');
  assert.match(f.righe.join('\n'), /batt/u);
  segno.chiudi();
  assert.deepEqual(notizie, [true, false], 'la chiusura non ripete');
});

test('BATTITO-05 pagina bloccata detta da Electron (`unresponsive`): spenta SUBITO, senza aspettare il termine; il battito che riprende la riaccende', async () => {
  const f = finti();
  const { segno, notizie } = segnoCon(f, { msSenzaBattito: 60_000 });
  await segno.aggiorna(BASE, 1);
  caricaEBatti(f);
  assert.equal(segno.acceso(), true);
  f.finestre[0].emetti('unresponsive');
  assert.deepEqual([segno.acceso(), visibili(f), notizie], [false, [false, false], [true, false]], 'nello stesso giro, con un termine di un minuto');
  assert.match(f.righe.join('\n'), /risponde/u);
  /* la pagina si sblocca: Electron dice `responsive`, poi il battito torna */
  f.finestre[0].emetti('responsive');
  assert.equal(segno.acceso(), false, '`responsive` da solo non basta: serve il battito, cioè il disegno');
  f.finestre[0].batti();
  assert.deepEqual([segno.acceso(), visibili(f), notizie], [true, [true, true], [true, false, true]]);
  segno.chiudi();
});

test('BATTITO-06 processo della pagina morto (`render-process-gone`) a segno acceso: spento subito e per tutto l avvio; i battiti dopo non contano', async () => {
  const f = finti();
  const { segno, notizie } = segnoCon(f, { msSenzaBattito: 60_000 });
  await segno.aggiorna(BASE, 1);
  caricaEBatti(f);
  f.finestre[1].emettiContenuto('render-process-gone', {}, { reason: 'crashed', exitCode: -1 });
  assert.deepEqual([segno.acceso(), f.finestre.map((w) => w.visibile), notizie], [false, [false, false], [true, false]]);
  for (const w of f.finestre) w.batti();
  await prossimoGiro();
  for (const w of f.finestre) w.batti();
  assert.deepEqual([segno.acceso(), notizie], [false, [true, false]]);
  assert.equal(vivi(f).length, 0, 'le finestre si chiudono');
  segno.chiudi();
});

test('BATTITO-07 AL CONTRARIO: un battito che non viene da una pagina del segno arrivata con 200 non conta (prima di did-navigate, dopo un 404, finestra chiusa)', async () => {
  const f = finti();
  const { segno, notizie } = segnoCon(f);
  await segno.aggiorna(BASE, 1);
  for (const w of f.finestre) w.batti(); // la navigazione non è ancora arrivata
  assert.equal(segno.acceso(), false, 'prima di did-navigate');
  for (const w of f.finestre) w.carica(200);
  assert.equal(segno.acceso(), false, 'i battiti di prima non valgono per la pagina nuova');
  segno.aiutante(false); // un ricalcolo qualunque (il server dice del suo aiutante)
  assert.equal(segno.acceso(), false, 'nemmeno quando lo stato si ricalcola');
  for (const w of f.finestre) w.batti();
  assert.equal(segno.acceso(), true);
  /* un indirizzo simile non è un battito */
  const g = finti();
  const s2 = segnoCon(g);
  await s2.segno.aggiorna(BASE, 1);
  for (const w of g.finestre) { w.carica(200); w.apertura({ url: `${BATTITO}?x` }); w.apertura({ url: 'talos-segno:battit' }); }
  assert.equal(s2.segno.acceso(), false);
  for (const w of g.finestre) assert.deepEqual(w.batti(), { action: 'deny' }, 'il battito si nega come ogni window.open');
  assert.equal(s2.segno.acceso(), true);
  s2.segno.chiudi();
  segno.chiudi();
  assert.deepEqual(notizie, [true, false]);
});

test('BATTITO-08 mai due cursori: il segno acceso non si mostra finché un aiutante gira col suo cursore; si mostra quando quell aiutante si chiude', async () => {
  const f = finti();
  const { segno, notizie } = segnoCon(f);
  assert.equal(typeof segno.aiutante, 'function', 'il server dice al guscio quando un aiutante gira col suo cursore');
  segno.aiutante(true); // un compito partito subito dopo l avvio, prima del primo battito: l aiutante ha il suo cursore
  await segno.aggiorna(BASE, 1);
  caricaEBatti(f);
  assert.equal(segno.acceso(), true, 'le pagine battono: il prossimo aiutante parte senza il suo cursore');
  assert.deepEqual(notizie, [true]);
  assert.deepEqual(visibili(f), [false, false], 'ma l aiutante di adesso ha il suo cursore: il segno resta nascosto, un cursore solo');
  for (let i = 0; i < 3; i++) { await aspetta(20); for (const w of f.finestre) w.batti(); }
  assert.deepEqual(visibili(f), [false, false], 'i battiti non lo mostrano');
  segno.aiutante(false); // l aiutante col cursore si è chiuso (fine compito e riposo)
  assert.deepEqual(visibili(f), [true, true], 'ora il cursore di TALOS è il solo');
  /* AL CONTRARIO: con un aiutante col cursore che riparte (il segno si era spento a metà), il segno si nasconde di nuovo */
  segno.aiutante(true);
  assert.deepEqual(visibili(f), [false, false]);
  assert.equal(segno.acceso(), true, 'acceso resta: dice al server come far partire il PROSSIMO aiutante');
  segno.chiudi();
});

test('BATTITO-09 il segno spento che torna: senza battito si spegne, il battito che riprende lo riaccende, ma si vede solo dopo che l aiutante col cursore si è chiuso', async () => {
  const f = finti();
  const { segno, notizie } = segnoCon(f, { msSenzaBattito: 50 });
  await segno.aggiorna(BASE, 1);
  caricaEBatti(f);
  assert.deepEqual(visibili(f), [true, true]);
  await aspetta(90); // la pagina si è fermata
  assert.deepEqual([segno.acceso(), visibili(f), notizie], [false, [false, false], [true, false]]);
  segno.aiutante(true); // il server ha riaperto l aiutante col suo cursore
  for (const w of f.finestre) w.batti(); // la pagina riparte
  assert.deepEqual([segno.acceso(), notizie], [true, [true, false, true]], 'acceso di nuovo');
  assert.deepEqual(visibili(f), [false, false], 'non si vede: due cursori');
  segno.aiutante(false);
  assert.deepEqual(visibili(f), [true, true]);
  segno.chiudi();
});

test('BATTITO-10 server ripartito e cambio di schermi a segno acceso: spento finché le pagine nuove non battono; la scadenza vecchia non giudica la nuova', async () => {
  const f = finti();
  const { segno, notizie } = segnoCon(f, { msSenzaBattito: 40 });
  await segno.aggiorna(BASE, 1);
  caricaEBatti(f);
  await segno.aggiorna('http://127.0.0.1:51300', 2);
  assert.deepEqual([segno.acceso(), visibili(f), notizie], [false, [false, false], [true, false]], 'ricarica: la pagina vecchia non c è più');
  await aspetta(60); // oltre il termine del battito vecchio
  for (const w of f.finestre) w.carica(200);
  segno.aiutante(false); // un ricalcolo: la pagina nuova è arrivata ma non ha battuto, il battito della vecchia non vale
  assert.deepEqual([segno.acceso(), notizie], [false, [true, false]], 'arrivata, non ancora battuta');
  caricaEBatti(f);
  assert.deepEqual([segno.acceso(), notizie], [true, [true, false, true]]);
  /* cambio di schermi: finestre nuove, spento finché non battono */
  f.emettiSchermo('display-metrics-changed', PRINCIPALE, ['scaleFactor']);
  await aspetta(20);
  assert.equal(segno.acceso(), false);
  assert.deepEqual(notizie, [true, false, true, false]);
  caricaEBatti(f);
  assert.deepEqual([segno.acceso(), visibili(f)], [true, [true, true]]);
  segno.chiudi();
  assert.deepEqual(notizie, [true, false, true, false, true, false]);
});

test('BATTITO-11 (c) protezione rifiutata a metà, sul cambio di schermi col segno acceso: il server lo sa una volta, e nessun battito lo riaccende', async () => {
  let tiene = true;
  const f = finti({ protezioneTiene: () => tiene });
  const { segno, notizie } = segnoCon(f);
  await segno.aggiorna(BASE, 1);
  caricaEBatti(f);
  assert.equal(segno.acceso(), true);
  tiene = false;
  f.schermi.push({ ...SECONDO, id: 3, bounds: { ...SECONDO.bounds, x: 3200 } });
  f.emettiSchermo('display-added', f.schermi[2]);
  await aspetta(20);
  assert.deepEqual([segno.acceso(), vivi(f).length, notizie], [false, 0, [true, false]]);
  for (const w of f.finestre) if (w.apertura) w.batti();
  assert.deepEqual([segno.acceso(), notizie], [false, [true, false]]);
  assert.deepEqual(f.bolla.messaggi, [{ tipo: 'segno-assente', motivo: 'protezione' }], 'la bolla lo dice, una volta');
  segno.chiudi();
  assert.deepEqual(notizie, [true, false]);
});

/* Giro 5, mutanti a 2 uccisori: una pagina MANCATA resta mancata per tutto l'avvio anche se nello stesso giro lo stesso schermo torna 200 e la sua voce aveva
   ancora il battito di prima (il battito non si azzera su `did-navigate`); un ricalcolo che arriva dopo (il server dice che il suo aiutante è cambiato) non
   la riaccende. Senza `!paginaMancata` nel calcolo dello stato, sì: segno «acceso» con le finestre in chiusura, zero cursori. */
for (const [id, nome, guasto] of [
  ['BATTITO-13', 'HTTP 404', (w) => w.carica(404)],
  ['BATTITO-14', 'processo della pagina morto', (w) => w.emettiContenuto('render-process-gone', {}, { reason: 'crashed', exitCode: -1 })],
  ['BATTITO-15', 'caricamento fallito', (w) => w.emettiContenuto('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', w.caricati.at(-1), true)],
]) {
  test(`${id} pagina mancata (${nome}) a segno acceso, e lo stesso schermo torna 200 subito: resta spento anche quando il server ricalcola`, async () => {
    const f = finti();
    const { segno, notizie } = segnoCon(f, { msSenzaBattito: 60_000 });
    await segno.aggiorna(BASE, 1);
    caricaEBatti(f);
    assert.equal(segno.acceso(), true);
    guasto(f.finestre[0]);
    f.finestre[0].carica(200);
    segno.aiutante(true); segno.aiutante(false);
    assert.deepEqual([segno.acceso(), f.finestre.map((w) => w.visibile), notizie], [false, [false, false], [true, false]], nome);
    await prossimoGiro();
    segno.aiutante(true); segno.aiutante(false);
    assert.deepEqual([segno.acceso(), notizie, vivi(f).length], [false, [true, false], 0], `${nome}: le finestre chiuse, nessuna notizia in più`);
    segno.chiudi();
  });
}

test('BATTITO-16 AL CONTRARIO: il server riparte a segno acceso e la navigazione vecchia finisce con ERR_ABORTED: non è una pagina mancata, la nuova che batte lo riaccende', async () => {
  const f = finti();
  const { segno, notizie } = segnoCon(f, { msSenzaBattito: 60_000 });
  await segno.aggiorna(BASE, 1);
  caricaEBatti(f);
  await segno.aggiorna(BASE, 2);
  for (const w of f.finestre) w.emettiContenuto('did-fail-load', {}, -3, 'ERR_ABORTED', w.caricati.at(-2), true); // la cornice principale, sostituita
  assert.deepEqual([segno.acceso(), notizie], [false, [true, false]], 'la pagina nuova non ha ancora battuto');
  caricaEBatti(f);
  assert.deepEqual([segno.acceso(), visibili(f), notizie], [true, [true, true], [true, false, true]]);
  assert.doesNotMatch(f.righe.join('\n'), /non riuscito/u, 'nessuna riga di caricamento fallito');
  segno.chiudi();
});

test('BATTITO-17 AL CONTRARIO: il processo della pagina esce pulito (`clean-exit`): non è una pagina mancata; spento al termine del battito, la pagina ricaricata che batte lo riaccende', async () => {
  const f = finti();
  const { segno, notizie } = segnoCon(f);
  await segno.aggiorna(BASE, 1);
  caricaEBatti(f);
  f.finestre[0].emettiContenuto('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 });
  assert.deepEqual([segno.acceso(), notizie], [true, [true]], 'un uscita pulita da sola non spegne subito');
  await aspetta(120); // oltre il termine di 60 ms: nessuno batte più
  assert.deepEqual([segno.acceso(), notizie], [false, [true, false]]);
  await segno.aggiorna(BASE, 2);
  caricaEBatti(f);
  assert.deepEqual([segno.acceso(), visibili(f), notizie], [true, [true, true], [true, false, true]], 'non era spento per sempre');
  segno.chiudi();
});

test('BATTITO-20 il battito vale solo per la pagina di adesso: né quello arrivato prima della pagina né quello della pagina vecchia accendono, a nessun ricalcolo', async () => {
  const f = finti();
  const { segno, notizie } = segnoCon(f, { msSenzaBattito: 60_000 });
  await segno.aggiorna(BASE, 1);
  for (const w of f.finestre) w.batti(); // nessuna pagina ancora: non è il segno che disegna
  for (const w of f.finestre) w.carica(200);
  segno.aiutante(true); segno.aiutante(false);
  assert.deepEqual([segno.acceso(), visibili(f), notizie], [false, [false, false], []], 'battito prima della pagina');
  for (const w of f.finestre) w.batti();
  assert.deepEqual([segno.acceso(), notizie], [true, [true]]);
  /* il server riparte: la pagina vecchia batteva, la nuova arriva e non batte ancora */
  await segno.aggiorna(BASE, 2);
  for (const w of f.finestre) w.carica(200);
  segno.aiutante(true); segno.aiutante(false);
  assert.deepEqual([segno.acceso(), visibili(f), notizie], [false, [false, false], [true, false]], 'battito della pagina vecchia');
  for (const w of f.finestre) w.batti();
  assert.deepEqual([segno.acceso(), visibili(f), notizie], [true, [true, true], [true, false, true]]);
  segno.chiudi();
});

test('BATTITO-18 il termine di serie, coi tempi veri: battiti ogni MS_BATTITO tengono il segno acceso; fermi per 2,3 s lo spengono (i 2 s detti nel CHANGELOG)', async () => {
  const f = finti();
  const notizie = [];
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false, quandoCambia: (a) => notizie.push(a) }); // termini di serie
  await segno.aggiorna(BASE, 1);
  caricaEBatti(f);
  for (let t = 0; t < 2500; t += modulo.MS_BATTITO) { await aspetta(modulo.MS_BATTITO); for (const w of f.finestre) w.batti(); }
  assert.deepEqual([segno.acceso(), notizie], [true, [true]], 'al ritmo della pagina: acceso');
  await aspetta(2300); // numeri scritti qui e non letti dal modulo: un termine di serie cambiato deve far diventare rossa la prova
  assert.deepEqual([segno.acceso(), visibili(f), notizie], [false, [false, false], [true, false]], 'la pagina ferma: spento entro il termine, non dopo');
  segno.chiudi();
});

test('BATTITO-12 main.mjs: il messaggio `segno-aiutante` del server arriva al segno, figlio per figlio; un figlio uscito non tiene più il cursore', () => {
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /if \(messaggio\?\.tipo === 'segno-aiutante'\) segno\.aiutante\(messaggio\.conCursore, handle\);/u, 'il guscio passa al segno ciò che dice il server, figlio per figlio');
  /* all uscita il figlio non tiene più il cursore: il segno lo toglie dai suoi */
  assert.match(main, /handle\.terminato = true; figli\.delete\(handle\);\s*segno\.aiutante\(false, handle\);/u);
});

test('BATTITO-19 più figli del guscio (un server vecchio che finisce, uno nuovo): il segno si mostra solo quando NESSUNO ha più un aiutante col suo cursore', async () => {
  const f = finti();
  const { segno, notizie } = segnoCon(f, { msSenzaBattito: 60_000 });
  const vecchio = {}; const nuovo = {};
  await segno.aggiorna(BASE, 1);
  segno.aiutante(true, vecchio);
  segno.aiutante(true, nuovo);
  caricaEBatti(f);
  assert.deepEqual([segno.acceso(), visibili(f), notizie], [true, [false, false], [true]], 'acceso, ma due aiutanti col loro cursore');
  segno.aiutante(false, vecchio); // il server vecchio è uscito, il suo aiutante con lui
  assert.deepEqual(visibili(f), [false, false], 'l aiutante del figlio nuovo ha ancora il suo cursore');
  segno.aiutante('true', nuovo); segno.aiutante(1, nuovo);
  assert.deepEqual(visibili(f), [true, true], 'solo il vero `true` è un cursore: il figlio nuovo ha detto altro, e nessuno ha più il suo');
  segno.aiutante(true, nuovo);
  assert.deepEqual(visibili(f), [false, false]);
  segno.aiutante(false, vecchio);
  assert.deepEqual(visibili(f), [false, false], 'un figlio che ripete «no» non toglie il cursore di un altro');
  segno.aiutante(false, nuovo);
  assert.deepEqual([segno.acceso(), visibili(f), notizie], [true, [true, true], [true]], 'nessuno: il segno si vede; il server non riceve notizie per questo');
  segno.chiudi();
});
