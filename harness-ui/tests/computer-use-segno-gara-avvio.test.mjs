/*
 * Giro 4 della bolla (controllore CU, 13/11, sonda `sonda-gara-avvio.test.mjs` copiata e allargata): il segno di TALOS smette di vedersi MENTRE l'aiutante
 * parte, durante il secondo controllo dell'impronta (dopo `spawn`, prima di `initialize`: 35-77 ms misurati dal controllore sulla copia di 51 MB). Prima la
 * chiusura al confine del passo partiva lì in mezzo, `initialize` trovava l'aiutante già chiuso, `apri` rispondeva `{ ok: false, motivo: 'initialize' }` e il
 * modello riceveva «not available on this computer» invece del riavvio col cursore dell'aiutante. Ora anche il secondo controllo conta come chiamata in volo:
 * l'avvio finisce, l'aiutante si chiude subito dopo e la chiamata dopo lo riapre col suo cursore, come Hermes, che riavvia prima della chiamata dopo e mai
 * durante (`tools/computer_use/cua_backend_session.py:479`). Nessuna prova tocca lo schermo: processo dell'aiutante in memoria.
 * Doc: Node child_process `subprocess.send()` (Context7 /nodejs/node, 13/11/2026, dal controllore).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { creaAiutanteMcp, NON_DISPONIBILE } from '../src/computer-use/aiutante-mcp.mjs';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import { EVENTI } from '../src/computer-use/ciclo.mjs';
import { processoAiutanteInMemoria } from './fixtures/processo-aiutante-in-memoria.mjs';

const VARIABILE = 'TALOS_SEGNO_ACCESO';
const BYTE = Buffer.from('aiutante finto in memoria');
const IMPRONTA = createHash('sha256').update(BYTE).digest('hex');
const giro = () => new Promise((ok) => setImmediate(ok));

/**
 * Il cliente vero col processo in memoria. `alSecondoControllo` gira durante la seconda lettura dell'impronta del PRIMO avvio (che dura finché la prova non la
 * sblocca); `allInizializza` quando il primo aiutante riceve `initialize`, prima della risposta. `byteAlSecondo` cambia il binario letto al secondo controllo.
 */
function cliente({ alSecondoControllo = null, allInizializza = null, byteAlSecondo = null, riavvioRotto = false } = {}) {
  const ambiente = { [VARIABILE]: '1' };
  const avvii = []; const processi = []; const righe = [];
  let letture = 0;
  const leggi = async () => {
    letture += 1;
    if (letture === 2) {
      if (alSecondoControllo) { alSecondoControllo(); await giro(); await giro(); } // il secondo controllo dura: 51 MB da leggere e sommare
      if (byteAlSecondo) return byteAlSecondo;
    }
    return BYTE;
  };
  const avvia = (_exe, args) => {
    avvii.push(args);
    if (riavvioRotto && avvii.length > 1) throw new Error('avvio finto fallito');
    const f = processoAiutanteInMemoria();
    if (allInizializza && processi.length === 0) {
      const scrivi = f.stdin.write.bind(f.stdin);
      f.stdin.write = (riga, ...resto) => { if (/"method":"initialize"/u.test(String(riga))) allInizializza(); return scrivi(riga, ...resto); };
    }
    processi.push(f);
    return f;
  };
  const a = creaAiutanteMcp({ exe: 'C:/finto/cua-driver.exe', improntaAttesa: IMPRONTA, leggi, avvia, ambiente, registro: (r) => righe.push(r) });
  const segnoSpento = () => { delete ambiente[VARIABILE]; a.segnoCambiato(); };
  return { a, avvii, processi, righe, segnoSpento, ambienteAcceso: () => { ambiente[VARIABILE] = '1'; } };
}
const strumenti = (p) => p.ricevute.map((x) => x.nome);

