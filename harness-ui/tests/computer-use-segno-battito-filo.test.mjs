/*
 * Giro 5 della bolla (decisione dell'owner 14/11/2026 08:18, giudice v1838-v1839): «un cursore solo, mai zero» provato sul filo intero, nello stesso processo:
 *   il guscio VERO del segno (`desktop/segno-finestra.mjs`, finestre finte) → `quandoCambia` → l'ambiente del server (come `child-bootstrap.mjs`) →
 *   `segnoCambiato` dell'aiutante VERO (`aiutante-mcp.mjs`, processo in memoria) → `quandoCursore` → `segno.aiutante` (come `main.mjs` col messaggio
 *   `segno-aiutante`). La pagina del segno è finta e ha una salute: «sana» batte e disegna, «senza-script» arriva con 200 e non disegna né batte,
 *   «bloccata» smette di battere e di disegnare, «morta» ha il processo caduto.
 *   I cursori a ogni passo del compito: quello di TALOS c'è se una finestra del segno si vede E la sua pagina disegna; quello dell'aiutante se l'aiutante vive
 *   ed è partito senza `--no-overlay`. Si conta a ogni passo (dev'essere 1) e a ogni battito (mai 2).
 *   Prima della cura: compito subito dopo l'avvio e pagina 200 senza script = ZERO cursori a ogni passo (il controllore, punto 3).
 *   Hermes `apps/desktop/electron/hud-close.ts:7-12`: `unresponsive` arriva dopo 5 s e da loro nessuno lo usa; qui spegne il segno.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { creaAiutanteMcp } from '../src/computer-use/aiutante-mcp.mjs';
import { creaSegnoFinestre } from '../desktop/segno-finestra.mjs';
import { BASE, SECONDO, finti, aspetta, vivi } from '../desktop/tests/fixtures/segno-finestre-finte.mjs';
import { processoAiutanteInMemoria } from './fixtures/processo-aiutante-in-memoria.mjs';

const VARIABILE = 'TALOS_SEGNO_ACCESO';
const BYTE = Buffer.from('aiutante finto del filo del battito');
const IMPRONTA = createHash('sha256').update(BYTE).digest('hex');
const MS_SENZA_BATTITO = 60;
const OGNI_BATTITO = 15;

function filo(t, { accesa = true, protezioneTiene = true } = {}) {
  const f = finti({ protezioneTiene });
  const ambiente = {};
  const avvii = [];
  const salute = new Map(); // finestra → 'sana' | 'senza-script' | 'bloccata' | 'morta'
  let segno = null;
  const aiutante = creaAiutanteMcp({ exe: 'C:/finto/battito/cua-driver.exe', improntaAttesa: IMPRONTA, leggi: async () => BYTE, ambiente, registro: () => {},
    avvia: (_exe, args) => { avvii.push(args); return processoAiutanteInMemoria(); },
    quandoCursore: (conCursore) => segno?.aiutante?.(conCursore) });
  segno = creaSegnoFinestre({ ...f.dipendenze, accesa, vecchio: false, ritardoRicostruisci: 5, msPaginaPronta: 2000, msSenzaBattito: MS_SENZA_BATTITO,
    quandoCambia: (acceso) => { if (acceso === true) ambiente[VARIABILE] = '1'; else delete ambiente[VARIABILE]; aiutante.segnoCambiato(); } });
  if (segno.acceso() === true) ambiente[VARIABILE] = '1'; // main.mjs: `creaAvvioFiglio({ segnoAcceso: segno.acceso() })`
  let massimo = 0;
  const cursori = () => {
    const talos = vivi(f).some((w) => w.visibile && salute.get(w) === 'sana') ? 1 : 0;
    const ultimo = avvii.at(-1);
    const suo = aiutante.stato().vivo && Array.isArray(ultimo) && !ultimo.includes('--no-overlay') ? 1 : 0;
    massimo = Math.max(massimo, talos + suo);
    return talos + suo;
  };
  /* le pagine sane battono da sole, come `setInterval` della pagina vera; a ogni battito si contano i cursori */
  const battiti = setInterval(() => { for (const w of vivi(f)) if (salute.get(w) === 'sana') w.batti(); cursori(); }, OGNI_BATTITO);
  t.after(() => { clearInterval(battiti); segno.chiudi(); aiutante.chiudiPerSempre(); });
  const carica = async (stato = 'sana') => { await segno.aggiorna(BASE, 1); for (const w of vivi(f)) { salute.set(w, stato); w.carica(200); } };
  const passo = async () => { const r = await aiutante.chiama('list_windows', {}); assert.equal(r.ok, true, r.errore ?? ''); return cursori(); };
  const comincia = async () => { const fine = aiutante.compito(); assert.equal((await aiutante.apri()).ok, true); return fine; };
  return { f, segno, aiutante, ambiente, avvii, salute, carica, passo, comincia, cursori, massimo: () => massimo };
}

