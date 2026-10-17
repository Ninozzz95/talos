/*
 * ⭐⭐⭐ /goal G6 — LA SECONDA PORTA dell'obiettivo (owner 15/10/2026): `goal_status`, `goal_create`, `goal_update` del kernel e il loro
 * ospite (`src/obiettivo/per-il-modello.mjs`). Decisioni dell'owner: «come Codex, anche fatto» (ma «fatto» fa solo partire il
 * controllo), la carta dei controlli sempre tranne in Accesso pieno, «bloccato» = pausa col motivo. Nei due versi.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaOspiteObiettivo, testoStatoObiettivo, GIRI_PRIMA_DI_BLOCCATO } from '../src/obiettivo/per-il-modello.mjs';
import { nuovoObiettivo } from '../src/obiettivo/stato.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { conStore, conversazioneFerma, obiettivoScrittoDaUnAltroProcesso, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const ADESSO = '2026-10-15T10:00:00.000Z';
const OBIETTIVO = nuovoObiettivo({ testo: 'make the tests pass', id: 'ob-11111111-2222-4333-8444-555555555555', adesso: ADESSO }).obiettivo;
const CRITERI = [
  { text: 'The tests pass', type: 'command', command: 'npm test' },
  { text: 'The README has an install section', type: 'file', path: 'README.md', fact: 'contains', search: '## Install' },
  { text: 'The install steps read well', type: 'judgement' },
];

function ospite({ obiettivo = null, giroDellaPersona = true, accessoPieno = false } = {}) {
  const fatti = { imposta: [], pausa: [], rivendicato: 0 };
  const o = creaOspiteObiettivo({
    leggi: () => obiettivo,
    imposta: async (testo, criteri) => { fatti.imposta.push({ testo, criteri }); return { ok: true }; },
    pausa: async (motivo) => { fatti.pausa.push(motivo); return { ok: true }; },
    rivendica: () => { fatti.rivendicato += 1; },
    contesto: () => ({ giroDellaPersona, accessoPieno }),
  });
  return { o, fatti };
}

test('PORTA-01 — goal_create: la carta porta obiettivo e controlli tradotti; in Accesso pieno niente carta; l\'esecuzione salva quei controlli', async () => {
  const { o, fatti } = ospite();
  const anteprima = await o('goal_create', { objective: '  make the tests pass  ', criteria: CRITERI }, { fase: 'anteprima' });
  assert.equal(anteprima.ok, true);
  assert.equal(anteprima.carta, true);
  assert.equal(anteprima.azione.obiettivo.testo, 'make the tests pass');
  assert.deepEqual(anteprima.azione.obiettivo.criteri.map((c) => [c.id, c.verifica.tipo]), [['c1', 'comando'], ['c2', 'file'], ['c3', 'giudizio']]);
  assert.equal(fatti.imposta.length, 0, 'l\'anteprima non scrive');
  const pieno = await ospite({ accessoPieno: true }).o('goal_create', { objective: 'x', criteria: CRITERI }, { fase: 'anteprima' });
  assert.equal(pieno.carta, false, 'Accesso pieno non chiede mai (owner 15/10)');
  const fatto = await o('goal_create', { objective: 'make the tests pass', criteria: CRITERI }, { fase: 'esegui' });
  assert.equal(fatto.ok, true);
  assert.equal(fatti.imposta[0].testo, 'make the tests pass');
  assert.deepEqual(fatti.imposta[0].criteri[1].verifica, { tipo: 'file', percorso: 'README.md', fatto: 'contiene', testo: '## Install' });
  const senza = await ospite().o('goal_create', { objective: 'x' }, { fase: 'esegui' });
  assert.equal(senza.ok, true);
  assert.match(senza.testo, /no checks, so a judge weighs the whole goal text/u);
});

test('PORTA-02 AL CONTRARIO — goal_create si rifiuta: giro non aperto dalla persona, obiettivo non finito, testo vuoto, controllo storto (con la posizione)', async () => {
  const cosa = [
    [{ giroDellaPersona: false }, { objective: 'x' }, /only when the person asks for it in their own message/u],
    [{ obiettivo: OBIETTIVO }, { objective: 'x' }, /already has an unfinished goal \(attivo\)/u],
    [{}, { objective: '   ' }, /"objective": goal-text-empty/u],
    [{}, { objective: 'x', criteria: [CRITERI[0], { text: 'bad', type: 'command', command: 'npm test || true' }] }, /criterion 2: criterion-command-not-attributable/u],
    [{}, { objective: 'x', criteria: 'npm test' }, /"criteria" must be a list/u],
  ];
  for (const [opzioni, argomenti, atteso] of cosa) {
    const { o, fatti } = ospite(opzioni);
    for (const fase of ['anteprima', 'esegui']) {
      const esito = await o('goal_create', argomenti, { fase });
      assert.equal(esito.ok, false, `${fase} ${JSON.stringify(argomenti)}`);
      assert.match(esito.messaggio, atteso);
    }
    assert.equal(fatti.imposta.length, 0, 'niente si scrive');
  }
  /* un obiettivo FATTO non ferma la creazione di uno nuovo */
  const fatto = { ...OBIETTIVO, stato: 'fatto' };
  assert.equal((await ospite({ obiettivo: fatto }).o('goal_create', { objective: 'x' }, { fase: 'anteprima' })).ok, true);
});