test('GARA-01 il segno si spegne durante il secondo controllo dell\'impronta: apri riesce, mai «not available», e la chiamata dopo trova il cursore dell\'aiutante', async () => {
  const c = cliente({ alSecondoControllo: () => c.segnoSpento() });
  const r = await c.a.apri();
  assert.deepEqual(r, { ok: true }, `apri ha risposto ${JSON.stringify(r)}: l'attrezzo darebbe al modello «${NON_DISPONIBILE.slice(0, 50)}…»`);
  await giro();
  assert.equal(c.processi[0].chiuso, true, 'l\'aiutante partito senza cursore si chiude appena finito l\'avvio');
  assert.equal(c.a.stato().vivo, false);
  const dopo = await c.a.chiama('list_windows', {});
  assert.equal(dopo.ok, true, JSON.stringify(dopo));
  assert.deepEqual(c.avvii, [['mcp', '--no-overlay'], ['mcp']], 'riaperto col cursore dell\'aiutante');
  assert.deepEqual(strumenti(c.processi[0]), [], 'nessuno strumento sul vecchio aiutante, che non aveva cursore');
  assert.deepEqual(strumenti(c.processi[1]), ['list_windows']);
  assert.equal(c.righe.length, 1, 'una riga nel registro del server');
  c.a.chiudi();
});

test('GARA-02 il segno si spegne durante initialize: l\'avvio finisce, l\'aiutante si chiude SUBITO dopo (prima di ogni strumento), la chiamata dopo ha il cursore', async () => {
  const c = cliente({ allInizializza: () => c.segnoSpento() });
  assert.deepEqual(await c.a.apri(), { ok: true });
  await giro();
  assert.equal(c.processi[0].chiuso, true, 'chiuso al confine dell\'avvio, non alla fine della prima chiamata');
  assert.equal(c.a.stato().vivo, false);
  assert.equal((await c.a.chiama('get_window_state', { window_id: 101 })).ok, true);
  assert.deepEqual(c.avvii, [['mcp', '--no-overlay'], ['mcp']]);
  assert.deepEqual(strumenti(c.processi[0]), [], 'la prima foto dello schermo parte già sull\'aiutante col cursore');
  c.a.chiudi();
});

test('GARA-03 AL CONTRARIO: un altro binario al secondo controllo resta «impronta» anche col segno che si spegne; nessun processo, nessun riavvio', async () => {
  const c = cliente({ alSecondoControllo: () => c.segnoSpento(), byteAlSecondo: Buffer.from('un altro binario') });
  assert.deepEqual(await c.a.apri(), { ok: false, motivo: 'impronta' });
  await giro();
  assert.equal(c.processi[0].ucciso, true, 'il figlio col binario sbagliato si uccide prima di initialize');
  assert.equal(c.a.stato().vivo, false);
  const r = await c.a.chiama('list_windows', {});
  assert.equal(r.errore, 'not-started', 'niente da riaprire: il binario sbagliato non è un cursore perso');
  assert.deepEqual(c.avvii, [['mcp', '--no-overlay']]);
  c.a.chiudi();
});

test('GARA-06 dopo un avvio rifiutato al secondo controllo, l\'avvio buono dopo torna normale: il segno che si spegne a riposo lo chiude SUBITO', async () => {
  const c = cliente({ alSecondoControllo: () => c.segnoSpento(), byteAlSecondo: Buffer.from('un altro binario') });
  assert.deepEqual(await c.a.apri(), { ok: false, motivo: 'impronta' });
  c.ambienteAcceso();
  assert.deepEqual(await c.a.apri(), { ok: true }, 'il binario giusto riparte');
  assert.deepEqual(c.avvii, [['mcp', '--no-overlay'], ['mcp', '--no-overlay']]);
  assert.equal((await c.a.chiama('list_windows', {})).ok, true);
  c.segnoSpento();
  await giro();
  assert.equal(c.processi[1].chiuso, true, 'nessuna chiamata in volo rimasta contata dall avvio rifiutato: si chiude subito');
  assert.equal((await c.a.chiama('list_windows', {})).ok, true);
  assert.deepEqual(c.avvii.at(-1), ['mcp']);
  c.a.chiudi();
});

/* giro 5 della bolla (mutanti a 2 uccisori): lo stesso conto visto da un altro lato. Il segno si spegne a METÀ di una chiamata dell'aiutante buono: la chiamata
   finisce intera, e l'aiutante si chiude al confine di quella chiamata. Se l'avvio rifiutato prima avesse lasciato una chiamata «in volo», non si chiuderebbe più. */