test('FILO-01 compito lanciato subito dopo l avvio, prima del primo battito: il cursore dell aiutante a ogni passo; le pagine che battono a metà non ne aggiungono un secondo', async (t) => {
  const c = filo(t);
  const fine = await c.comincia(); // le pagine del segno non ci sono ancora
  assert.deepEqual(c.avvii, [['mcp']], 'il guscio non ha ancora un battito: l aiutante parte col suo cursore');
  assert.equal(await c.passo(), 1);
  await c.carica('sana');
  await aspetta(4 * OGNI_BATTITO);
  assert.equal(c.segno.acceso(), true, 'le pagine battono');
  for (let i = 0; i < 3; i++) { assert.equal(await c.passo(), 1, `passo ${i}: un cursore solo`); await aspetta(OGNI_BATTITO); }
  assert.deepEqual(c.avvii, [['mcp']], 'nessun riavvio a metà compito: il cursore dell aiutante resta fino alla fine');
  fine();
  c.aiutante.chiudi(); // l aiutante si spegne a riposo
  await aspetta(2 * OGNI_BATTITO);
  assert.equal(c.cursori(), 1, 'ora si vede il cursore di TALOS');
  const fine2 = await c.comincia();
  assert.deepEqual(c.avvii, [['mcp'], ['mcp', '--no-overlay']], 'il compito dopo: solo il cursore di TALOS');
  assert.equal(await c.passo(), 1);
  fine2();
  assert.equal(c.massimo(), 1, 'mai due cursori');
});

test('FILO-02 pagina arrivata con 200 il cui script manca, si rompe o non disegna: il cursore dell aiutante per tutto il compito, mai zero', async (t) => {
  const c = filo(t);
  await c.carica('senza-script');
  await aspetta(4 * OGNI_BATTITO);
  const fine = await c.comincia();
  for (let i = 0; i < 4; i++) { assert.equal(await c.passo(), 1, `passo ${i}`); await aspetta(OGNI_BATTITO); }
  assert.deepEqual(c.avvii, [['mcp']]);
  fine();
  assert.equal(c.massimo(), 1);
});

for (const [nome, guasto, entro] of [
  ['pagina bloccata (i battiti smettono)', (c) => { for (const w of vivi(c.f)) c.salute.set(w, 'bloccata'); }, MS_SENZA_BATTITO + 4 * OGNI_BATTITO],
  ['pagina bloccata detta da Electron (unresponsive)', (c) => { for (const w of vivi(c.f)) c.salute.set(w, 'bloccata'); c.f.finestre[0].emetti('unresponsive'); }, 0],
  ['processo della pagina morto (render-process-gone)', (c) => { for (const w of vivi(c.f)) c.salute.set(w, 'morta'); c.f.finestre[1].emettiContenuto('render-process-gone', {}, { reason: 'crashed', exitCode: -1 }); }, 0],
]) {
  test(`FILO-03 ${nome} a metà compito: il passo dopo ha il cursore dell aiutante; senza cursori al più per il termine del battito, mai due`, async (t) => {
    const c = filo(t);
    await c.carica('sana');
    await aspetta(4 * OGNI_BATTITO);
    const fine = await c.comincia();
    assert.deepEqual(c.avvii, [['mcp', '--no-overlay']], 'il segno batte: l aiutante parte senza il suo cursore');
    assert.equal(await c.passo(), 1, 'il cursore di TALOS');
    guasto(c);
    await aspetta(entro);
    assert.equal(c.segno.acceso(), false, `entro ${entro} ms il guscio lo sa`);
    assert.equal(c.ambiente[VARIABILE], undefined, 'e il server anche');
    for (let i = 0; i < 3; i++) { assert.equal(await c.passo(), 1, `passo ${i} dopo il guasto`); await aspetta(OGNI_BATTITO); }
    assert.deepEqual(c.avvii, [['mcp', '--no-overlay'], ['mcp']], 'riaperto col suo cursore al confine del passo');
    fine();
    assert.equal(c.massimo(), 1, 'mai due cursori');
  });
}

