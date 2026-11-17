import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { argomentiMascherati } from '../../src/components/attivita-segmento.js';

/*
 * Voce 74 della lista 0.2.3 (revisore del porto della bolla, 16/11): la riga viva che torna SOTTO la carta (`rigaDelComandoDopoLaCarta`,
 * giro 6 della bolla) deve dire il comando con la MASCHERA dei segreti, come la testa del gruppo e il dettaglio. CU-RIGA-01 (browser)
 * conta le righe e uccide A2 e A4, ma nessuna prova guardava il testo: A1 (la riga senza maschera) e A3 (la riga mascherata più quella
 * senza) restavano vivi. La cura vive dentro l'IIFE di `app.js`, che non si importa: come BC-41 si estraggono le funzioni vere e si
 * eseguono su uno stato finto, con la maschera VERA (`argomentiMascherati`, `forme-di-segreto.mjs`).
 */

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

/** Il corpo di una funzione dichiarata `function nome(`, fino alla graffa che la chiude. */
function corpoFunzione(sorgente, nome) {
  const inizio = sorgente.search(new RegExp(`(async )?function ${nome}\\s*\\(`));
  if (inizio === -1) return null;
  const apertura = sorgente.indexOf('{', inizio);
  let livello = 0;
  for (let i = apertura; i < sorgente.length; i += 1) {
    if (sorgente[i] === '{') livello += 1;
    else if (sorgente[i] === '}') {
      livello -= 1;
      if (livello === 0) return sorgente.slice(inizio, i + 1);
    }
  }
  return null;
}

const NOMI = ['tronca', 'argomentiDaMostrare', 'riassuntoAttrezzoInCorso', 'rigaDelComandoDopoLaCarta', 'chiudiRigaDelComando'];

/** Le funzioni vere della riga viva su uno stato finto: ogni riga che la bolla dell'attesa mostra resta scritta in `mostrate`. */
function banco() {
  const fonti = NOMI.map((nome) => corpoFunzione(APP, nome));
  for (const [i, fonte] of fonti.entries()) assert.ok(fonte, `app.js: function ${NOMI[i]} trovata`);
  const state = { realSession: { chiusaDalServer: false, toolCallNomi: new Map(), attesaBubble: null } };
  const mostrate = [];
  const ridette = [];
  const ambiente = {
    state,
    tr: (chiave, valori = {}) => `${chiave}: ${Object.values(valori).join(' ')}`,
    comeTitolo: (s) => String(s),
    nomeUmanoAttrezzo: (s) => String(s),
    argomentiMascherati,
    mostraAttesaRisposta: (stato, { etichettaData = null, toolCallId = null } = {}) => {
      mostrate.push({ stato, etichettaData, toolCallId });
      state.realSession.attesaBubble = { dataset: { activity: stato, toolCallId: toolCallId ?? '' } };
    },
    nascondiAttesaRisposta: () => { state.realSession.attesaBubble = null; },
    ridiciGruppoDi: (id) => { ridette.push(id); },
  };
  const nomiAmbiente = Object.keys(ambiente);
  const crea = new Function(...nomiAmbiente, `${fonti.join('\n')}\nreturn { ${NOMI.join(', ')} };`);
  const f = crea(...nomiAmbiente.map((k) => ambiente[k]));
  const chiamata = (id, comando) => {
    const argomentiParsati = { comando };
    state.realSession.toolCallNomi.set(id, { nome: 'shell', stato: 'running', argomentiParsati, richiestaConsenso: false });
    return argomentiParsati;
  };
  return { f, state, mostrate, ridette, chiamata };
}

/* una chiave finta, solo la forma (come PERM-N04): si compone qui perché nessun file porti la stringa intera */
const SEGRETO = 'AKIA' + 'Q7ZT3XW9PL2MN8RB';
const COMANDO_COL_SEGRETO = `set AWS_ACCESS_KEY_ID=${SEGRETO} && aws s3 ls`;

test('CU-RIGA-02 — la riga viva che torna sotto la carta dice il comando con la maschera: il segreto mai, il resto sì', () => {
  const b = banco();
  const argomenti = b.chiamata('cu-1', COMANDO_COL_SEGRETO);
  b.f.rigaDelComandoDopoLaCarta('cu-1');
  const riga = b.mostrate.at(-1);
  assert.equal(riga?.stato, 'comando', 'la riga viva del comando c è');
  assert.equal(riga.toolCallId, 'cu-1');
  assert.doesNotMatch(riga.etichettaData, new RegExp(SEGRETO, 'u'), `la riga viva sotto la carta non dice il segreto: ${riga.etichettaData}`);
  assert.match(riga.etichettaData, /\[redacted\]/u, 'al suo posto la maschera');
  assert.match(riga.etichettaData, /aws s3 ls/u, 'il resto del comando resta leggibile');
  assert.equal(riga.etichettaData, b.f.riassuntoAttrezzoInCorso('shell', argomentiMascherati(argomenti)), 'la stessa riga della testa del gruppo');
  assert.deepEqual(b.ridette, ['cu-1'], 'la testa del gruppo si ridice dopo');
  /* al contrario: un comando senza segreti si legge tale e quale */
  const c = banco();
  c.chiamata('cu-2', 'npm test');
  c.f.rigaDelComandoDopoLaCarta('cu-2');
  assert.match(c.mostrate.at(-1)?.etichettaData ?? '', /npm test/u);
});

test('CU-RIGA-03 — una riga viva sola per chiamata, e nessuna riga mostrata in nessun momento dice il segreto (anche quando la riga passa alla seconda chiamata del giro)', () => {
  const b = banco();
  b.chiamata('cu-a', 'npm test');
  b.chiamata('cu-b', COMANDO_COL_SEGRETO);
  b.f.rigaDelComandoDopoLaCarta('cu-a');
  b.f.chiudiRigaDelComando('cu-a'); // R21: finita la prima, la riga viva va all'altra che gira ancora
  const righeComando = b.mostrate.filter((r) => r.stato === 'comando');
  assert.deepEqual(righeComando.map((r) => r.toolCallId), ['cu-a', 'cu-b'], `una riga per chiamata, nell'ordine: ${JSON.stringify(righeComando)}`);
  for (const r of b.mostrate) assert.doesNotMatch(String(r.etichettaData ?? ''), new RegExp(SEGRETO, 'u'), `nessuna riga mostrata dice il segreto: ${JSON.stringify(r)}`);
  assert.match(righeComando[1].etichettaData, /\[redacted\]/u, 'la riga della seconda chiamata, mascherata');
  assert.equal(b.state.realSession.attesaBubble?.dataset.toolCallId, 'cu-b', 'la riga viva resta alla seconda chiamata');
  /* direttamente dopo la carta: una sola riga, mai una seconda accanto */
  const c = banco();
  c.chiamata('cu-c', COMANDO_COL_SEGRETO);
  c.f.rigaDelComandoDopoLaCarta('cu-c');
  assert.equal(c.mostrate.length, 1, `una riga sola dopo la carta: ${JSON.stringify(c.mostrate)}`);
  assert.doesNotMatch(String(c.mostrate[0]?.etichettaData ?? ''), new RegExp(SEGRETO, 'u'));
});
