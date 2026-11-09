/*
 * RIP-1 e RIP-2 (ripassata del Blocco 21, 01/11/2026): il giro delle cartelle con due dischi spenti e con una giunzione che cambia bersaglio.
 * Registro, cartelle e ponte veri; `stat` finto solo per i dischi spenti.
 */
import assert from 'node:assert/strict';
import fs, { mkdirSync, realpathSync, rmdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

function banco(t) {
  const radice = realpathSync.native(cartellaDiProva('talos-rip21-'));
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return p; };
  const store = crea('store');
  const dati = crea('dati');
  const stato = { ora: Date.parse('2026-11-01T10:00:00.000Z'), cartella: crea('progetti', 'AVM') };
  const registri = [];
  const nuovoRegistro = (extra = {}) => {
    const registro = createSessionRegistry({
      guardaWorkspaceFn: () => () => {},
      avviaSessioneFn: async (input) => {
        input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' });
        input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' });
        return { ok: true, esito: { messaggiFinali: [] } };
      },
      preparaEsecuzioneFn: () => ({ cartella: stato.cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
      cartellaStore: store, modello: 'z-ai/glm-5.3-flash', chiave: 'k', clock: () => new Date(stato.ora),
      ...extra,
    });
    registri.push(registro);
    return registro;
  };
  t.after(async () => { for (const r of registri) await r.chiudi({ attesaMassimaMs: 2000 }); });
  const monta = (registro) => {
    const cartelle = creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto-cartelle'),
      sessionRegistry: registro, cartelleAmmesse: [], cartelleEscluse: [dati] });
    const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro, remotoFn: () => ({ cartelle }) });
    const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
    const operazioni = creaOperazioni({ chiama, sessionRegistry: registro, iscriviConRigiocata, cartelle });
    return { cartelle, ponte: async (dispositivo = { id: 'disp-A', nome: 'Pad' }) => (await operazioni.esegui('sessions.list', {}, { dispositivo, iscrizioni: new Map(), iscrivi: () => async () => {} })).items };
  };
  const avvia = async (registro, cartella) => {
    stato.cartella = cartella;
    const { sessionId } = registro.avvia('task-vero');
    await new Promise((r) => setImmediate(r));
    return sessionId;
  };
  const riga = (registro, id) => registro.elenca().find((r) => r.sessionId === id);
  const dopoIlCalcolo = async (registro, id) => { registro.elenca(); await registro.attendiCartelle(); return riga(registro, id); };
  const avanza = (ms) => { stato.ora += ms; };
  return { radice, crea, nuovoRegistro, monta, avvia, riga, dopoIlCalcolo, avanza };
}

/* il disco spento vero: non resta appeso per sempre, torna con un errore dopo un po', più dell'attesa del giro.
 * ROSSO 4 della PR 91 (09/11/2026): l'attesa del giro sale da 5 a 200 ms, che una cartella vera rispetta sempre, anche sul runner di GitHub. E il
 * «dopo un po'» non è più un tempo (30 ms contro un'attesa di 5) ma `finiscano`: il disco spento torna solo lì, quindi in ogni giro resta appeso
 * oltre l'attesa e i due dischi tengono i due posti come prima, su qualunque macchina (stessa sequenza di controlli di prima, misurata il 09/11) */
const ATTESA_DEL_GIRO_MS = 200;
const spentiAppesi = [];
const statFinto = (spenti) => (p) => (spenti.acceso && p.includes('spento') ? new Promise((_ok, no) => { spentiAppesi.push(no); }) : fs.promises.stat(p));
const finiscano = async () => { for (const no of spentiAppesi.splice(0)) no(new Error('EHOSTDOWN')); await new Promise((r) => { setTimeout(r, 20); }); };
/* 04/11/2026, terza e quinta suite della candidata: sotto carico il vero `stat` + `realpath` della cartella può superare l'attesa
 * di 5 ms di un giro, e quel giro la vede «assente». Aspettare in tempo vero non basta: senza un giro nuovo la riga non cambia (quinta
 * suite, RIP21-B rossa). Si fanno altri giri del minuto finché la condizione vale, al più 5 s veri: il contratto resta «dopo qualche
 * giro la riga dice il vero», e i dischi spenti restano spenti per tutto il tempo. */
