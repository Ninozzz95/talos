/*
 * K3 (03/10/2026) — il testo che il kernel scrive PER IL MODELLO passa all'inglese; chi legge un segno (compattazione, stop,
 * classe dell'errore) accetta PER SEMPRE tutte e due le forme, perché le storie salvate sono italiane e restano tali.
 * Ogni lettore si prova nei due versi: la forma inglese nuova e la forma italiana di prima.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MARCATORE_INDICE, MARCATORE_INDICE_IT, MARCATORE_RIASSUNTO, MARCATORE_RIASSUNTO_IT,
  costruisciRichiestaDiRiassunto, eRichiestaDellaPersona, iniziaConMarcatoreRiassunto, posizioneIndiceMeccanico, indiceMeccanico,
} from '../src/kernel/compattazione-desktop.mjs';
import { contieneMarcaFermatoMentreGirava, contieneMotivoFermatoChiedendo } from '../src/kernel/talosHarness.mjs';
import { classificaErroreDiCorsa } from '../src/research-orchestrator.mjs';

const user = (content) => ({ role: 'user', content });

test('K3-COMPATTAZIONE — i due segni sono ESATTAMENTE le frasi concordate con la CLI (le confronta carattere per carattere)', () => {
  assert.equal(MARCATORE_RIASSUNTO, '[conversation compacted: what follows is a summary, not the original history]');
  /* La CLI cerca all'inizio (`startsWith`) «[conversation compacted at turn » e «[conversation compacted: »: il secondo è questo. */
  assert.ok(MARCATORE_RIASSUNTO.startsWith('[conversation compacted: '));
});

test('K3-COMPATTAZIONE — AL CONTRARIO: una storia salvata con la forma italiana è ancora un riassunto, e l\'inglese lo è come prima', () => {
  assert.ok(iniziaConMarcatoreRiassunto(`${MARCATORE_RIASSUNTO}\n\nsintesi`));
  assert.ok(iniziaConMarcatoreRiassunto(`${MARCATORE_RIASSUNTO_IT}\n\nvecchio riassunto`));
  assert.equal(MARCATORE_RIASSUNTO_IT, '[conversazione compattata: quanto segue è un riassunto, non la cronologia originale]');
  for (const non of ['una richiesta qualunque', '', null, undefined, 42, '[conversation compacted at turn 12: manual]']) {
    assert.equal(iniziaConMarcatoreRiassunto(non), false, String(non));
  }
  assert.equal(eRichiestaDellaPersona(user(`${MARCATORE_RIASSUNTO}\n\nx`)), false, 'il riassunto inglese non è una richiesta della persona');
  assert.equal(eRichiestaDellaPersona(user(`${MARCATORE_RIASSUNTO_IT}\n\nx`)), false, 'il riassunto italiano salvato non è una richiesta della persona');
  assert.equal(eRichiestaDellaPersona(user('fai questo')), true);
});

test('K3-COMPATTAZIONE — l\'indice meccanico si trova e si toglie in tutte e due le forme; un riassunto italiano è «precedente»', () => {
  const inglese = `${MARCATORE_RIASSUNTO}\n\nsintesi\n\n${MARCATORE_INDICE}\n- Paths touched: x`;
  const italiano = `${MARCATORE_RIASSUNTO_IT}\n\nvecchio riassunto\n\n${MARCATORE_INDICE_IT}\n- Percorsi toccati: x`;
  assert.equal(inglese.slice(0, posizioneIndiceMeccanico(inglese)).trimEnd(), `${MARCATORE_RIASSUNTO}\n\nsintesi`);
  assert.equal(italiano.slice(0, posizioneIndiceMeccanico(italiano)).trimEnd(), `${MARCATORE_RIASSUNTO_IT}\n\nvecchio riassunto`);
  assert.equal(posizioneIndiceMeccanico('niente indice qui'), -1);
  for (const [precedente, atteso] of [[inglese, `${MARCATORE_RIASSUNTO}\n\nsintesi`], [italiano, `${MARCATORE_RIASSUNTO_IT}\n\nvecchio riassunto`]]) {
    const richiesta = costruisciRichiestaDiRiassunto({ testa: [], mezzo: [user(precedente), user('poi')] });
    assert.equal(richiesta[0].content, atteso, 'l\'indice non passa dal riassuntore');
    assert.match(richiesta.at(-1).content, /A previous summary is already in the conversation/u, 'un riassunto precedente è riconosciuto');
  }
  const senzaPrecedente = costruisciRichiestaDiRiassunto({ testa: [], mezzo: [user('solo una richiesta')] });
  assert.doesNotMatch(senzaPrecedente.at(-1).content, /A previous summary/u);
});

