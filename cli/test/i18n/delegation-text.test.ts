/*
 * ASYNC phase, step 2 (owner 01/10; «never Italian on the screen», R2 gate E4). The unified kernel speaks to the MODEL in
 * Italian about delegations: the start of a background agent (subagent-orchestrator.mjs `delegaSottoTask`), the reasons a
 * delegation is refused, and the reasons a child's work is not counted as done (`motivoEvidenzaMancante`). The CLI shows
 * them in English on the DISPLAY copy only (the model keeps the kernel's text). Every template is pinned against the kernel
 * source, so a reworded kernel turns this red instead of reaching the screen in Italian.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {englishDelegationLine,englishDelegationText} from '../../src/i18n/delegation-text.ts';
import {argumentLine} from '../../src/tui/tools/shared.ts';
import {agentResultLines} from '../../src/tui/components/agent-result.ts';
import {looksItalian} from '../../src/i18n/kernel-map.ts';

const ORCHESTRATOR=readFileSync(new URL('../../../harness-ui/src/subagent-orchestrator.mjs',import.meta.url),'utf8');
const KERNEL=readFileSync(new URL('../../../harness-ui/src/kernel/talosHarness.mjs',import.meta.url),'utf8');

test('ASYNC 2: the kernel\'s delegation sentences the CLI translates are still the kernel\'s (pinned)',()=>{
  for(const template of [
    /* K4b (desktop, realigned 08/10/2026 to 156689e4e): the kernel writes the delegation sentences in English; the CLI still reads the Italian
       ones, but only for sessions saved before, and those are no longer pinned. The apostrophe of "parent's" is escaped in the kernel source
       (a backslash before it), so the start sentence is pinned in two halves. */
    "riassunto: `Sub-agent ${figlioId} started in the background (${modalita === 'lettura' ? 'read-only' : 'with the parent",
    /* C2b (desktop, realigned 08/10/2026 to 06b4dc0a4): two optional parts sit between the mode and "Keep working" (how the agent started, which model it
       runs on). Both are empty strings for the CLI, which passes neither, so the sentence the model and the CLI read is the one of before. */
    /* Realigned 13/10/2026 to r4 de8f33317: the sentence after the mode tells the MODEL how to wait (end the turn, no sleep, no polling).
       The screen keeps its own short line; the sentence of before stays readable for saved sessions (not pinned any more). */
    "s permissions'}).${comePartito}${suQualeModello} Work on what does not depend on it. Its result reaches you as a new message, delivered only after you END YOUR TURN: when nothing else is left, stop with a one-line status. Do not wait with sleep and do not keep checking list_children for it.`",
    "' It started on its own (Coordination is on in this conversation).'",
    "' The person approved starting it.'",
    "` It runs on ${modelloScelto.modello}, as the person asked.`",
    /* r4 de8f33317: the kernel no longer writes the "the request involved a change…" variant; the CLI still reads it for saved sessions */
    "const dettaglio = `${evidenza.toolCallsFalliti} of ${evidenza.toolCalls} tools failed and there are no writes or artifacts`;",
    "return `The sub-agent declared success, but left no verifiable evidence: ${dettaglio}. The work is not considered finished.`;",
    "motivo: 'The delegation contract is not valid: no capability can be assumed.'",
    "'unknown error in the child session'",
    "motivo: 'the parent session no longer exists'",
    "motivo: 'The delegation mode must be read or write.'",
    "motivo: 'The parent session is limited to reading: it cannot delegate changes.'",
    "'it is not known which model to start the sub-session with'",
    "motivo: `the folder ${dove} does not exist on this computer.${invece}`",
    "` Omit the folder to work where the one who delegated to you works, or use exactly \"${padre.cartella}\".`",
    /* ASYNC step 7 is back in the kernel (restored 07/10/2026 after the kernel merge dropped it): the limits are worded with the configured
       values `limiteProfondita` / `limiteFigli`. The merged kernel's own constants (`LIMITE_PROFONDITA_DELEGA`, `LIMITE_FIGLI_CONCORRENTI`) are
       their defaults; the words, and so the CLI's English text, are the same. */
    "motivo: `maximum delegation depth reached (limit ${limiteProfondita})`",
    "motivo: `limit of ${limiteFigli} concurrent children reached`",
    "motivo: 'the child session did not return a valid identifier'",
  ])assert.ok(ORCHESTRATOR.includes(template),`kernel template moved: ${template}`);
  /* 0.6.11 (R-03): the wrapper is the kernel's `rifiutoDellaDelega`, with an optional code and a retry tail (pinned below, on its output) */
  assert.ok(KERNEL.includes('export function rifiutoDellaDelega('),'the refusal wrapper');
});