test('PORTA-03 — goal_update: «complete» fa solo partire il controllo; «paused» solo se lo chiede la persona; «blocked» col motivo dopo 3 giri', async () => {
  const conGiri = (giri) => ({ ...OBIETTIVO, ciclo: { giri, token: 0, senzaProgresso: 0 } });
  /* complete: niente pausa, niente stato cambiato — si segna che l'ha detto */
  const c = ospite({ obiettivo: OBIETTIVO });
  const completo = await c.o('goal_update', { status: 'complete' }, { fase: 'esegui' });
  assert.equal(completo.ok, true);
  assert.match(completo.testo, /done only if they all agree/u);
  assert.equal(c.fatti.rivendicato, 1);
  assert.equal(c.fatti.pausa.length, 0);
  /* paused */
  const p = ospite({ obiettivo: OBIETTIVO });
  assert.equal((await p.o('goal_update', { status: 'paused' }, { fase: 'esegui' })).ok, true);
  assert.deepEqual(p.fatti.pausa, [{ tipo: 'persona' }]);
  const pNo = ospite({ obiettivo: OBIETTIVO, giroDellaPersona: false });
  assert.match((await pNo.o('goal_update', { status: 'paused' }, { fase: 'anteprima' })).messaggio, /only when the person asks/u);
  /* blocked */
  const presto = ospite({ obiettivo: conGiri(GIRI_PRIMA_DI_BLOCCATO - 2) });
  assert.match((await presto.o('goal_update', { status: 'blocked', reason: 'the API key is missing' }, { fase: 'anteprima' })).messaggio, /this is turn 2/u);
  const senzaMotivo = ospite({ obiettivo: conGiri(5) });
  assert.match((await senzaMotivo.o('goal_update', { status: 'blocked' }, { fase: 'anteprima' })).messaggio, /needs a "reason"/u);
  const b = ospite({ obiettivo: conGiri(GIRI_PRIMA_DI_BLOCCATO - 1), giroDellaPersona: false });
  assert.equal((await b.o('goal_update', { status: 'blocked', reason: '  the API key\n is missing  ' }, { fase: 'esegui' })).ok, true);
  assert.deepEqual(b.fatti.pausa, [{ tipo: 'bloccato', dettaglio: 'the API key is missing' }], '«bloccato» non vuole il giro della persona');
});