test('FILO-04 (a) segno spento di serie, (b) segno acceso che batte, (c) protezione rifiutata a metà compito: un cursore a ogni passo', async (t) => {
  /* (a) spento: nessuna finestra, il cursore dell aiutante */
  const a = filo(t, { accesa: false });
  await a.carica('sana');
  const fa = await a.comincia();
  for (let i = 0; i < 2; i++) assert.equal(await a.passo(), 1, `(a) passo ${i}`);
  assert.deepEqual(a.avvii, [['mcp']]);
  fa();
  /* (b) acceso: solo il cursore di TALOS */
  const b = filo(t);
  await b.carica('sana');
  await aspetta(4 * OGNI_BATTITO);
  const fb = await b.comincia();
  for (let i = 0; i < 3; i++) { assert.equal(await b.passo(), 1, `(b) passo ${i}`); await aspetta(OGNI_BATTITO); }
  assert.deepEqual(b.avvii, [['mcp', '--no-overlay']]);
  fb();
  /* (c) un cambio di schermi a metà, e Windows rifiuta la protezione delle finestre nuove */
  let tiene = true;
  const c = filo(t, { protezioneTiene: () => tiene });
  await c.carica('sana');
  await aspetta(4 * OGNI_BATTITO);
  const fc = await c.comincia();
  assert.equal(await c.passo(), 1);
  tiene = false;
  c.f.schermi.push({ ...SECONDO, id: 3, bounds: { ...SECONDO.bounds, x: 3200 } });
  c.f.emettiSchermo('display-added', c.f.schermi[2]);
  await aspetta(30);
  for (let i = 0; i < 2; i++) assert.equal(await c.passo(), 1, `(c) passo ${i}`);
  assert.deepEqual(c.avvii, [['mcp', '--no-overlay'], ['mcp']]);
  fc();
  assert.deepEqual([a.massimo(), b.massimo(), c.massimo()], [1, 1, 1], 'mai due cursori');
});

test('FILO-05 il battito che riprende dopo un guasto: il segno torna solo quando l aiutante col cursore si chiude, mai due cursori', async (t) => {
  const c = filo(t);
  await c.carica('sana');
  await aspetta(4 * OGNI_BATTITO);
  const fine = await c.comincia();
  assert.equal(await c.passo(), 1);
  for (const w of vivi(c.f)) c.salute.set(w, 'bloccata');
  await aspetta(MS_SENZA_BATTITO + 4 * OGNI_BATTITO);
  assert.equal(await c.passo(), 1, 'il cursore dell aiutante');
  for (const w of vivi(c.f)) c.salute.set(w, 'sana'); // la pagina si sblocca e batte di nuovo
  await aspetta(4 * OGNI_BATTITO);
  assert.equal(c.segno.acceso(), true);
  for (let i = 0; i < 3; i++) { assert.equal(await c.passo(), 1, `passo ${i}`); await aspetta(OGNI_BATTITO); }
  fine();
  c.aiutante.chiudi();
  await aspetta(2 * OGNI_BATTITO);
  assert.equal(c.cursori(), 1, 'a riposo torna il cursore di TALOS');
  assert.equal(c.massimo(), 1);
});
