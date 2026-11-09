/*
 * Agente O (04/11/2026): prove della revisione avversaria delle cure del passo 5 (testa 3436a31da). Aiutante finto, modello finto,
 * nessuno schermo vero. Le prove O-R* sono ROSSE sulla testa (difetti nuovi), le O-V* sono controlli che devono restare verdi.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import { validaDomandeUtente } from '../src/user-question-contract.mjs';
import { creaAiutanteMcp } from '../src/computer-use/aiutante-mcp.mjs';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';

function png(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const FINESTRA = { window_id: 101, pid: 4242, app_name: 'Notepad.exe', title: 'Profilo', bounds: { x: 0, y: 0, width: 1280, height: 720 }, z_index: 5, is_on_screen: true, minimized: false };
// Un modulo: un campo «Nome» e, dopo un Tab, il pulsante «Elimina account» col fuoco.
const statoModulo = () => ({ window_title: 'Profilo', app_name: 'Notepad.exe', window_bounds: FINESTRA.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [{ element_index: 1, element_token: 't1', role: 'Edit', label: 'Nome', frame: { x: 10, y: 60, w: 400, h: 30 } },
    { element_index: 2, element_token: 't2', role: 'Edit', label: 'Cognome', frame: { x: 10, y: 100, w: 400, h: 30 } },
    { element_index: 3, element_token: 't3', role: 'Button', label: 'Elimina account', frame: { x: 10, y: 600, w: 160, h: 40 } }] });
function aiutanteFinto({ stato = statoModulo } = {}) {
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
function sessione({ testoDellaPersona, risposte, rispostaCarta = 'Allow', livelli = null }) {
  const domande = []; let n = 0; let k = 0;
  const prossima = () => (Array.isArray(rispostaCarta) ? rispostaCarta[Math.min(k++, rispostaCarta.length - 1)] : rispostaCarta);
  const valore = {
    testoDellaPersona,
    chiediModello: async () => { const r = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(r), usage: null }; },
    chiediDomanda: async (q) => { validaDomandeUtente(q); domande.push(q); const v = prossima(); return { status: 'answered', answers: Object.fromEntries(q.map((x) => [x.id, v])) }; },
    emetti: () => {},
  };
  if (livelli) valore.livelloAccessoOra = livelli;
  return { domande, valore };
}
const esegui = (ospite, s, { livello = 'scrittura-progetto', segnale = new AbortController().signal, task = 'fill the form' } = {}) =>
  ospite(NOME_COMPUTER_USE, { task }, { fase: 'esegui', toolCallId: 'c1', segnale, livelloAccesso: livello, sessione: s.valore });

test('O-R1 (sicurezza): dopo un Tab il fuoco è altrove; un Invio senza ref NON si valuta sul campo ricordato (lì sarebbe senza carta)', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome del profilo',
    risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'Mario' }] }, { actions: [{ type: 'keys', keys: 'tab' }] }, { actions: [{ type: 'keys', keys: 'enter' }] }, { done: { success: true } }] });
  const r = await esegui(creaOspiteComputerUse({ aiutante }), s);
  const invii = aiutante.azioni.filter((a) => a.nome === 'press_key' && a.argomenti.key === 'enter');
  // il fuoco, dopo Tab, è sul campo dopo o sul pulsante «Elimina account»: l'Invio non si preme senza una carta che lo dica
  const carteDellAzione = s.domande.map((q) => q[0].question).filter((c) => /about to do/u.test(c));
  assert.ok(invii.length === 0 || carteDellAzione.length >= 1,
    `Invio premuto senza la carta dell'azione (carte: ${s.domande.map((q) => q[0].question).join(' | ')}); esito: ${r.testo}`);
});

test('O-R1b (sicurezza, Accesso pieno): Tab poi Invio senza ref ⇒ la cancellazione non chiesta non passa (con ref sul pulsante il ciclo FERMA)', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome del profilo',
    risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'Mario' }] }, { actions: [{ type: 'keys', keys: 'tab' }] }, { actions: [{ type: 'keys', keys: 'enter' }] }, { done: { success: true } }] });
  const r = await esegui(creaOspiteComputerUse({ aiutante }), s, { livello: 'accesso-pieno' });
  const invii = aiutante.azioni.filter((a) => a.nome === 'press_key' && a.argomenti.key === 'enter');
  assert.equal(invii.length, 0, `Invio premuto in Accesso pieno dopo Tab, valutato sul campo «Nome» ricordato; esito: ${r.testo}`);
});

test('O-R2 (correttezza): «scrivi» senza ref dopo un Tab NON sovrascrive il campo ricordato (SetValue col suo element_token)', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Scrivi Mario Rossi nel profilo',
    risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'Mario' }] }, { actions: [{ type: 'keys', keys: 'tab' }] }, { actions: [{ type: 'type', text: 'Rossi' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s);
  const scritture = aiutante.azioni.filter((a) => a.nome === 'type_text');
  const sulPrimo = scritture.filter((a) => a.argomenti.element_token === 't1').map((a) => a.argomenti.text);
  assert.deepEqual(sulPrimo, ['Mario'], `il campo «Nome» ha ricevuto: ${JSON.stringify(sulPrimo)} (tutte: ${JSON.stringify(scritture.map((a) => a.argomenti))})`);
});

test('O-R3 (1b): «ask_person» senza «reason» ⇒ la carta non mostra il codice del ciclo «scelta»', async () => {
  const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome', rispostaCarta: ['Allow', 'Done'],
    risposte: [{ actions: [{ type: 'ask_person' }] }, { done: { success: true } }] });
  s.valore.lingua = 'it';
  s.valore.chiediDomanda = async (q) => { validaDomandeUtente(q); s.domande.push(q); return { status: 'answered', answers: { computer_use: s.domande.length === 1 ? 'Consenti' : 'Fatto' } }; };
  await esegui(creaOspiteComputerUse({ aiutante: aiutanteFinto() }), s);
  const carte = s.domande.map((q) => q[0].question);
  assert.ok(carte.length >= 2, carte.join(' | '));
  for (const c of carte) assert.doesNotMatch(c, /\bscelta\b/u, c);
});

test('O-V1 (10c): livello abbassato a Sola lettura mentre la carta è aperta ⇒ dopo «Consenti» nessuna azione parte', async () => {
  const aiutante = aiutanteFinto();
  let livello = 'scrittura-progetto';
  const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome', livelli: () => livello,
    risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'Mario' }] }, { done: { success: true } }] });
  const vera = s.valore.chiediDomanda;
  s.valore.chiediDomanda = async (q) => { livello = 'lettura'; return vera(q); };
  const r = await esegui(creaOspiteComputerUse({ aiutante }), s);
  assert.deepEqual(aiutante.azioni, [], r.testo);
  assert.match(r.testo, /lowered the permission level/u, r.testo);
});

test('O-V2 (lucchetto): un\'eccezione dopo il primo await (aiutante.compito lancia) libera lo schermo', async () => {
  const aiutante = aiutanteFinto();
  let volte = 0;
  aiutante.compito = () => { volte += 1; if (volte === 1) throw new Error('rotto'); return () => {}; };
  const ospite = creaOspiteComputerUse({ aiutante });
  const s1 = sessione({ testoDellaPersona: 'Scrivi Mario', risposte: [{ done: { success: true } }] });
  await assert.rejects(esegui(ospite, s1, { livello: 'accesso-pieno' }), { name: 'Error', message: 'rotto' });
  const s2 = sessione({ testoDellaPersona: 'Scrivi Mario', risposte: [{ done: { success: true } }] });
  const r2 = await esegui(ospite, s2, { livello: 'accesso-pieno' });
  assert.doesNotMatch(r2.testo, /screen is busy/u, r2.testo);
});

test('O-V3 (lucchetto): un errore del modello del passo (chiediModello lancia) libera lo schermo', async () => {
  const ospite = creaOspiteComputerUse({ aiutante: aiutanteFinto() });
  const s1 = sessione({ testoDellaPersona: 'Scrivi Mario', risposte: [] });
  s1.valore.chiediModello = async () => { throw new Error('rete'); };
  await esegui(ospite, s1, { livello: 'accesso-pieno' });
  const s2 = sessione({ testoDellaPersona: 'Scrivi Mario', risposte: [{ done: { success: true } }] });
  const r2 = await esegui(ospite, s2, { livello: 'accesso-pieno' });
  assert.doesNotMatch(r2.testo, /screen is busy/u, r2.testo);
});

test('O-V4 (lucchetto): Stop del giro a metà compito libera lo schermo', async () => {
  const ospite = creaOspiteComputerUse({ aiutante: aiutanteFinto() });
  const ctl = new AbortController();
  const s1 = sessione({ testoDellaPersona: 'Scrivi Mario', risposte: [] });
  s1.valore.chiediModello = ({ segnale }) => new Promise((ok, no) => { segnale?.addEventListener?.('abort', () => no(new Error('aborted')), { once: true }); });
  const corsa = esegui(ospite, s1, { livello: 'accesso-pieno', segnale: ctl.signal });
  await new Promise((ok) => setTimeout(ok, 30));
  ctl.abort();
  await corsa;
  const s2 = sessione({ testoDellaPersona: 'Scrivi Mario', risposte: [{ done: { success: true } }] });
  const r2 = await esegui(ospite, s2, { livello: 'accesso-pieno' });
  assert.doesNotMatch(r2.testo, /screen is busy/u, r2.testo);
});

test('O-V5 (R7): sul codice vero, 300 sequenze a caso di apri/compito/rilascio col timer di inattività a 3 ms: mai spento con un compito aperto', async () => {
  const buono = Buffer.from('aiutante buono');
  const impronta = createHash('sha256').update(buono).digest('hex');
  let x = 7; const caso = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  let violazioni = 0; let spegnimenti = 0;
  for (let giro = 0; giro < 300; giro += 1) {
    let a = null; let finale = false;
    const figlio = () => {
      const f = new EventEmitter();
      f.stdout = new EventEmitter(); f.stdout.setEncoding = () => {};
      f.stderr = new EventEmitter();
      f.stdin = { write: (riga) => { const m = JSON.parse(riga); if (m.id) setImmediate(() => f.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {} })}\n`)); return true; },
        end: () => { if (finale) return; spegnimenti += 1; if (a.stato().compiti > 0) violazioni += 1; } };
      f.kill = () => {};
      return f;
    };
    a = creaAiutanteMcp({ exe: `C:/finto/o-r7-${giro}.exe`, improntaAttesa: impronta, leggi: async () => buono, avvia: figlio, msInattivo: 3 });
    const rilasci = [];
    for (let passo = 0; passo < 12; passo += 1) {
      const r = caso();
      if (r < 0.3) await a.apri();
      else if (r < 0.55) rilasci.push(a.compito());
      else if (r < 0.8 && rilasci.length) rilasci.splice(Math.floor(caso() * rilasci.length), 1)[0]();
      await new Promise((ok) => setTimeout(ok, Math.floor(caso() * 7)));
    }
    finale = true; a.chiudi();
  }
  assert.ok(spegnimenti > 0, 'premessa: il timer di inattività scatta davvero');
  assert.equal(violazioni, 0, `spegnimenti con un compito aperto: ${violazioni} su ${spegnimenti}`);
});