test('R-03 (0.6.11): a refusal with a code and a retry tail reads as the same English reason; the old form still does; the loop note is left out',async()=>{
  const {pathToFileURL}=await import('node:url');const {join}=await import('node:path');
  const kernel:any=await import(pathToFileURL(join(process.cwd(),'..','harness-ui','src','kernel','talosHarness.mjs')).href);
  const parentGone=englishDelegationText('REFUSED. the parent session no longer exists No child was started.');
  assert.equal(parentGone,'REFUSED. The parent session no longer exists. No child was started.','premise: the old form is the screen\'s sentence');
  for(const ritentabile of [true,false,undefined]){
    const text=kernel.rifiutoDellaDelega({codice:'DELEGATION_NOT_ALLOWED',ritentabile,motivo:'the parent session no longer exists'});
    assert.match(text,/^REFUSED \[DELEGATION_NOT_ALLOWED\]\. /u,'premise: the kernel writes the code');
    assert.equal(englishDelegationText(text),parentGone,`${String(ritentabile)}: ${text}`);
  }
  const solo=kernel.rifiutoDellaDelega({codice:'DELEGATION_SOLO_LIMIT',ritentabile:true,motivo:'the parent session no longer exists'});
  assert.equal(englishDelegationText(solo),parentGone,solo);
  const looped=`[TALOS: "delega_sottotask" has failed 3 times in a row in this turn. This looks like a loop.]\n${kernel.rifiutoDellaDelega({codice:'DELEGATION_CHILDREN_LIMIT',ritentabile:true,motivo:'the parent session no longer exists'})}`;
  assert.equal(englishDelegationText(looped),parentGone,looped);
  assert.equal(englishDelegationText(`${kernel.rifiutoDellaDelega({codice:'X_Y',ritentabile:false,motivo:'the parent session no longer exists'})} [TALOS: "delega_sottotask" has failed 4 times in a row in this turn.]`),parentGone);
  /* review F5 (0.6.11): an English reason the CLI does not know keeps the kernel's words, without the code and the retry tail */
  for(const ritentabile of [true,false])assert.equal(englishDelegationText(kernel.rifiutoDellaDelega({codice:'DELEGATION_START_FAILED',ritentabile,motivo:'something new'})),'REFUSED. something new. No child was started.');
  /* the old form, with no code and no tail, stays as it was (null = shown untouched) */
  assert.equal(englishDelegationText('REFUSED. modalita must be lettura or modifica No child was started.'),null);
  /* the «on its own» limit names the model's tool in the kernel's words: the screen says what happens instead */
  const mine=englishDelegationText(kernel.rifiutoDellaDelega({codice:'DELEGATION_SOLO_LIMIT',ritentabile:true,motivo:'this conversation has already started the most agents allowed on its own (5). Call delega_sottotask again to ask the person to approve this one.'}));
  assert.equal(mine,'REFUSED. This conversation has already started the most agents allowed on its own (5): the next one asks for your approval. No child was started.');
  const nobody=englishDelegationText(kernel.rifiutoDellaDelega({codice:'DELEGATION_SOLO_LIMIT',ritentabile:false,motivo:'no one can answer here (an automation or a Workflow step), and this run has already started the most agents allowed on its own.'}));
  assert.match(nobody!,/^REFUSED\. No one can answer here/u);
  for(const text of [mine,nobody])assert.doesNotMatch(text!,/delega_sottotask|\[DELEGATION_|Retry|retry only/u);
  /* and the kernel's two sentences are still the kernel's (pinned) */
  const REGISTRY=readFileSync(new URL('../../../harness-ui/src/session-registry.mjs',import.meta.url),'utf8');
  assert.ok(REGISTRY.includes('this conversation has already started the most agents allowed on its own (${TETTO_AVVII_DA_SOLO}). Call delega_sottotask again to ask the person to approve this one.'));
  assert.ok(REGISTRY.includes("'no one can answer here (an automation or a Workflow step), and this run has already started the most agents allowed on its own.'"));
});

test('review F4 (0.6.11): every tool result reaches the delegation reader, and a long result is read in linear time',()=>{
  for(const blank of [10_000,40_000]){
    const text=`${'\n\n'.repeat(blank/2)}x`;
    const start=performance.now();
    assert.equal(englishDelegationText(text),null);
    assert.equal(englishDelegationText(`REFUSED [X_Y]. ${'\n'.repeat(blank)}reason. No child was started.`)!==undefined,true);
    assert.ok(performance.now()-start<200,`${blank} blank lines took ${Math.round(performance.now()-start)} ms`);
  }
});

test('review 2 S3-1 (0.6.11): loop notes that never close do not make a long result slow; the kernel\'s own note is still left out',async()=>{
  const {pathToFileURL}=await import('node:url');const {join}=await import('node:path');
  const kernel:any=await import(pathToFileURL(join(process.cwd(),'..','harness-ui','src','kernel','talosHarness.mjs')).href);
  const text=`REFUSED by the server.\n${'[TALOS: "a" has failed 1 times in a row\n'.repeat(10_000)}`;
  const start=performance.now();
  assert.equal(englishDelegationText(text),null);
  assert.ok(performance.now()-start<200,`${text.length} characters took ${Math.round(performance.now()-start)} ms`);
  const note=kernel.notaStessoAttrezzo('delega_sottotask',3);
  assert.ok(!note.includes('\n')&&note.length<2000,'premise: the kernel\'s note is one line, inside the bound');
  const reason=englishDelegationText('REFUSED. the parent session no longer exists No child was started.');
  assert.equal(englishDelegationText(`${note}\n${kernel.rifiutoDellaDelega({codice:'DELEGATION_CHILDREN_LIMIT',ritentabile:true,motivo:'the parent session no longer exists'})}`),reason);
});

test('ASYNC 2: the delegation tool\'s result in English — the start, and each refusal',()=>{
  assert.equal(englishDelegationText('Sotto-agente abffbb84-3fb3-4070-96db-1a8163ab6a61 avviato in background (modifiche entro i permessi del padre). Continua il lavoro: il risultato finale verrà consegnato separatamente quando sarà disponibile.'),
    'Sub-agent abffbb84 started in the background (it may edit within your permissions). Its result comes back when it ends.');
  assert.equal(englishDelegationText('Sotto-agente abffbb84-3fb3-4070-96db-1a8163ab6a61 avviato in background (con i permessi del padre). Continua il lavoro: il risultato finale verrà consegnato separatamente quando sarà disponibile.'),
    'Sub-agent abffbb84 started in the background (with your permissions). Its result comes back when it ends.');
  assert.equal(englishDelegationText('Sotto-agente c-1 avviato in background (sola lettura). Continua il lavoro: il risultato finale verrà consegnato separatamente quando sarà disponibile.'),
    'Sub-agent c-1 started in the background (read-only). Its result comes back when it ends.');
  const refused=(motivo:string)=>englishDelegationText(`REFUSED. ${motivo} No child was started.`);
  assert.equal(refused('limite di 10 figli concorrenti raggiunto'),'REFUSED. The limit of 10 agents running at once is reached. No child was started.');
  assert.equal(refused('profondità di delega massima raggiunta (limite 2)'),'REFUSED. The maximum delegation depth is reached (limit 2). No child was started.');
  assert.equal(refused('La sessione padre è limitata alla lettura: non può delegare modifiche.'),'REFUSED. This session is read-only: it cannot delegate changes. No child was started.');
  assert.equal(refused('la cartella D:\\x non esiste su questo computer. Ometti la cartella per lavorare dove lavora chi ti ha delegato, oppure usa esattamente «C:\\p».'),
    'REFUSED. The folder D:\\x does not exist on this computer. Leave the folder out to work where you work, or use exactly "C:\\p". No child was started.');
  assert.equal(refused('un motivo nuovo che il kernel non aveva'),'REFUSED. The delegation was refused. No child was started.','an unknown Italian reason: generic English, never the Italian');
  assert.equal(englishDelegationText('REFUSED. modalita must be lettura or modifica. No child was started.'),null,'already English: untouched');
  assert.equal(englishDelegationText('a file listing'),null);
});

test("K4b: the delegation tool's result as the kernel writes it in English becomes the CLI's words, the same as the Italian one",()=>{
  const uuid='abffbb84-3fb3-4070-96db-1a8163ab6a61';
  const tail='Keep working: the final result will be delivered separately when it is available.';
  assert.equal(englishDelegationText(`Sub-agent ${uuid} started in the background (with the parent's permissions). ${tail}`),
    'Sub-agent abffbb84 started in the background (with your permissions). Its result comes back when it ends.');
  assert.equal(englishDelegationText(`Sub-agent c-1 started in the background (read-only). ${tail}`),
    'Sub-agent c-1 started in the background (read-only). Its result comes back when it ends.');
  assert.equal(englishDelegationText(`Note: Sub-agent c-1 started in the background (read-only). ${tail}`),null,'only the whole message is the start sentence');
  /* r4 de8f33317 (13/10/2026): the kernel's sentence for the model is longer; the screen says the same short line, plus what the person needs
     to know (it started on its own, the person approved it, the model it runs on) */
  const tail2='Work on what does not depend on it. Its result reaches you as a new message, delivered only after you END YOUR TURN: when nothing else is left, stop with a one-line status. Do not wait with sleep and do not keep checking list_children for it.';
  assert.equal(englishDelegationText(`Sub-agent ${uuid} started in the background (with the parent's permissions). ${tail2}`),
    'Sub-agent abffbb84 started in the background (with your permissions). Its result comes back when it ends.');
  assert.equal(englishDelegationText(`Sub-agent c-1 started in the background (read-only). It runs on openai:gpt-5-mini, as the person asked. ${tail2}`),
    'Sub-agent c-1 started in the background (read-only). It runs on openai:gpt-5-mini, as you asked. Its result comes back when it ends.');
  assert.equal(englishDelegationText(`Sub-agent c-1 started in the background (read-only). The person approved starting it. ${tail2}`),
    'Sub-agent c-1 started in the background (read-only). Its result comes back when it ends.');
  assert.equal(englishDelegationText(`Sub-agent c-1 started in the background (read-only). It started on its own (Coordination is on in this conversation). ${tail2}`),
    'Sub-agent c-1 started in the background (read-only). It started on its own. Its result comes back when it ends.');
  assert.equal(englishDelegationText(`Sub-agent c-1 started in the background (read-only). Do anything you like. ${tail2}`),null,'a sentence the kernel does not write is not the start sentence');
  assert.equal(englishDelegationText(`Sub-agent c-1 started in the background (read-only). ${tail2} And more.`),null);
  const refused=(reason:string)=>englishDelegationText(`REFUSED. ${reason} No child was started.`);
  assert.equal(refused('limit of 10 concurrent children reached'),'REFUSED. The limit of 10 agents running at once is reached. No child was started.');
  assert.equal(refused('maximum delegation depth reached (limit 2)'),'REFUSED. The maximum delegation depth is reached (limit 2). No child was started.');
  assert.equal(refused('The parent session is limited to reading: it cannot delegate changes.'),'REFUSED. This session is read-only: it cannot delegate changes. No child was started.');
  assert.equal(refused('the parent session no longer exists'),refused('la sessione padre non esiste più'),'one text for the two languages');
  assert.equal(refused('The delegation mode must be read or write.'),refused('La modalità della delega deve essere lettura o modifica.'));
  assert.equal(refused('it is not known which model to start the sub-session with'),refused('non si sa con quale modello far partire la sotto-sessione'));
  assert.equal(refused('the child session did not return a valid identifier'),refused('la sessione figlia non ha restituito un identificatore valido'));
  assert.equal(refused('The delegation contract is not valid: no capability can be assumed.'),refused('Il contratto della delega non è valido: nessuna capacità può essere assunta.'));
  assert.equal(refused('the folder D:\\x does not exist on this computer. Omit the folder to work where the one who delegated to you works, or use exactly "C:\\p".'),
    'REFUSED. The folder D:\\x does not exist on this computer. Leave the folder out to work where you work, or use exactly "C:\\p". No child was started.');
  assert.equal(englishDelegationText('REFUSED. modalita must be lettura or modifica. No child was started.'),null,'an English refusal that is not one of the known ones stays as it is');
  assert.equal(englishDelegationLine('The sub-agent declared success, but left no verifiable evidence: 1 of 1 tools failed and there are no writes or artifacts. The work is not considered finished.'),
    englishDelegationLine('Il sotto-agente ha dichiarato successo, ma non ha lasciato evidenza verificabile: 1 tool su 1 hanno fallito e non risultano scritture o artefatti. Il lavoro non è considerato concluso.'));
  assert.equal(englishDelegationLine('The sub-agent declared success, but left no verifiable evidence: the request involved a change but there are no writes or artifacts. The work is not considered finished.'),
    englishDelegationLine('Il sotto-agente ha dichiarato successo, ma non ha lasciato evidenza verificabile: la richiesta prevedeva una modifica ma non risultano scritture o artefatti. Il lavoro non è considerato concluso.'));
  assert.equal(englishDelegationLine('unknown error in the child session'),'Unknown error in the child session.');
});

test('ASYNC 2: the kernel\'s reasons inside a child\'s summary are English; the child\'s own words are untouched',()=>{
  assert.equal(englishDelegationLine('Il sotto-agente ha dichiarato successo, ma non ha lasciato evidenza verificabile: 1 tool su 1 hanno fallito e non risultano scritture o artefatti. Il lavoro non è considerato concluso.'),
    'The sub-agent reported success but left no verifiable evidence: 1 of 1 tool calls failed and nothing was written. The work is not counted as done.');
  assert.equal(englishDelegationLine('Il sotto-agente ha dichiarato successo, ma non ha lasciato evidenza verificabile: la richiesta prevedeva una modifica ma non risultano scritture o artefatti. Il lavoro non è considerato concluso.'),
    'The sub-agent reported success but left no verifiable evidence: the task asked for a change and nothing was written. The work is not counted as done.');
  assert.equal(englishDelegationLine('errore sconosciuto nella sessione figlia'),'Unknown error in the child session.');
  assert.equal(englishDelegationLine('Done: the command failed.'),'Done: the command failed.');
  assert.equal(englishDelegationLine('Ho letto i file come chiesto.'),'Ho letto i file come chiesto.','the child\'s own words, in any language, are its own');
  const lines=agentResultLines({kind:'agent',id:'a',childId:'c',status:'failed',task:'FAIL child work',
    summary:'Done: the command failed.\nIl sotto-agente ha dichiarato successo, ma non ha lasciato evidenza verificabile: 1 tool su 1 hanno fallito e non risultano scritture o artefatti. Il lavoro non è considerato concluso.'},200,{unicode:true,expanded:true});
  assert.equal(lines.some(line=>looksItalian(line)),false,lines.join('\n'));
});

test('ASYNC 2: the delegation mode is shown in English',()=>{
  assert.equal(argumentLine('modalita','modifica'),'mode: may edit');
  assert.equal(argumentLine('modalita','lettura'),'mode: read-only');
  assert.equal(argumentLine('modalita','something'),'mode: something');
});

test('ASYNC 2: the delegation tool\'s row shows the English start; the model\'s copy (v2) keeps the kernel\'s text',async()=>{
  const {createTuiEventAdapter}=await import('../../src/tui/event-adapter.ts');
  const {createV2EventBridge}=await import('../../src/protocol/v2/events.ts');
  const started='Sotto-agente abffbb84-3fb3-4070-96db-1a8163ab6a61 avviato in background (sola lettura). Continua il lavoro: il risultato finale verrà consegnato separatamente quando sarà disponibile.';
  const raw={type:'ToolCallResult',toolCallId:'d1',content:started,_sequenza:5};
  const v2=createV2EventBridge('main',()=>'2026-10-01T10:00:00.000Z').translate(raw);
  assert.equal((v2?.data as any).content,started,'protocol v2 carries the tool result as the model saw it');
  const adapter=createTuiEventAdapter();adapter.bindSession('main');
  const shown=adapter.translateAll(raw).find(event=>event.type==='tool.completed') as any;
  assert.equal(shown?.content,'Sub-agent abffbb84 started in the background (read-only). Its result comes back when it ends.');
});