test('PORTA-04 AL CONTRARIO — goal_update su niente, su un obiettivo non attivo, o con uno stato che non esiste (riprendere non si può)', async () => {
  assert.match((await ospite().o('goal_update', { status: 'complete' }, { fase: 'anteprima' })).messaggio, /there is no goal/u);
  assert.match((await ospite({ obiettivo: { ...OBIETTIVO, stato: 'in-pausa' } }).o('goal_update', { status: 'complete' }, { fase: 'anteprima' })).messaggio, /only the person can resume it/u);
  for (const status of ['resumed', 'active', '', undefined]) {
    assert.match((await ospite({ obiettivo: OBIETTIVO }).o('goal_update', { status }, { fase: 'anteprima' })).messaggio, /needs status "complete", "blocked" or "paused"/u);
  }
});

test('PORTA-05 — goal_status: fatti di TALOS (stato, motivo, conti, esito di ogni controllo); senza obiettivo lo dice', async () => {
  assert.equal(testoStatoObiettivo(null), 'No goal is set in this conversation.');
  const conVerifica = { ...OBIETTIVO, stato: 'in-pausa', motivo: { tipo: 'bloccato', dettaglio: 'no key' }, ciclo: { giri: 4, token: 1200, senzaProgresso: 1 },
    contratto: { criteri: [{ id: 'c1', testo: 'The tests pass', verifica: { tipo: 'comando', comando: 'npm test', uscita: 0 } }] },
    verifica: { verdetti: [{ id: 'c1', esito: 'rosso', motivo: { tipo: 'exit-code' } }] } };
  const testo = testoStatoObiettivo(conVerifica);
  assert.match(testo, /Status: in-pausa \(bloccato: no key\)/u);
  assert.match(testo, /Turns: 4\. Tokens: 1200\./u);
  assert.match(testo, /- c1 \[command\] The tests pass: rosso \(exit-code\)/u);
});

