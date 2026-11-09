/*
 * Agente Q3 (04/11/2026): prove VERDI sulla testa 8cfdf6230 che uccidono i mutanti di Q3 sopravvissuti alle prove del ramo.
 * Aiutante finto, modello finto. Da copiare in harness-ui/tests/.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import { validaDomandeUtente } from '../src/user-question-contract.mjs';

function png(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const FINESTRA = { window_id: 101, pid: 4242, app_name: 'Notepad.exe', title: 'Profilo', bounds: { x: 0, y: 0, width: 1280, height: 720 }, z_index: 5, is_on_screen: true, minimized: false };
const stato = () => ({ window_title: 'Profilo', app_name: 'Notepad.exe', window_bounds: FINESTRA.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [{ element_index: 1, element_token: 't1', role: 'Edit', label: 'Nome', frame: { x: 10, y: 60, w: 400, h: 30 } }] });
function aiutanteFinto() {
  const azioni = [];
  return {
    azioni,
    async apri() { return { ok: true }; },
    compito() { return () => {}; },
    async chiama(nome, argomenti) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [FINESTRA] }, immagine: null, errore: null };
      if (nome === 'get_window_state') return { ok: true, dati: stato(), immagine: { base64: png(1280, 720).toString('base64'), mime: 'image/png' }, errore: null };
      azioni.push({ nome, argomenti });
      return { ok: true, dati: {}, immagine: null, errore: null };
    },
  };
}

test('Q3-K4 (Q3-M4): un\'azione fuori vocabolario non arriva MAI al ciclo: in Normale nessuna carta «non valutabile», in Accesso pieno nessun fermo', async () => {
  for (const livello of ['scrittura-progetto', 'accesso-pieno']) {
    const aiutante = aiutanteFinto();
    const domande = []; let n = 0;
    const risposte = [{ actions: [{ type: 'type', ref: 'e1', text: 'Mario' }, { type: 'drag' }] }, { done: { success: true } }];
    const r = await creaOspiteComputerUse({ aiutante })(NOME_COMPUTER_USE, { task: 'fill the name' }, { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal,
      livelloAccesso: livello, sessione: { testoDellaPersona: 'Scrivi Mario nel campo Nome',
        chiediModello: async () => { const x = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(x), usage: null }; },
        chiediDomanda: async (q) => { validaDomandeUtente(q); domande.push(q); return { status: 'answered', answers: Object.fromEntries(q.map((x) => [x.id, 'Allow'])) }; },
        emetti: () => {} } });
    const carteAzione = domande.map((q) => q[0].question).filter((c) => /about to do|cannot check|sensitive/u.test(c)); // la carta del compito non conta
    assert.deepEqual(carteAzione, [], `${livello}: carta per un segnaposto: ${JSON.stringify(carteAzione)}`);
    assert.match(String(r.testo), /succeeded/u, `${livello}: ${r.testo}`);
  }
});