const finchéConGiri = async (b, registro, id, condizione, tettoMs = 5000) => {
  const fine = performance.now() + tettoMs;
  while (!condizione() && performance.now() < fine) { b.avanza(61_000); await b.dopoIlCalcolo(registro, id); await finiscano(); }
};

test('RIP21-A — due dischi spenti più vecchi: una cartella viva e nota non si ricontrolla più, e una cancellata resta nell\'elenco oltre il minuto del contratto', async (t) => {
  const b = banco(t);
  const spenti = { acceso: false };
  const registro = b.nuovoRegistro({ statCartellaFn: statFinto(spenti), attesaControlloCartellaMs: ATTESA_DEL_GIRO_MS });
  await b.avvia(registro, b.crea('spento-1'));
  await b.avvia(registro, b.crea('spento-2'));
  const viva = await b.avvia(registro, b.crea('viva'));
  registro.usaDescrizioneCartelle(async (p) => ({ cartellaId: p.split(/[\\/]/u).pop(), nome: 'n' }));
  await registro.attendiCartelle();
  assert.equal((await b.dopoIlCalcolo(registro, viva)).cartella?.cartellaId, 'viva', 'premessa: nota e calcolata');
  spenti.acceso = true;
  rmdirSync(join(b.radice, 'viva'));
  for (let i = 0; i < 4; i += 1) { b.avanza(61_000); await b.dopoIlCalcolo(registro, viva); await finiscano(); }
  await finchéConGiri(b, registro, viva, () => b.riga(registro, viva).cartella === null);
  assert.equal(b.riga(registro, viva).cartella, null, 'quattro giri del minuto dopo, la cartella cancellata è ancora nella riga');
});

test('RIP21-B — lo stesso, al contrario: una cartella tornata resta null finché due dischi più vecchi non rispondono', async (t) => {
  const b = banco(t);
  const spenti = { acceso: false };
  const registro = b.nuovoRegistro({ statCartellaFn: statFinto(spenti), attesaControlloCartellaMs: ATTESA_DEL_GIRO_MS });
  await b.avvia(registro, b.crea('spento-1'));
  await b.avvia(registro, b.crea('spento-2'));
  const cartella = b.crea('torna');
  const torna = await b.avvia(registro, cartella);
  registro.usaDescrizioneCartelle(async (p) => ({ cartellaId: p.split(/[\\/]/u).pop(), nome: 'n' }));
  await registro.attendiCartelle();
  await b.dopoIlCalcolo(registro, torna);
  rmdirSync(cartella);
  b.avanza(61_000);
  assert.equal((await b.dopoIlCalcolo(registro, torna)).cartella, null, 'premessa: il giro ha visto che manca');
  spenti.acceso = true;
  mkdirSync(cartella);
  for (let i = 0; i < 4; i += 1) { b.avanza(61_000); await b.dopoIlCalcolo(registro, torna); await finiscano(); }
  await finchéConGiri(b, registro, torna, () => b.riga(registro, torna).cartella?.cartellaId === 'torna');
  assert.equal(b.riga(registro, torna).cartella?.cartellaId, 'torna', 'la cartella c\'è da quattro minuti e la riga dice che non c\'è');
});

test('RIP21-C — una giunzione che cambia bersaglio: il ponte legge il consenso del bersaglio nuovo e dà l\'id di quello vecchio', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro();
  const { ponte, cartelle } = b.monta(registro);
  const a = b.crea('vera-a');
  const nuova = b.crea('vera-b');
  const giunzione = join(b.radice, 'giunzione');
  symlinkSync(a, giunzione, 'junction');
  const id = await b.avvia(registro, giunzione);
  await b.dopoIlCalcolo(registro, id);
  const dispositivo = { id: 'disp-A', nome: 'Pad' };
  const [prima] = (await ponte(dispositivo)).filter((r) => r.sessionId === id);
  assert.equal(prima.cartellaId, (await cartelle.descrivi(a)).cartellaId, 'premessa: l\'id di A');
  rmdirSync(giunzione);
  symlinkSync(nuova, giunzione, 'junction');
  await cartelle.consentiInAnticipo(dispositivo.id, nuova);
  const [dopo] = (await ponte(dispositivo)).filter((r) => r.sessionId === id);
  assert.equal(dopo.consentita, true, 'il consenso è dal vivo: quello di B');
  assert.equal(dopo.cartellaId, (await cartelle.descrivi(nuova)).cartellaId, 'consentita:true di B accanto all\'id di A');
});

