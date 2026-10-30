/*
 * BUSTA-01..10 (owner 29/10/2026, «Toglierla dalla risposta»). Un modello piccolo (Llama-3.2-1B locale, Mobile 22/10, sessioni
 * 476ec8d3 e 7415a703) ricopia nella SUA risposta la riga d'apertura del confine dei dati, `<<<TALOS_DATA id=… from="…">>>`, che
 * TALOS mette intorno ai risultati degli attrezzi; a schermo si vedeva, e tornava nella storia del giro dopo. Nessun concorrente
 * lo gestisce (Hermes avvolge solo web, browser e MCP: `agent/tool_dispatch_helpers.py:484-485`).
 *
 * Le prove vanno nei due versi: la riga intera della busta esce dal testo del modello; tutto il resto passa IDENTICO byte per
 * byte — una riga che la cita in mezzo a una frase, un blocco di codice che la mostra, un testo che le somiglia ma non è lei.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { creaFiltroConfiniNelTesto, togliRigheDiConfineNelTesto } from '../src/kernel/confine-dati.mjs';
import { consumaFlussoSSE } from '../src/kernel/talosHarness.mjs';

function rispostaStreaming(eventi) {
  const completi = eventi.includes('[DONE]') ? eventi : [...eventi, '[DONE]'];
  const bytes = new TextEncoder().encode(completi.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join(''));
  return { ok: true, status: 200, body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) };
}
/** Il filtro a flusso su una lista di pezzi: il testo che esce, pezzo per pezzo e alla chiusura. */
function aPezzi(lista) {
  const filtro = creaFiltroConfiniNelTesto();
  let testo = '';
  for (const p of lista) testo += filtro.scrivi(p);
  return testo + filtro.chiudi();
}
const APRE = '<<<TALOS_DATA id=0123456789ab from="read">>>';
const CHIUDE = '<<<END_TALOS_DATA id=0123456789ab>>>';

describe('BUSTA — le righe del confine copiate dal modello', () => {
  it('BUSTA-01 la riga d\'apertura in testa alla risposta esce, il resto resta', () => {
    assert.equal(togliRigheDiConfineNelTesto(`${APRE}\nEcco il file.`), 'Ecco il file.');
  });

  it('BUSTA-02 apertura e chiusura, anche spaiate e in mezzo, escono con il loro a capo', () => {
    assert.equal(togliRigheDiConfineNelTesto(`Prima.\n${APRE}\ncontenuto\n${CHIUDE}\nDopo.`), 'Prima.\ncontenuto\nDopo.');
    assert.equal(togliRigheDiConfineNelTesto(`Fine.\n${CHIUDE}`), 'Fine.\n');
  });

  it('BUSTA-03 a flusso, con la riga spezzata in pezzi qualunque, esce lo stesso testo del testo intero', () => {
    const intero = `${APRE}\nEcco: {"name":"scrivi"}\n${CHIUDE}\nfatto`;
    for (const taglio of [1, 3, 7, 16, 41]) {
      const pezzi = [];
      for (let i = 0; i < intero.length; i += taglio) pezzi.push(intero.slice(i, i + taglio));
      assert.equal(aPezzi(pezzi), togliRigheDiConfineNelTesto(intero), `pezzi da ${taglio}`);
      assert.equal(aPezzi(pezzi), 'Ecco: {"name":"scrivi"}\nfatto');
    }
  });

  it('BUSTA-04 al contrario: un testo normale passa identico, byte per byte', () => {
    const t = 'Ciao!\n\n- uno\n- due\n<<< non è una busta\n`<<<TALOS_DATA` si cita così\n';
    assert.equal(togliRigheDiConfineNelTesto(t), t);
    assert.equal(aPezzi([...t]), t);
  });

  it('BUSTA-05 al contrario: la busta citata DENTRO una frase resta (non è una riga intera)', () => {
    const t = `Il motore scrive ${APRE} prima dei dati.`;
    assert.equal(togliRigheDiConfineNelTesto(t), t);
  });

  it('BUSTA-06 al contrario: dentro un blocco di codice resta, anche come riga intera', () => {
    const t = `Così appare:\n\`\`\`\n${APRE}\ndati\n${CHIUDE}\n\`\`\`\nFine.`;
    assert.equal(togliRigheDiConfineNelTesto(t), t);
    assert.equal(aPezzi([...t]), t);
  });

  it('BUSTA-06b al contrario: un blocco aperto da ~~~ non si chiude con tre apici inversi (CommonMark), e la busta dentro resta', () => {
    const t = `Esempio:\n~~~markdown\n\`\`\`\n${APRE}\n\`\`\`\n~~~\nFine.`;
    assert.equal(togliRigheDiConfineNelTesto(t), t);
    assert.equal(aPezzi([...t]), t);
    const lungo = `\`\`\`\`\n\`\`\`\n${APRE}\n\`\`\`\`\n${APRE}\nok`;
    assert.equal(togliRigheDiConfineNelTesto(lungo), `\`\`\`\`\n\`\`\`\n${APRE}\n\`\`\`\`\nok`, 'chiude solo un recinto lungo almeno quanto quello che ha aperto');
    assert.equal(aPezzi([...lungo]), `\`\`\`\`\n\`\`\`\n${APRE}\n\`\`\`\`\nok`, 'anche un carattere alla volta: il recinto si chiude, e la riga dopo il blocco esce');
    const conInfo = `\`\`\`\n\`\`\`js\n${APRE}\n\`\`\`\nfine`;
    assert.equal(togliRigheDiConfineNelTesto(conInfo), conInfo, 'una riga con un\'info dopo il recinto non chiude il blocco (CommonMark)');
  });

  it('BUSTA-07 al contrario: un codice che non ha la forma esatta (non 12 cifre esadecimali) resta', () => {
    for (const riga of ['<<<TALOS_DATA id=xyz>>>', '<<<TALOS_DATA id=0123456789>>>', '<<<TALOS_DATA id=0123456789ab', 'prima <<<TALOS_DATA id=0123456789ab>>>']) {
      assert.equal(togliRigheDiConfineNelTesto(`${riga}\nok`), `${riga}\nok`, riga);
    }
  });

  it('BUSTA-08 una riga lunga che comincia come la busta ma non lo è torna testo identico, anche oltre il tetto di attesa', () => {
    const lunga = `<<<TALOS_DATA ${'x'.repeat(5000)}`;
    assert.equal(aPezzi([lunga.slice(0, 200), lunga.slice(200), '\nfine']), `${lunga}\nfine`);
  });

  it('BUSTA-09 a fine risposta una riga della busta senza a capo esce; un pezzo che le somiglia e basta resta', () => {
    assert.equal(aPezzi(['Fatto.\n', CHIUDE]), 'Fatto.\n');
    assert.equal(aPezzi(['Fatto.\n', '<<<TALOS_DA']), 'Fatto.\n<<<TALOS_DA');
  });
});