/* ── il kernel: si offre solo con l'ospite e al root; la carta passa dal canale delle approvazioni ── */
function cartella(t) { const c = mkdtempSync(join(tmpdir(), 'talos-g6-')); t.after(() => rimuoviCartellaDiProva(c)); return c; }
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } });
async function giroCol(t, { chiamate, ...extra }) {
  const offerti = [];
  let n = 0;
  const r = await talosLavora({
    cartella: cartella(t), task: { consegna: 'ciao' }, modello: 'x', chiave: 'y', strumentiEstesi: ['goal_status', 'goal_create', 'goal_update'], ...extra,
    fetchDiRete: async (_url, opzioni) => {
      offerti.push((JSON.parse(opzioni.body).tools ?? []).map((a) => a.function?.name));
      return { ok: true, status: 200, text: async () => '', json: async () => ({
        choices: [{ message: n < chiamate.length ? { role: 'assistant', content: null, tool_calls: [chiamate[n++]] } : { role: 'assistant', content: 'fatto' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
    },
  });
  return { r, offerti, esito: (id) => r.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '' };
}

test('PORTA-KERNEL-01 — gli attrezzi si offrono solo con l\'ospite, e in Piano solo la lettura', async (t) => {
  const finto = async () => ({ ok: true, carta: false });
  const conOspite = await giroCol(t, { chiamate: [], onObiettivoFn: finto });
  for (const nome of ['goal_status', 'goal_create', 'goal_update']) assert.ok(conOspite.offerti[0].includes(nome), nome);
  const senza = await giroCol(t, { chiamate: [] });
  assert.ok(!senza.offerti[0].some((x) => String(x).startsWith('goal_')), 'senza ospite non si offrono (la CLI oggi)');
  const piano = await giroCol(t, { chiamate: [], onObiettivoFn: finto, modalitaOperativa: 'piano' });
  assert.ok(piano.offerti[0].includes('goal_status'));
  assert.ok(!piano.offerti[0].includes('goal_create') && !piano.offerti[0].includes('goal_update'), 'in Piano niente che cambi');
});

test('PORTA-KERNEL-02 — goal_create passa dalla carta: approvata ⇒ esegue; rifiutata ⇒ REFUSED e niente scritto', async (t) => {
  for (const [nome, approva] of [['approvata', true], ['rifiutata', false]]) {
    const fasi = [];
    const azioni = [];
    const onObiettivoFn = async (_nomeAttrezzo, argomenti, { fase }) => {
      fasi.push(fase);
      return fase === 'anteprima' ? { ok: true, carta: true, azione: { obiettivo: { testo: argomenti.objective, criteri: [] } } } : { ok: true, testo: 'Goal set.' };
    };
    const { esito } = await giroCol(t, { chiamate: [chiama('g', 'goal_create', { objective: 'make the tests pass' })], onObiettivoFn,
      chiediApprovazioneFn: async (azione) => { azioni.push(azione); return approva; } });
    assert.equal(azioni.length, 1, `${nome}: una carta`);
    assert.equal(azioni[0].tipo, 'goal_create');
    assert.equal(azioni[0].obiettivo.testo, 'make the tests pass', `${nome}: la carta porta l'obiettivo`);
    if (approva) { assert.deepEqual(fasi, ['anteprima', 'esegui']); assert.equal(esito('g'), 'Goal set.'); }
    else { assert.deepEqual(fasi, ['anteprima']); assert.match(esito('g'), /^REFUSED\./u); }
  }
});

/* ── il registro vero: la madre ha la porta, il «giro della persona» è il suo messaggio ── */
test('PORTA-REG-01 — sul registro: il giro della persona crea l\'obiettivo; un giro che riparte senza un suo messaggio non mette in pausa', async (t) => conStore(t, async (cartellaStore) => {
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
  const sessionId = await conversazioneFerma(b);
  b.registro.resume(sessionId, 'set a goal: make the tests pass');
  await passo();
  const input = b.giri.at(-1).input;
  assert.equal(typeof input.onObiettivoFn, 'function', 'la conversazione principale ha la porta');
  const anteprima = await input.onObiettivoFn('goal_create', { objective: 'make the tests pass' }, { fase: 'anteprima' });
  assert.equal(anteprima.ok, true, JSON.stringify(anteprima));
  const fatto = await input.onObiettivoFn('goal_create', { objective: 'make the tests pass' }, { fase: 'esegui' });
  assert.equal(fatto.ok, true, JSON.stringify(fatto));
  assert.equal(b.registro.statoObiettivo(sessionId).obiettivo.testo, 'make the tests pass');
  b.giri.at(-1).concludi([{ role: 'user', content: 'c' }, { role: 'assistant', content: 'ok' }]);
  await passo(); await passo();
  /* un giro che riparte senza un messaggio nuovo della persona: la porta c'è, ma mettere in pausa no */
  b.registro.resume(sessionId, null, []);
  await passo();
  const ripresa = b.giri.at(-1).input;
  assert.notEqual(ripresa, input, 'premessa: è un giro nuovo');
  assert.match((await ripresa.onObiettivoFn('goal_update', { status: 'paused' }, { fase: 'anteprima' })).messaggio, /only when the person asks/u);
}));

test('PORTA-REG-02 — «complete» del modello con le prove rosse: il giro dopo comincia dicendolo; quello dopo ancora no (si dice una volta)', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g6-reg-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 1, enforcement: 'none' }),
    tettiCicloObiettivo: { giri: 50 },
  });
  const aspetta = async (condizione, cosa) => {
    const fino = Date.now() + 5000;
    while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
    assert.fail(`mai successo: ${cosa}`);
  };
  const fine = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'fix the tests', { criteri: [{ testo: 'runs npm test', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  const prima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === prima + 1, 'il giro della persona parte');
  const detto = await b.giri.at(-1).input.onObiettivoFn('goal_update', { status: 'complete' }, { fase: 'esegui' });
  assert.equal(detto.ok, true, JSON.stringify(detto));
  b.giri.at(-1).concludi(fine);
  await aspetta(() => b.giri.length === prima + 2, 'il ciclo riparte');
  const primo = b.giri.at(-1).input.messaggiIniziali.at(-1);
  assert.equal(primo.talosOrigin, 'goal-notice');
  assert.match(primo.content, /^You said the goal was complete, but TALOS's checks do not agree yet\.\n/u);
  assert.match(primo.content, /c1 FAILED/u);
  b.giri.at(-1).concludi(fine);
  await aspetta(() => b.giri.length === prima + 3, 'riparte ancora');
  const secondo = b.giri.at(-1).input.messaggiIniziali.at(-1);
  assert.match(secondo.content, /c1 FAILED/u);
  assert.doesNotMatch(secondo.content, /You said the goal was complete/u, 'senza un «complete» nuovo non si ripete');
  b.registro.pausaObiettivo?.(sessionId);
}));

test('PORTA-REG-03 — owner 15/10 «anche con richiesta naturale il modello deve farla partire»: creato dal modello nel giro della persona, alla fine di QUEL giro il ciclo controlla e riparte', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g6-reg-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const chiamate = [];
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async (riga) => { chiamate.push(riga); return { codice: 1, enforcement: 'none' }; },
    tettiCicloObiettivo: { giri: 50 },
  });
  const aspetta = async (condizione, cosa) => {
    const fino = Date.now() + 5000;
    while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
    assert.fail(`mai successo: ${cosa}`);
  };
  const sessionId = await conversazioneFerma(b);
  const prima = b.giri.length;
  b.registro.resume(sessionId, 'keep working until the tests pass');
  await aspetta(() => b.giri.length === prima + 1, 'il giro della persona parte');
  const creato = await b.giri.at(-1).input.onObiettivoFn('goal_create', { objective: 'make the tests pass', criteria: [{ text: 'The tests pass', type: 'command', command: 'npm test' }] }, { fase: 'esegui' });
  assert.equal(creato.ok, true, JSON.stringify(creato));
  b.giri.at(-1).concludi([{ role: 'user', content: 'c' }, { role: 'assistant', content: 'working on it' }]);
  await aspetta(() => b.giri.length === prima + 2, 'il ciclo controlla e riparte dopo il giro in cui è nato');
  assert.deepEqual(chiamate, ['npm test'], 'le prove sono girate');
  const ripresa = b.giri.at(-1).input;
  assert.equal(ripresa.task.origine, 'obiettivo');
  assert.match(ripresa.messaggiIniziali.at(-1).content, /c1 FAILED/u);
}));

