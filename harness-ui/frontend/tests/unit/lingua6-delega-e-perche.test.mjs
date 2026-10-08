/*
 * LINGUA-6 (08/10/2026, bugfixer) — due testi visti dal vivo sulla 4176:
 *  - la riga della delega mostrava la frase di TALOS al MODELLO, cruda: «🧩 Sotto-agente: Sub-agent 60eb0e69-… started in the
 *    background…» (inglese e un id nell'interfaccia italiana). Ora la riga dice lo stato, nelle due lingue;
 *  - il perché della carta d'approvazione: «Chiede perché «scrittura di un file» ha il cancello «Chiedi conferma»…» — nome
 *    minuscolo e una parola interna. Ora: «la regola di «Scrittura di un file» è «Chiedi conferma»», come nella finestra dei permessi.
 * ⛔ La frase della delega è un CONTRATTO col kernel: la prova la costruisce dal sorgente vero dell'orchestratore, così se il kernel
 *   la cambia questa prova diventa rossa invece di lasciare la riga di nuovo cruda in silenzio.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import testiApp from '../../src/i18n/testi/app.js';
import testiModello from '../../src/i18n/testi/modello.js';

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const ORCHESTRATORE = readFileSync(new URL('../../../src/subagent-orchestrator.mjs', import.meta.url), 'utf8');
const KERNEL = readFileSync(new URL('../../../src/kernel/talosHarness.mjs', import.meta.url), 'utf8');

const riconoscitore = () => {
  const riga = APP.match(/  const DELEGA_AVVIATA = [^\n]*\n/)?.[0];
  assert.ok(riga, 'DELEGA_AVVIATA esiste');
  return vm.runInNewContext(`${riga.replace('const DELEGA_AVVIATA =', 'r =')}; r`, {});
};

test('L6-01 CONTRATTO: la frase dell’orchestratore, nelle due modalità, è riconosciuta — e una frase qualunque no', () => {
  const modello = ORCHESTRATORE.match(/riassunto: (`Sub-agent \$\{figlioId\} started in the background[^`]*`)/u)?.[1];
  assert.ok(modello, 'la frase «avviato» sta ancora nell’orchestratore, nella forma attesa');
  const DELEGA_AVVIATA = riconoscitore();
  /* C2b (08/10/2026, desktop): la ricevuta può dire anche come è partito l'agente e su quale modello chiesto — frasi in più DOPO
     quella riconosciuta. Si provano tutte e due le forme: senza (la CLI, o Coordinazione assente) e con. */
  const aggiunte = [{ comePartito: '', suQualeModello: '' },
    { comePartito: ' It started on its own (Coordination is on in this conversation).', suQualeModello: ' It runs on z-ai/glm-5.3-flash, as the person asked.' }];
  for (const [modalita, atteso] of [['lettura', 'read-only'], ['modifica', 'with the parent\'s permissions']]) {
    for (const extra of aggiunte) {
      const frase = vm.runInNewContext(modello, { figlioId: '60eb0e69-1234-4abc-9def-0123456789ab', modalita, ...extra });
      const preso = DELEGA_AVVIATA.exec(frase);
      assert.ok(preso, `riconosciuta (${modalita}${extra.comePartito ? ', con la ricevuta di C2b' : ''}): ${frase.slice(0, 60)}`);
      assert.equal(preso[1], atteso);
    }
  }
  // al contrario: il riassunto di una figlia conclusa è contenuto suo, anche se parla di sotto-agenti
  for (const libera of ['Sub-agent finished: wrote 3 files.', 'I started the background job.', 'Sub-agent x started in the background.']) {
    assert.equal(DELEGA_AVVIATA.exec(libera), null, libera);
  }
  // le altre due frasi del kernel che la riga traduce esistono ancora così
  assert.match(KERNEL, /esito = `delegation failed: \$\{/u);
  assert.match(KERNEL, /'\(no summary returned\)'/u);
});

test('L6-02 la riga della delega usa le chiavi, che esistono nelle due lingue e non portano né inglese né id nell’italiano', () => {
  assert.match(APP, /const avviata = DELEGA_AVVIATA\.exec\(testoEsito \|\| ''\);/u);
  assert.match(APP, /tr\(avviata\[1\] === 'read-only' \? 'app\.toolOutcome\.subAgentStartedReadOnly' : 'app\.toolOutcome\.subAgentStarted'\)/u);
  assert.match(APP, /\/\^delegation failed: \/\.test\(testoEsito \|\| ''\)\) return tr\('app\.toolOutcome\.delegationFailed'\)/u);
  for (const k of ['toolOutcome.subAgentStarted', 'toolOutcome.subAgentStartedReadOnly', 'toolOutcome.subAgentNoSummary', 'toolOutcome.delegationFailed']) {
    assert.equal(typeof testiApp.en[k], 'string', `en ${k}`);
    assert.equal(typeof testiApp.it[k], 'string', `it ${k}`);
    assert.doesNotMatch(testiApp.it[k], /Sub-agent|started|background|\{/u, `it ${k}: «${testiApp.it[k]}»`);
  }
});

test('L6-03 il perché della carta: «la regola di …», niente «cancello», il nome come nella finestra dei permessi', () => {
  for (const lingua of ['it', 'en']) {
    for (const testo of [testiApp[lingua]['approval.whyToolGate'], testiModello[lingua]['chat.asksWhyWritingA']]) {
      assert.doesNotMatch(testo, /cancello|\bgate\b/iu, `${lingua}: «${testo}»`);
    }
  }
  assert.doesNotMatch(testiModello.en['chat.asksWhyWritingA'], /[«»]/u, 'in inglese le virgolette inglesi');
  assert.match(APP, /tr\('app\.approval\.whyToolGate', \{ attrezzo: comeTitolo\(nomeUmanoAttrezzo\(azione\.tipo\)\), politica \}\)/u);
  const HTML = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8');
  assert.ok(HTML.includes(`>${testiModello.it['chat.asksWhyWritingA']}</p>`), 'il modello HTML dice la stessa frase del dizionario');
});
