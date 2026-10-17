/*
 * 15/10/2026 (bugfixer) — revisione avversaria di 14c0a7096 («il titolo automatico si ferma all'ultima parola intera e chiude
 * con «…»»). Le prove passano dalla porta VERA: la funzione del client (`session-item.js`), la regola del suffisso copiata dal
 * sorgente di `app.js` (non riscritta a mano) e la `rinomina` vera del registro, che è chi decide se il titolo arriva.
 *
 * Le ROSSE qui sotto sono difetti; le VERDI dicono ciò che regge (altre lingue, spazi strani).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nomeConSuffisso, titoloDalPrimoMessaggio } from '../frontend/src/components/session-item.js';
import { createSessionRegistry, nomeDerivatoDalCompito } from '../src/session-registry.mjs';
import { preparaEsecuzioneLibera } from '../src/custom-task.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/** La rinomina VERA del server, su una sessione viva (il registro di `session-registry.test.mjs`, ridotto all'osso). */
async function rinominaSulServer(nome) {
  let risolvi;
  const attesa = new Promise((r) => { risolvi = r; });
  let onEvento = null;
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: async (input) => { onEvento = input.onEvento; input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return attesa; },
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
  });
  const { sessionId } = registro.avvia('task-vero');
  const esito = await registro.rinomina(sessionId, nome);
  const salvato = registro.elenca()[0]?.nome ?? null;
  onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); risolvi({ ok: true }); // pulizia
  return { esito, salvato };
}

/** `nomeUnicoSessione` letto dal sorgente di app.js (24892-24902 a 14c0a7096): se cambia lì, cambia qui. */
function nomeUnicoSessioneVero() {
  const sorgente = readFileSync(new URL('../frontend/src/legacy/app.js', import.meta.url), 'utf8');
  const inizio = sorgente.indexOf('  function nomeUnicoSessione(nome, sessionId) {');
  assert.ok(inizio > 0, 'nomeUnicoSessione non trovata in app.js');
  const fine = sorgente.indexOf('\n  }\n', inizio);
  const corpo = sorgente.slice(inizio, fine + 4);
  // eslint-disable-next-line no-new-func
  // 15/10/2026: dalla cura di REV-TITOLO-02 il corpo usa `nomeConSuffisso`, importato in app.js: lo si passa dal modulo vero
  const costruisci = new Function('state', 'nomeConSuffisso', `${corpo}; return nomeUnicoSessione;`);
  return (state) => costruisci(state, nomeConSuffisso);
}

test('REV-TITOLO-01 — [CURATO 15/10, era la regressione di 14c0a7096] un titolo con emoji che il client tiene intero il server lo RIFIUTA: il titolo automatico si perde in silenzio', async () => {
  // TITOLO-05 di 14c0a7096 dichiara giusto tenere intero questo testo («il conteggio giusto è 53»): sono 103 unità UTF-16.
  for (const messaggio of [`ab ${'🚀'.repeat(50)}`, `${'x'.repeat(10)}${'🚀'.repeat(100)}`, `ciao ${'😀'.repeat(40)} come va`]) {
    const titolo = titoloDalPrimoMessaggio(messaggio);
    assert.ok([...titolo].length <= 80, 'premessa: per il client sta nel tetto');
    const { esito, salvato } = await rinominaSulServer(titolo);
    assert.deepEqual(esito, { ok: true }, `il server conta unità UTF-16 (session-registry.mjs:12940, \`pulito.length > 80\`): ${titolo.length} unità ⇒ ${esito.code}; app.js:26766 inghiotte l'errore e la sessione resta «${'...'}» del server`);
    assert.equal(salvato, titolo);
  }
});

test('REV-TITOLO-02 — [CURATO 15/10, era nuovo e cosmetico] con un doppione vivo il titolo tagliato diventa «…-2»: il suffisso finisce DOPO i puntini', () => {
  const titolo = titoloDalPrimoMessaggio(`${'parola '.repeat(20)}fine`); // 144 caratteri ⇒ «parola … parola…», 77 caratteri
  const stato = { sessionSelection: { available: new Map([['altra', { sessionId: 'altra', nome: titolo }]]) } };
  const { nome } = nomeUnicoSessioneVero()(stato)(titolo, 'mia');
  assert.doesNotMatch(nome, /…-\d+$/u, `«${nome.slice(-12)}»: il «-2» va prima dei puntini («parola-2…») o al posto dell'ultima parola`);
});