test('PORTA-REG-04 — «Modifica i controlli» sulla carta di goal_create: un no col perché scritto dal server; mai con un sì, mai su un\'altra carta', async (t) => conStore(t, async (cartellaStore) => {
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
  const sessionId = await conversazioneFerma(b);
  b.registro.resume(sessionId, 'set a goal: make the tests pass');
  await passo();
  const input = b.giri.at(-1).input;
  const ricevuti = [];
  t.after(b.registro.iscriviti(sessionId, (e) => ricevuti.push(e)));
  const risposta = input.chiediApprovazioneFn({ tipo: 'goal_create', toolCallId: 'g1', obiettivo: { testo: 'make the tests pass', criteri: [] } });
  const { requestId } = b.registro.domandaInAttesa(sessionId);
  // G6UI-REV-01: l'id è quello dell'obiettivo che la persona ha impostato DAVVERO (la porta HTTP, contratto suo)
  const impostato = await b.registro.impostaObiettivo(sessionId, 'make the tests pass', { criteri: [{ testo: 'runs npm test', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  assert.equal(impostato.ok, true, JSON.stringify(impostato));
  const id = impostato.obiettivo.id;
  assert.equal(b.registro.rispondiApprovazione(sessionId, requestId, false, { obiettivoModificato: 'ob-11111111-2222-4333-8444-555555555555' }).code, 'QUERY_INVALID', 'mai un id che la conversazione non ha');
  assert.equal(b.registro.rispondiApprovazione(sessionId, requestId, true, { obiettivoModificato: id }).code, 'QUERY_INVALID', 'mai con un sì');
  assert.equal(b.registro.rispondiApprovazione(sessionId, requestId, false, { obiettivoModificato: 'non-un-id' }).code, 'QUERY_INVALID', 'solo un id d\'obiettivo');
  assert.equal(b.registro.domandaInAttesa(sessionId)?.requestId, requestId, 'ancora in attesa');
  assert.deepEqual(await b.registro.rispondiApprovazione(sessionId, requestId, false, { obiettivoModificato: id }), { ok: true });
  const esito = await risposta;
  assert.equal(esito.approvato, false);
  assert.match(esito.motivo, /^the person edited the checks and set the goal themselves: do not create it again; call goal_status/u);
  const risolta = ricevuti.filter((e) => e.type === 'ApprovalResolved' && e.requestId === requestId);
  assert.equal(risolta.length, 1);
  assert.equal(risolta[0].motivo, 'modificata-dalla-persona');
  assert.doesNotMatch(JSON.stringify(risolta[0]), /edited the checks/u, 'il testo per il modello non va alla carta');
  // AL CONTRARIO: su una carta che non è goal_create si rifiuta
  void input.chiediApprovazioneFn({ tipo: 'scrivi', toolCallId: 'g2', percorso: 'a.txt' });
  const seconda = b.registro.domandaInAttesa(sessionId).requestId;
  assert.equal(b.registro.rispondiApprovazione(sessionId, seconda, false, { obiettivoModificato: id }).code, 'QUERY_INVALID');
  await b.registro.rispondiApprovazione(sessionId, seconda, false);
}));

test('PORTA-OPT-IN (CLI, 15/10/2026) — la seconda porta dell obiettivo solo se l host la chiede: spenta, il giro non riceve onObiettivoFn; accesa, sì', async (t) => conStore(t, async (cartellaStore) => {
  const spento = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash', obiettiviNellaChat: false });
  const id1 = await conversazioneFerma(spento);
  spento.registro.resume(id1, 'set a goal: make the tests pass');
  await passo();
  assert.equal(typeof spento.giri.at(-1).input.onObiettivoFn, 'undefined', 'off: no goal tools for the model (the kernel neither offers nor runs them)');
  spento.giri.at(-1).concludi([]);
  const acceso = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
  const id2 = await conversazioneFerma(acceso);
  acceso.registro.resume(id2, 'set a goal: make the tests pass');
  await passo();
  assert.equal(typeof acceso.giri.at(-1).input.onObiettivoFn, 'function', 'on (the desktop server): the second door is there');
  acceso.giri.at(-1).concludi([]);
}));

test('NESSUNO-DAVANTI (CLI, 15/10/2026) — una chat avviata senza interfaccia non riceve la carta del piano né l obiettivo, e una domanda si chiude subito; AL CONTRARIO una chat normale li ha', async (t) => conStore(t, async (cartellaStore) => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const cartella = mkdtempSync(join(tmpdir(), 'talos-senza-interfaccia-'));
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
  const senza = b.registro.avviaLibero({ cartellaLibera: cartella, consegna: 'riassumi il README', senzaInterfaccia: true });
  assert.ok(senza.sessionId, JSON.stringify(senza));
  await passo();
  const giro = b.giri.at(-1).input;
  assert.equal(typeof giro.presentaPianoFn, 'undefined', 'no plan card: nobody would approve it');
  assert.equal(typeof giro.onObiettivoFn, 'undefined', 'no goal: nobody would see or stop it');
  const domanda = await Promise.race([giro.chiediDomandaFn([{ id: 'q', question: 'Quale file?', why: 'x', options: [{ label: 'A', description: 'a' }, { label: 'B', description: 'b' }] }], { toolCallId: 'c1', messaggi: [] }), new Promise((r) => setTimeout(() => r('APPESA'), 2000))]);
  assert.notEqual(domanda, 'APPESA', 'a question closes at once, it does not wait for a person');
  b.giri.at(-1).concludi([]);
  const normale = b.registro.avviaLibero({ cartellaLibera: cartella, consegna: 'riassumi il README' });
  await passo();
  assert.equal(typeof b.giri.at(-1).input.presentaPianoFn, 'function', 'a normal chat keeps the plan card');
  assert.equal(typeof b.giri.at(-1).input.onObiettivoFn, 'function');
  b.giri.at(-1).concludi([]);
  void normale;
}));

/* Il ciclo di un obiettivo che l'host sotto prova NON ha creato: lo scrive un altro processo sul giornale e l'host lo rilegge come
   ricarica per l'affitto (resta attivo, GOAL-REG-09). Torna se il ciclo ha lavorato: una chiamata al giudice o un giro in più. */
async function cicloDiUnObiettivoScrittoAltrove(cartellaStore, { sessionId, opzioni }) {
  await obiettivoScrittoDaUnAltroProcesso(cartellaStore, sessionId);
  let giudizi = 0;
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash', ...opzioni,
    chiediAlModelloUnaVoltaFn: async () => { giudizi += 1; throw new Error('banco: nessuna rete'); } });
  await b.registro.ripristina({ soloSessioni: [sessionId], perRicarica: true });
  assert.equal(b.registro.statoObiettivo(sessionId).obiettivo?.stato, 'attivo', 'premessa: l obiettivo scritto altrove arriva attivo');
  b.registro.resume(sessionId, 'go on');
  await passo();
  b.giri.at(-1).concludi([{ role: 'system', content: 's' }, { role: 'user', content: 'go on' }, { role: 'assistant', content: 'done' }]);
  await new Promise((r) => setTimeout(r, 400));
  const giriInPiu = b.giri.length - 1;
  for (const g of b.giri.slice(1)) { try { g.concludi([]); } catch { /* già chiuso */ } }
  return { lavorato: giudizi > 0 || giriInPiu > 0, giudizi, giriInPiu };
}

test('CICLO-OPT-IN (15/10/2026) — in un host senza obiettivi il CICLO non parte nemmeno per un obiettivo già attivo (scritto da un altro processo nello stesso archivio); AL CONTRARIO acceso, sì', async (t) => conStore(t, async (cartellaStore) => {
  for (const [acceso, atteso] of [[false, false], [true, true]]) {
    const scrittore = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' }); // il modello è della conversazione: senza uno vero il giudice non parte
    const sessionId = await conversazioneFerma(scrittore);
    const esito = await cicloDiUnObiettivoScrittoAltrove(cartellaStore, { sessionId, opzioni: { obiettiviNellaChat: acceso } });
    assert.equal(esito.lavorato, atteso, `obiettivi ${acceso ? 'accesi' : 'spenti'}: judge calls ${esito.giudizi}, turns ${esito.giriInPiu}`);
  }
}));

test('CICLO-NESSUNO-DAVANTI (15/10/2026) — con gli obiettivi accesi nell host, una chat SENZA interfaccia non fa girare il ciclo di un obiettivo attivo; AL CONTRARIO la stessa chat con l interfaccia sì', async (t) => conStore(t, async (cartellaStore) => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  for (const [senzaInterfaccia, atteso] of [[true, false], [false, true]]) {
    const scrittore = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' }); // il modello è della conversazione: senza uno vero il giudice non parte
    const cartella = mkdtempSync(join(tmpdir(), 'talos-ciclo-davanti-'));
    t.after(() => rimuoviCartellaDiProva(cartella));
    const avvio = scrittore.registro.avviaLibero({ cartellaLibera: cartella, consegna: 'riassumi il README', ...(senzaInterfaccia ? { senzaInterfaccia: true } : {}) });
    assert.ok(avvio.sessionId, JSON.stringify(avvio));
    await passo();
    scrittore.giri.at(-1).concludi([{ role: 'system', content: 's' }, { role: 'user', content: 'riassumi il README' }, { role: 'assistant', content: 'fatto' }]);
    await new Promise((r) => setTimeout(r, 50));
    const esito = await cicloDiUnObiettivoScrittoAltrove(cartellaStore, { sessionId: avvio.sessionId, opzioni: { obiettiviNellaChat: true } });
    assert.equal(esito.lavorato, atteso, `senzaInterfaccia=${senzaInterfaccia}: judge calls ${esito.giudizi}, turns ${esito.giriInPiu}`);
  }
}));