test('K3-COMPATTAZIONE — le etichette dell\'indice meccanico sono in inglese, e «nessuno» è «none»', () => {
  const { testo } = indiceMeccanico([user('x')]);
  for (const etichetta of [MARCATORE_INDICE, '- Paths touched: (none)', '- Files to re-read before writing to them (last read/written): (none)', '- Fingerprints found in the results: (none)', '- Errors seen: (none)']) {
    assert.ok(testo.includes(etichetta), `manca «${etichetta}» in: ${testo}`);
  }
  assert.doesNotMatch(testo, /Percorsi toccati|nessuno|Errori visti/u);
});

test('K3-STOP — la marca dello stop e il motivo «mentre aspettavo» si riconoscono in inglese e in italiano', () => {
  assert.ok(contieneMarcaFermatoMentreGirava('exit 130\n\n⛔ Stopped on request: the command was stopped while it ran.'));
  assert.ok(contieneMarcaFermatoMentreGirava('exit 130\n\n⛔ Fermato su richiesta: il comando e stato interrotto mentre girava.'));
  assert.equal(contieneMarcaFermatoMentreGirava('⛔ The person stopped this command on purpose from the Processes tab while it ran.'), false, 'lo stop della riga NON è lo stop del giro');
  assert.equal(contieneMarcaFermatoMentreGirava(''), false);
  assert.equal(contieneMarcaFermatoMentreGirava(undefined), false);
  assert.ok(contieneMotivoFermatoChiedendo('REFUSED. stopped on request while waiting for the person\'s approval for "shell".'));
  assert.ok(contieneMotivoFermatoChiedendo('REFUSED. fermato su richiesta mentre aspettavo la tua approvazione per "shell".'));
  assert.equal(contieneMotivoFermatoChiedendo('REFUSED. the owner did not approve this action.'), false);
});

test('K3-CLASSE — «fermato» e «flusso interrotto» si riconoscono dalle parole in tutte e due le lingue; le altre classi non si muovono', () => {
  for (const messaggio of ['⛔ stopped on request while the model was answering.', '⛔ fermato su richiesta mentre il modello stava rispondendo.', '⛔ stopped on request before calling the model.']) {
    assert.deepEqual(classificaErroreDiCorsa({ codice: 'internal-error', messaggio }), { classe: 'fermato', transitorio: false }, messaggio);
  }
  for (const messaggio of ['SSE stream with neither content nor tool_calls', 'flusso SSE senza contenuto ne tool_calls']) {
    assert.deepEqual(classificaErroreDiCorsa({ codice: 'internal-error', messaggio }), { classe: 'flusso-interrotto', transitorio: true }, messaggio);
  }
  /* Le frasi inglesi nuove del kernel e dell'adattatore NON cambiano classe rispetto alle italiane di prima. */
  const COPPIE = [
    ['Il fornitore non risponde (stato 500). x', 'The provider is not responding (status 500). x'],
    ['Troppo traffico presso il fornitore.', 'Too much traffic at the provider.'],
    ['Credenziale rifiutata dal fornitore.', 'Credential rejected by the provider.'],
    ["L'endpoint richiede autenticazione: verifica indirizzo e accesso configurati.", 'The endpoint requires you to sign in: check the configured address and access.'],
    ['Connessione con il fornitore interrotta.', 'Connection with the provider interrupted.'],
    ['Il fornitore ha superato il tempo massimo.', 'The provider exceeded the maximum time.'],
    ['Flusso del fornitore concluso senza un evento finale.', "The provider's stream finished without a final event."],
    ['HTTP 500 dopo 3 tentativi: x', 'HTTP 500 after 3 attempts: x'],
    ['OpenRouter è rimasto inattivo oltre il limite configurato.', 'OpenRouter stayed idle past the configured limit.'],
    ['OpenRouter non ha inviato attività per 60 secondi.', 'OpenRouter sent no activity for 60 seconds.'],
  ];
  for (const [vecchia, nuova] of COPPIE) {
    assert.deepEqual(classificaErroreDiCorsa({ codice: 'internal-error', messaggio: nuova }), classificaErroreDiCorsa({ codice: 'internal-error', messaggio: vecchia }), `${vecchia} → ${nuova}`);
  }
});