test('GARA-07 dopo un avvio rifiutato al secondo controllo, il segno che si spegne durante una chiamata chiude l aiutante appena quella chiamata finisce', async () => {
  const c = cliente({ alSecondoControllo: () => c.segnoSpento(), byteAlSecondo: Buffer.from('un altro binario') });
  assert.deepEqual(await c.a.apri(), { ok: false, motivo: 'impronta' });
  c.ambienteAcceso();
  assert.deepEqual(await c.a.apri(), { ok: true });
  const inVolo = c.a.chiama('list_windows', {});
  c.segnoSpento(); // la chiamata è partita: non si tronca
  assert.equal(c.processi[1].chiuso, false, 'mai a metà chiamata');
  assert.equal((await inVolo).ok, true, 'la chiamata finisce intera');
  await giro();
  assert.equal(c.processi[1].chiuso, true, 'chiuso al confine della chiamata');
  assert.equal((await c.a.chiama('list_windows', {})).ok, true);
  assert.deepEqual(c.avvii.at(-1), ['mcp'], 'riaperto col cursore dell aiutante');
  c.a.chiudi();
});

/* il compito intero, attraverso l'attrezzo e il ciclo veri */
function sessione(risposte) {
  const eventi = []; let n = 0;
  return {
    eventi,
    valore: {
      testoDellaPersona: 'Apri il Blocco note e scrivi ciao', sessionId: 's-gara',
      chiediModello: async () => { const r = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(r), usage: { prompt_tokens: 10, completion_tokens: 5 } }; },
      emetti: (nome, dati) => eventi.push({ nome, dati }),
    },
  };
}
const esegui = (ospite, s) => ospite(NOME_COMPUTER_USE, { task: 'type hello in Notepad' },
  { fase: 'esegui', toolCallId: 'call-gara', segnale: new AbortController().signal, livelloAccesso: 'accesso-pieno', sessione: s.valore });
const SCRIVI = { actions: [{ type: 'type', ref: 'e1', text: 'ciao' }] };

test('GARA-04 compito intero col segno spento durante il secondo controllo: il compito finisce sul cursore dell\'aiutante, il modello non legge mai «not available»', async () => {
  const c = cliente({ alSecondoControllo: () => c.segnoSpento() });
  const s = sessione([SCRIVI, { done: { success: true, note: 'typed' } }]);
  const r = await esegui(creaOspiteComputerUse({ aiutante: c.a, ridimensiona: null }), s);
  assert.equal(r.ok, true, r.testo);
  assert.doesNotMatch(r.testo, /not available on this computer/u);
  assert.match(r.testo, /^Computer use finished: succeeded/u);
  assert.deepEqual(c.avvii, [['mcp', '--no-overlay'], ['mcp']]);
  assert.deepEqual(strumenti(c.processi[0]), [], 'nessuna azione senza cursore');
  assert.ok(strumenti(c.processi[1]).includes('type_text'), 'la scrittura sul nuovo aiutante');
  c.a.chiudi();
});

test('GARA-05 segno spento durante il secondo controllo e riavvio che fallisce: il compito si ferma con la frase del cursore, mai «not available», nessuna azione', async () => {
  const c = cliente({ alSecondoControllo: () => c.segnoSpento(), riavvioRotto: true });
  const s = sessione([SCRIVI, { done: { success: true, note: 'typed' } }]);
  const r = await esegui(creaOspiteComputerUse({ aiutante: c.a, ridimensiona: null }), s);
  assert.equal(r.ok, false, r.testo);
  assert.match(r.testo, /^Computer use stopped: the helper's cursor could not be put back on the screen/u, r.testo);
  assert.doesNotMatch(r.testo, /not available on this computer/u);
  assert.equal(c.processi.flatMap((p) => p.ricevute).filter((x) => x.nome === 'type_text').length, 0);
  const fine = s.eventi.filter((e) => e.nome === EVENTI.esito || e.nome === EVENTI.fermato);
  assert.equal(fine.length, 1);
  assert.equal(fine[0].dati.assenza, 'cursore');
  c.a.chiudi();
});