test('REV-TITOLO-02b — [CURATO 15/10, esisteva già prima di 14c0a7096] un primo messaggio di 79-80 caratteri con un doppione vivo diventa 81-82: il server lo rifiuta e il titolo si perde in silenzio', async () => {
  const messaggio = `${'parola '.repeat(10)}ultima abc`; // 80 caratteri esatti: il client lo tiene intero
  const titolo = titoloDalPrimoMessaggio(messaggio);
  assert.equal([...titolo].length, 80, 'premessa');
  const stato = { sessionSelection: { available: new Map([['altra', { sessionId: 'altra', nome: titolo }]]) } };
  const { nome, cambiato } = nomeUnicoSessioneVero()(stato)(titolo, 'mia');
  assert.equal(cambiato, true, 'premessa: il doppione esiste');
  const { esito } = await rinominaSulServer(nome);
  assert.deepEqual(esito, { ok: true }, `${[...nome].length} caratteri: il server ne tiene 80 (session-registry.mjs:12940) ⇒ ${esito.code}`);
});

test('REV-TITOLO-03 — [CURATO 15/10, era minore] un\'emoji composta (famiglia con ZWJ, bandiera) al confine si spezza: resta un pezzo di glifo prima dei «…»', () => {
  const segmenti = (s) => [...new Intl.Segmenter('it', { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
  for (const messaggio of [`${'x'.repeat(70)}${'👨‍👩‍👧'.repeat(5)}`, `${'y'.repeat(78)}🇮🇹🇮🇹🇮🇹`]) {
    const titolo = titoloDalPrimoMessaggio(messaggio);
    const corpo = segmenti(titolo.replace(/…$/u, ''));
    const originale = segmenti(messaggio);
    assert.deepEqual(corpo, originale.slice(0, corpo.length), `l'ultimo grafema del titolo non è un grafema del messaggio: ${JSON.stringify(corpo.at(-1))} contro ${JSON.stringify(originale[corpo.length - 1])}`);
  }
});

test('REV-TITOLO-04 — REGGE: cinese/giapponese senza spazi si tagliano a 79+«…»; spazio ideografico, NBSP e spazio sottile diventano uno spazio e valgono come confine', () => {
  const cjk = titoloDalPrimoMessaggio('请阅读文件夹中的两个文档并告诉我我的想法在概念上是否有效'.repeat(4));
  assert.equal([...cjk].length, 80); assert.ok(cjk.endsWith('…'));
  assert.ok(cjk.length <= 80, 'CJK di base: un carattere = una unità UTF-16, il server lo accetta');
  const spaziStrani = titoloDalPrimoMessaggio(`${'parola　'.repeat(6)}${'parola '.repeat(6)}${'parola '.repeat(6)}`);
  assert.doesNotMatch(spaziStrani, /[　  ]/u);
  assert.match(spaziStrani, /parola…$/u, 'si ferma a una parola intera');
});

test('REV-TITOLO-04b — [VERDE, da sapere] lo spazio di larghezza zero (U+200B) non è uno spazio per `\\s`: niente confine di parola, taglio secco', () => {
  const titolo = titoloDalPrimoMessaggio(`${'parola​'.repeat(20)}`);
  assert.ok(titolo.endsWith('…'));
  assert.equal([...titolo].length, 80, 'taglio a 79 + «…», non all\'ultima parola');
});

test('REV-TITOLO-05 — [CURATO 15/10] DUE FORME per lo stesso nome, ancora: il server deriva «77+...» a metà parola, il client «…» a parola intera', (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'titolo-rev-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const consegna = 'ciao leggi i due documenti nella cartella , dimmi se la mia idea e concettualmente valida e se ha senso proseguire';
  const { task } = preparaEsecuzioneLibera([], { cartellaLibera: cartella, consegna });
  const delServer = nomeDerivatoDalCompito('libero:full-access', task); // il nome in elenco finché la rinomina non arriva — e per sempre se fallisce
  const delClient = titoloDalPrimoMessaggio(consegna);
  assert.equal(delServer, delClient, `server «${delServer}» · client «${delClient}» (custom-task.mjs:173 e session-registry.mjs:281-285; il commento di nomeDerivatoDalCompito dice ancora «stesso valore di titoloDalPrimoMessaggio del client»)`);
});