test('K3-COMPATTAZIONE-MANUALE — kernel e adattatore scrivono la frase concordata con la CLI, carattere per carattere', async () => {
  const { compattaConversazione } = await import('../src/kernel/talosHarness.mjs');
  const { compattaConversazioneLocale } = await import('../src/runtime-owner-adapter.mjs');
  const messaggi = [{ role: 'system', content: 's' }, { role: 'user', content: 'compito' }, { role: 'assistant', content: 'x' }];
  const chiamaModello = async () => ({ scelta: { content: 'SINTESI' }, usage: null, finishReason: 'stop' });
  for (const compatta of [compattaConversazione, compattaConversazioneLocale]) {
    const esito = await compatta(messaggi, chiamaModello);
    assert.equal(esito.compattato, true);
    assert.match(esito.messaggi[2].content, /^\[conversation compacted at turn \d+: what follows is a summary, not the original history\]\n\nSINTESI$/u);
    /* La CLI cerca all'inizio di un messaggio `user` «[conversation compacted at turn »: la forma italiana di prima non c'è più. */
    assert.ok(esito.messaggi[2].content.startsWith('[conversation compacted at turn '));
    assert.doesNotMatch(esito.messaggi[2].content, /conversazione compattata/u);
  }
});

test('K3-STOP-CONCORDATE — le frasi che la CLI confronta per intero stanno nel kernel esattamente come concordate, e quelle italiane non ci sono più', async () => {
  const { readFileSync } = await import('node:fs');
  const sorgente = readFileSync(new URL('../src/kernel/talosHarness.mjs', import.meta.url), 'utf8');
  const conta = (testo) => sorgente.split(testo).length - 1;
  /* i tre stop degli attrezzi: la comune `⛔ Stopped on request:` + la frase del comando e quella della prova (si compongono in `fraseFermato`) */
  assert.equal(conta("const MARCA_FERMATO_MENTRE_GIRAVA = '⛔ Stopped on request:'"), 1);
  assert.equal(conta("${prova ? 'the test was stopped' : 'the command was stopped'} while it ran."), 1);
  assert.equal(conta("const FRASE_FERMATO_NON_ESEGUITO = '⛔ Stopped on request: it could not run, the session was stopped first. This tool did not run.'"), 1);
  assert.equal(conta("const FRASE_FERMATO_TEMPO_SCADUTO = '⛔ Stopped when the 120 seconds ran out: it did not finish on its own.'"), 1);
  /* A21 (07/10/2026) — il tempo scaduto si prova sul COMPORTAMENTO, non contando una stringa: da quando il timeout è per
     chiamata i tre rami (shell Windows, prova, WSL) passano per `fraseTempoScaduto(ms)`. La CLI riconosce la frase con una
     regex (`cli/src/i18n/error-view.ts:236`): a 120 s deve uscire la costante ESATTA, con un altro N la stessa forma con N. */
  assert.equal(conta('fraseTempoScaduto(timeoutMs)'), 2, 'shell Windows e prova');
  assert.equal(conta('fraseTempoScaduto(attesaMs)'), 1, 'WSL');
  const definizione = (nome) => {
    const inizio = sorgente.indexOf(`const ${nome} =`);
    assert.ok(inizio >= 0, `${nome} è nel kernel`);
    const fine = nome === 'fraseTempoScaduto' ? sorgente.indexOf('\n}', inizio) + 2 : sorgente.indexOf('\n', inizio);
    return sorgente.slice(inizio, fine);
  };
  const { runInNewContext } = await import('node:vm');
  const frase = runInNewContext(`${['FRASE_FERMATO_TEMPO_SCADUTO', 'TIMEOUT_SHELL_PREDEFINITO_MS', 'fraseTempoScaduto'].map(definizione).join('\n')}\nfraseTempoScaduto`);
  const costante = '⛔ Stopped when the 120 seconds ran out: it did not finish on its own.';
  for (const ms of [undefined, 120_000, 119_600, 120_400]) assert.equal(frase(ms), costante, `a ${ms ?? 'predefinito'} ms la costante esatta`);
  const comeLaCli = /^⛔ Stopped when the (?<seconds>\d+) seconds ran out: it did not finish on its own\.$/u;
  for (const [ms, secondi] of [[500, '1'], [30_000, '30'], [600_000, '600']]) {
    const testo = frase(ms);
    assert.match(testo, comeLaCli, `a ${ms} ms la forma che la CLI riconosce`);
    assert.equal(testo.match(comeLaCli).groups.seconds, secondi);
    assert.equal(testo, `⛔ Stopped when the ${secondi} seconds ran out: it did not finish on its own.`);
  }
  /* AL CONTRARIO: le forme italiane di prima non si scrivono più (restano solo come «_IT» per chi legge) */
  assert.equal(conta('Fermato allo scadere'), 0);
  assert.equal(conta("'la prova e stata interrotta'"), 0);
  assert.equal(conta("const MARCA_FERMATO_MENTRE_GIRAVA_IT = '⛔ Fermato su richiesta:'"), 1);
});