describe('BUSTA — nel motore (consumaFlussoSSE)', () => {
  it('BUSTA-10 la riga copiata non arriva né allo schermo né alla storia', async () => {
    const visti = [];
    const { scelta } = await consumaFlussoSSE(rispostaStreaming([
      { choices: [{ delta: { content: '<<<TALOS_DATA id=0123456789ab' } }] },
      { choices: [{ delta: { content: ' from="read">>>\nHo letto ' } }] },
      { choices: [{ delta: { content: 'il file.' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]), (e) => visti.push(e));
    assert.equal(scelta.content, 'Ho letto il file.');
    assert.equal(visti.filter((v) => v.tipo === 'testo').map((v) => v.delta).join(''), 'Ho letto il file.');
  });

  it('BUSTA-11 al contrario: senza busta i delta arrivano allo schermo identici', async () => {
    const visti = [];
    const parti = ['Uso ', '`<<<`', ' nel testo.\n', 'Fine.'];
    const { scelta } = await consumaFlussoSSE(rispostaStreaming([
      ...parti.map((content) => ({ choices: [{ delta: { content } }] })),
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]), (e) => visti.push(e));
    assert.equal(scelta.content, parti.join(''));
    assert.equal(visti.filter((v) => v.tipo === 'testo').map((v) => v.delta).join(''), parti.join(''));
  });

  it('BUSTA-12 a fine flusso: ciò che il filtro tratteneva non si perde, e una riga della busta in coda esce', async () => {
    for (const [ultimo, atteso] of [['<<<TALOS_DA', 'Fatto.\n<<<TALOS_DA'], ['<<<END_TALOS_DATA id=0123456789ab>>>', 'Fatto.\n']]) {
      const visti = [];
      const { scelta } = await consumaFlussoSSE(rispostaStreaming([
        { choices: [{ delta: { content: 'Fatto.\n' } }] },
        { choices: [{ delta: { content: ultimo } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]), (e) => visti.push(e));
      assert.equal(scelta.content, atteso, ultimo);
      assert.equal(visti.filter((v) => v.tipo === 'testo').map((v) => v.delta).join(''), atteso, `schermo: ${ultimo}`);
    }
  });
});
