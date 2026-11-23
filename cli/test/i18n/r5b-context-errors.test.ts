/*
 * R5a open item 4 (assigned to R5b, done 2026-09-25 after the owner's "complete all phases"): the Context Engine's failures
 * reached the screen as "TALOS could not finish this action", and a window too small for TALOS's own instructions and
 * tools (CTX_CONTEXT_OVERFLOW) never said so. Now the codes a person can meet have their own English words, what to do,
 * and where to look; the engine's Italian text stays out of the default lines.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {describeError,errorViewLines} from '../../src/i18n/error-view.ts';

const engine=(code:string,message:string)=>Object.assign(new Error(message),{code});
const ITALIAN=/contesto|finestra|sintesi|segmento|modello|completata|leggibile|spazio/iu;

test('R5b: a context too large for the window says the window is too small and how to raise it',()=>{
  const view=describeError(engine('CTX_CONTEXT_OVERFLOW','Il contesto supera la finestra. Compattare o modificare le informazioni protette.'));
  const text=errorViewLines(view).join('\n');
  assert.match(view.what,/too big for the model’s context window/u);
  assert.match(view.todo??'',/\/compact/u);assert.match(view.todo??'',/talos config set models\.<provider:model>\.contextWindow/u);
  assert.doesNotMatch(text,ITALIAN,text);
  assert.equal(text.split('CTX_CONTEXT_OVERFLOW').length-1,1,'the code once');
});

test('CE alignment: the other codes a turn or /compact can end with have their own words, never the generic line',()=>{
  /* The engine's own messages (context-engine/src/engine.mjs:167/205/218/253/290, summary.mjs:21/26, profiles.mjs:8). */
  for(const [code,words,message] of [
    ['CTX_INVALID_SUMMARY',/not in the form TALOS asked for/u,'La sintesi non rispetta il formato richiesto.'],
    ['CTX_EMPTY_SUMMARY',/empty summary/u,'Il modello ha restituito una sintesi vuota.'],
    ['CTX_NO_REDUCTION',/did not make this conversation smaller/u,'La sintesi non libera spazio sufficiente. La versione precedente rimane valida.'],
    ['CTX_NOTHING_TO_COMPACT',/nothing to compact yet/u,'Non ci sono scambi completi da compattare.'],
    /* F-001: the words name the response reserve, the usual cause, and not only the window. */
    ['CTX_CONTEXT_TOO_SMALL',/response reserve.*do not fit in the model’s context window/u,'La riserva della risposta occupa la finestra disponibile.'],
    ['CTX_COMPACTION_FAILED',/Compacting this conversation did not work/u,'Preparazione del contesto non riuscita.'],
    ['CTX_JOB_INTERRUPTED',/interrupted because the TALOS process running it stopped/u,'Compattazione interrotta: il processo che la eseguiva non c’è più (riavvio del server).'],
    /* P12: what the owner saw as "TALOS could not finish this action" three times after resuming. */
    ['CTX_HISTORY_DIVERGED',/no longer matches its saved context/u,'La cronologia attiva differisce dall’archivio. Gli originali sono conservati; occorre recuperare la versione completa.'],
  ] as const){
    const view=describeError(engine(code,message));
    assert.match(view.what,words,code);
    assert.ok(view.todo,`${code}: what to do`);
    const text=errorViewLines(view).join('\n');
    assert.doesNotMatch(text,ITALIAN,`${code}: ${text}`);
    assert.match(text,/\/context shows the window/u,`${code}: where to look`);
  }
});

test('R5b: the summary failures and the oversized segment have their own words, never the generic line',()=>{
  /* The engine's and the adapter's own messages (context-engine/src/summary.mjs:20, engine.mjs:93,
     runtime-owner-adapter.mjs:1319/1327), which must never reach the default lines. */
  for(const [code,words,message] of [
    ['CTX_TRUNCATED_SUMMARY',/summary .* was cut off/u,'La sintesi non è stata completata.'],
    ['CTX_TRUNCATED_SUMMARY',/summary .* was cut off/u,'Il modello ha speso 900 token nel ragionamento e non ha lasciato spazio alla sintesi.'],
    ['CTX_SUMMARY_RESPONSE_INVALID',/summary .* could not be read/u,'Risposta di sintesi non leggibile.'],
    ['CTX_SEGMENT_TOO_LARGE',/too large to summarize/u,'Il segmento supera lo spazio del modello di sintesi.'],
  ] as const){
    const view=describeError(engine(code,message));
    assert.match(view.what,words,code);
    assert.doesNotMatch(view.what,/could not finish this action/u,code);
    assert.ok(view.todo,`${code}: what to do`);
    assert.doesNotMatch(errorViewLines(view).join('\n'),ITALIAN,`${code}: ${errorViewLines(view).join(' | ')}`);
  }
});
