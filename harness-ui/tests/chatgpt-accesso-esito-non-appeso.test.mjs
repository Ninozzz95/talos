/*
 * 13/10/2026 (bugfixer, B1 — segnalato dalla sessione CLI): la promessa `esito` di `creaAccessoChatgpt().inizia()` aspettava
 * solo il ritorno dal browser. Se il tentativo veniva annullato, sostituito da un altro, chiuso dall'uscita o scadeva, l'ascolto
 * si chiudeva ma il ritorno non arrivava più: `esito` restava appesa per sempre (e con lei chi la aspettava).
 * Ora ogni tentativo finisce con un esito dichiarato: `CHATGPT_ACCESSO_ANNULLATO` o `CHATGPT_TENTATIVO_SCADUTO`,
 * con `senzaRitorno: true` (nessuno è tornato dal browser: non c'è una pagina a cui rispondere).
 * ⛔ Ciò che il desktop mostra non cambia: la rotta non pubblica questi esiti in `ultimoEsito` (ROTTE-09).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaAccessoChatgpt } from '../src/chatgpt-accesso.mjs';
import { creaRotteChatgpt } from '../src/chatgpt-rotte.mjs';

const APPESA = Symbol('appesa');
const entro = (promessa, ms = 200) => Promise.race([promessa, new Promise((r) => { setTimeout(() => r(APPESA), ms).unref?.(); })]);

function custodiaInMemoria() {
  const voci = new Map();
  return { voci, leggi: (v) => (voci.has(v) ? structuredClone(voci.get(v)) : null), scrivi: (v, o) => { voci.set(v, structuredClone(o)); }, togli: (v) => { voci.delete(v); } };
}
function ascoltoFinto() {
  let arriva; const risposte = []; let chiuso = false;
  return { porta: 50123, ritorno: new Promise((r) => { arriva = r; }), rispondi: (stato, html) => risposte.push({ stato, html }), chiudi: () => { chiuso = true; },
    arriva: (indirizzo, lingua = 'en') => arriva({ indirizzo, lingua }), risposte, get chiuso() { return chiuso; } };
}
function scena() {
  const ascolti = []; const timer = [];
  const accesso = creaAccessoChatgpt({ custodia: custodiaInMemoria(), fetchDiRete: async () => { throw new Error('nessuna rete attesa'); },
    creaAscoltatore: async () => { const a = ascoltoFinto(); ascolti.push(a); return a; }, pianifica: (fn, ms) => { timer.push({ fn, ms }); return timer.length; }, annulla: () => {} });
  return { accesso, ascolti, timer };
}

test('ACCESSO-ESITO-01 — annullato dalla persona: l’esito arriva, dichiarato, e nessuna pagina viene scritta', async () => {
  const { accesso, ascolti } = scena();
  const { esito } = await accesso.inizia();
  accesso.annulla();
  assert.deepEqual(await entro(esito), { ok: false, codice: 'CHATGPT_ACCESSO_ANNULLATO', codiceOpenAi: null, senzaRitorno: true });
  assert.equal(ascolti[0].chiuso, true);
  assert.deepEqual(ascolti[0].risposte, [], 'nessuno è tornato dal browser: non c è una pagina a cui rispondere');
});

test('ACCESSO-ESITO-02 — scaduto: l’esito arriva e dice che il tempo è finito', async () => {
  const { accesso, timer } = scena();
  const { esito } = await accesso.inizia();
  timer.at(-1).fn();
  assert.deepEqual(await entro(esito), { ok: false, codice: 'CHATGPT_TENTATIVO_SCADUTO', codiceOpenAi: null, senzaRitorno: true });
  assert.equal(accesso.stato().accessoInCorso, false);
});

test('ACCESSO-ESITO-03 — sostituito da un secondo tentativo, o chiuso dall’uscita: il primo esito arriva (annullato); il secondo resta vivo', async () => {
  const { accesso, ascolti } = scena();
  const primo = await accesso.inizia();
  const secondo = await accesso.inizia();
  assert.equal((await entro(primo.esito))?.codice, 'CHATGPT_ACCESSO_ANNULLATO');
  assert.equal(await entro(secondo.esito, 50), APPESA, 'al contrario: un tentativo vivo aspetta ancora il browser');
  assert.equal(ascolti[1].chiuso, false);
  await accesso.esci();
  assert.equal((await entro(secondo.esito))?.codice, 'CHATGPT_ACCESSO_ANNULLATO');
});

test('ACCESSO-ESITO-04, al contrario — un timer vecchio che scatta tardi non chiude e non decide niente del tentativo nuovo', async () => {
  const { accesso, timer } = scena();
  const primo = await accesso.inizia();
  const secondo = await accesso.inizia();
  timer[0].fn();
  assert.equal((await entro(primo.esito))?.codice, 'CHATGPT_ACCESSO_ANNULLATO', 'il primo è stato sostituito, non è scaduto');
  assert.equal(await entro(secondo.esito, 50), APPESA);
  accesso.annulla();
  await secondo.esito;
});

test('ROTTE-09 — ciò che il desktop mostra NON cambia: un tentativo scaduto o annullato non pubblica niente in `ultimoEsito`', async () => {
  const { accesso, timer } = scena();
  const rotta = creaRotteChatgpt({ accesso });
  const stato = async () => (await rotta({ method: 'GET', percorso: '/api/v1/auth/chatgpt/stato' })).dati;
  assert.equal((await rotta({ method: 'POST', percorso: '/api/v1/auth/chatgpt/inizia', corpo: null })).stato, 200);
  timer.at(-1).fn();
  await new Promise((r) => { setTimeout(r, 20); });
  const dopo = await stato();
  assert.equal(dopo.ultimoEsito, null, 'come oggi: nessun esito pubblicato per un tentativo che non è tornato dal browser');
  assert.equal(dopo.accessoInCorso, false);
});
