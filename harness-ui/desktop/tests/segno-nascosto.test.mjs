/*
 * Giro 6 della bolla (owner 14/11 15:46, giudice v1884; ROSSO della prova dal vivo, punto 2): la finestra del segno nasce nascosta e il guscio la mostra solo
 *   al primo battito della sua pagina; ma nella finestra MAI mostrata `requestAnimationFrame` non scatta, quindi senza un battito iniettato a mano la pagina non
 *   batteva mai e cursore e bordo di TALOS restavano spenti per tutto il lancio.
 * La cura, due parti: la finestra nasce con `paintWhenInitiallyHidden: true` e `backgroundThrottling: false` (UI-TARS `apps/ui-tars/src/main/window/
 *   ScreenMarker.ts:61`, la sua finestra del segno; Electron `browser-window-options.md`: «Whether the renderer should be active when `show` is `false` and it has
 *   just been created»), e la pagina batte la prima volta anche senza fotogrammi, dai timer (`frontend/src/components/computer-use/segno.js`, `creaBattito`).
 * Qui il filo guscio ↔ pagina con la pagina VERA del battito (`creaBattito`) in una finestra finta che si comporta come Electron nel caso peggiore misurato:
 *   i fotogrammi arrivano solo a finestra mostrata. Nessun battito iniettato.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaSegnoFinestre, MS_BATTITO, opzioniFinestraSegno } from '../segno-finestra.mjs';
import { creaBattito } from '../../frontend/src/components/computer-use/segno.js';
import { BASE, finti, aspetta } from './fixtures/segno-finestre-finte.mjs';

test('SNAS-01 RED: la finestra del segno nasce nascosta MA col renderer attivo e senza rallentamento a finestra nascosta', () => {
  const o = opzioniFinestraSegno({ x: 0, y: 0, width: 10, height: 10 });
  assert.equal(o.show, false, 'nasce nascosta: si mostra al primo battito');
  assert.equal(o.paintWhenInitiallyHidden, true, 'il renderer della finestra nascosta disegna (UI-TARS ScreenMarker.ts:61)');
  assert.equal(o.webPreferences.backgroundThrottling, false, 'i timer della pagina corrono anche a finestra nascosta');
});

/** La pagina del segno di ogni finestra finta: il battito vero, coi fotogrammi solo a finestra mostrata (come la misura dal vivo) e i timer veri. */
function paginaVera(w, fermi) {
  const nodo = { isConnected: true, hidden: false };
  const fotogramma = (f) => { const prova = () => { if (w.distrutta) return; if (w.visibile) f(); else setTimeout(prova, 16); }; setTimeout(prova, 16); return 1; };
  const timer = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id), setInterval: (f, ms) => setInterval(f, ms), clearInterval: (id) => clearInterval(id) };
  fermi.push(creaBattito({ nodo, batti: () => { if (!w.distrutta) w.batti(); }, fotogramma, timer, ms: MS_BATTITO }));
}

test('SNAS-02 RED: senza battito iniettato, la finestra mai mostrata batte, si mostra e il segno si accende entro un battito e mezzo', async (t) => {
  const f = finti();
  const cambi = [];
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false, quandoCambia: (a) => cambi.push(a) });
  const fermi = [];
  t.after(() => { for (const b of fermi) b.ferma(); segno.chiudi(); });
  await segno.aggiorna(BASE, 1);
  for (const w of f.finestre) { w.carica(200); paginaVera(w, fermi); }
  await aspetta(MS_BATTITO * 1.5);
  assert.equal(segno.acceso(), true, 'acceso senza nessuna spinta');
  assert.deepEqual(cambi, [true]);
  for (const w of f.finestre) assert.equal(w.visibile, true, 'ogni finestra del segno si vede');
});

test('SNAS-03: AL CONTRARIO, una pagina che non batte mai (script rotto) resta spenta e nascosta: il fallback non accende niente da solo', async (t) => {
  const f = finti();
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false });
  t.after(() => segno.chiudi());
  await segno.aggiorna(BASE, 1);
  for (const w of f.finestre) w.carica(200);
  await aspetta(MS_BATTITO * 1.5);
  assert.equal(segno.acceso(), false);
  for (const w of f.finestre) assert.equal(w.visibile, false);
});