test('RIP22-C2 — nessun allargamento: il consenso era del bersaglio vecchio, la giunzione punta altrove, e il ponte dice id nuovo e NON consentita', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro();
  const { ponte, cartelle } = b.monta(registro);
  const a = b.crea('vera-a');
  const nuova = b.crea('vera-b');
  const giunzione = join(b.radice, 'giunzione');
  symlinkSync(a, giunzione, 'junction');
  const id = await b.avvia(registro, giunzione);
  await b.dopoIlCalcolo(registro, id);
  const dispositivo = { id: 'disp-A', nome: 'Pad' };
  await cartelle.consentiInAnticipo(dispositivo.id, a);
  const [prima] = (await ponte(dispositivo)).filter((r) => r.sessionId === id);
  assert.equal(prima.consentita, true, 'il controllo: prima del cambio è consentita');
  rmdirSync(giunzione);
  symlinkSync(nuova, giunzione, 'junction');
  const [dopo] = (await ponte(dispositivo)).filter((r) => r.sessionId === id);
  assert.equal(dopo.consentita, false, 'il consenso non segue il nome della giunzione');
  assert.equal(dopo.cartellaId, (await cartelle.descrivi(nuova)).cartellaId);
});

test('RIP22-C3 — anche la riga dell\'elenco si riallinea al giro dopo: lo stesso id del ponte, non due id nella stessa riga', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro();
  const { ponte, cartelle } = b.monta(registro);
  const a = b.crea('vera-a');
  const nuova = b.crea('vera-b');
  const giunzione = join(b.radice, 'giunzione');
  symlinkSync(a, giunzione, 'junction');
  const id = await b.avvia(registro, giunzione);
  assert.equal((await b.dopoIlCalcolo(registro, id)).cartella.cartellaId, (await cartelle.descrivi(a)).cartellaId, 'premessa: l\'id di A');
  rmdirSync(giunzione);
  symlinkSync(nuova, giunzione, 'junction');
  b.avanza(61_000);
  const riga = await b.dopoIlCalcolo(registro, id);
  const atteso = (await cartelle.descrivi(nuova)).cartellaId;
  assert.equal(riga.cartella.cartellaId, atteso);
  assert.equal((await ponte()).find((r) => r.sessionId === id).cartella.cartellaId, atteso, 'il campo nuovo sul ponte');
  assert.equal((await ponte()).find((r) => r.sessionId === id).cartellaId, atteso, 'e quello piatto: lo stesso valore (contratto dell\'elenco, punto 1 del Mobile)');
});

test('RIP22-C4 — una descrizione appesa mentre il bersaglio cambia non lascia l\'id vecchio: il giro dopo descrive quello nuovo', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro({ attesaControlloCartellaMs: ATTESA_DEL_GIRO_MS });
  const a = b.crea('vera-a');
  const nuova = b.crea('vera-b');
  const giunzione = join(b.radice, 'giunzione');
  symlinkSync(a, giunzione, 'junction');
  let sblocca = null;
  const appesa = new Promise((ok) => { sblocca = ok; });
  let chiamate = 0;
  registro.usaDescrizioneCartelle(async () => {
    chiamate += 1;
    if (chiamate > 1) return { cartellaId: 'id-b', nome: 'b', tipo: 'progetto' };
    await appesa;
    return { cartellaId: 'id-a', nome: 'a', tipo: 'progetto' };
  });
  const id = await b.avvia(registro, giunzione);
  await b.dopoIlCalcolo(registro, id);
  assert.equal(chiamate, 1, 'premessa: la descrizione del primo bersaglio è appesa');
  rmdirSync(giunzione);
  symlinkSync(nuova, giunzione, 'junction');
  b.avanza(61_000);
  await b.dopoIlCalcolo(registro, id); // questo controllo vede il bersaglio nuovo, e riusa la descrizione ancora appesa
  sblocca();
  await new Promise((r) => setImmediate(r));
  const realeNuova = realpathSync.native(giunzione);
  assert.equal(registro.cartellaDescritta(id, realeNuova), undefined, 'l\'id del bersaglio di prima non si presenta sotto il percorso nuovo');
  b.avanza(61_000);
  await b.dopoIlCalcolo(registro, id);
  assert.equal(registro.cartellaDescritta(id, realeNuova)?.cartellaId, 'id-b');
});
