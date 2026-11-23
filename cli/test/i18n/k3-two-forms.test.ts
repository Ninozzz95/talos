/*
 * K3 (desktop, 03/10/2026: the kernel's text for the model in English; whoever READS accepts both forms for good, whoever
 * WRITES changes once the reader is there). The CLI reads the kernel's sentences in either language and gives the same words:
 * the provider's public sentences, the eleven refusal reasons, the run that stopped without an answer. Sentences as the
 * desktop's tables give them (k3-tabella-per-la-cli.md, k3-rifiuti-per-la-cli.md; branch i18n/k3).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {describeError,describeKernelRefusalReason} from '../../src/i18n/error-view.ts';
import {KERNEL_PROVIDER_MESSAGES,KERNEL_REFUSAL_REASONS_EN,isStoppedWithoutAnswer} from '../../src/i18n/kernel-map.ts';

const PAIRS:[string,string][]=[
  ['Troppo traffico presso il fornitore.','Too much traffic at the provider.'],
  ['Credenziale rifiutata dal fornitore.','Credential rejected by the provider.'],
  ['Credito non disponibile presso il fornitore.','Credit not available at the provider.'],
  ['Connessione con il fornitore interrotta.','Connection with the provider interrupted.'],
  ['Il fornitore ha superato il tempo massimo.','The provider exceeded the maximum time.'],
  ['Il fornitore non risponde.','The provider is not responding.'],
  ['La risposta del fornitore si è interrotta.','The provider response was cut off.'],
  ['Il fornitore non ha accettato la richiesta.','The provider did not accept the request.'],
];

test('the provider\'s public sentences: the English one names the same class and gives the same words',()=>{
  for(const [it,en] of PAIRS){
    assert.equal(KERNEL_PROVIDER_MESSAGES[en],KERNEL_PROVIDER_MESSAGES[it],en);
    const view=(raw:string)=>describeError(Object.assign(new Error(raw),{code:'PROVIDER_REQUEST_ERROR'}));
    assert.deepEqual({what:view(en).what,todo:view(en).todo},{what:view(it).what,todo:view(it).todo},en);
  }
});

test('the eleven refusal reasons: each English sentence reads as its Italian twin',()=>{
  const pairs:[string,string][]=[
    ["l'owner non ha approvato questa azione.",'the owner did not approve this action.'],
    ['la sessione è in sola lettura: nessuna scrittura, comando o documento è permesso in questo momento.','the session is read-only: no write, command or document is allowed right now.'],
    ['l\'attrezzo "scrivi" è disattivato per questa sessione (permesso per-attrezzo: nega).','the tool "scrivi" is turned off for this session (per-tool permission: deny).'],
    ['questa è una ricerca approfondita: può leggere, cercare e navigare, ma l\'unica scrittura permessa è il deposito del proprio rapporto con "research_deposit" — "shell" resta negato.','this is a deep research: it can read, search and browse, but the only write allowed is depositing its own report with "research_deposit" — "shell" stays denied.'],
    ['il rapporto di una ricerca si deposita solo nella cartella di quella ricerca: "(nessun percorso)" non ci risolve dentro.','a research report is deposited only in that research\'s own folder: "(no path)" does not resolve inside it.'],
    ['la sessione è limitata alla scrittura nel workspace: "shell" resta negato (solo "scrivi" e "file_edit", che portano un percorso verificabile, sono ammessi a questo livello).','the session is limited to writing in the workspace: "shell" stays denied (only "scrivi" and "file_edit", which carry a verifiable path, are allowed at this level).'],
    ['"../x.txt" non risolve dentro il workspace corrente: la sessione è limitata alla scrittura nel workspace.','"../x.txt" does not resolve inside the current workspace: the session is limited to writing in the workspace.'],
    ['l\'attrezzo "shell" richiede approvazione (comando), ma questa sessione non ha un canale di approvazione attivo.','the tool "shell" requires approval (command), but this session has no active approval channel.'],
    ['fermato su richiesta mentre aspettavo la tua approvazione per "shell".','stopped on request while waiting for the person\'s approval for "shell".'],
    ['la scrittura fuori dalla cartella della sessione non è stata confermata ("D:/work/shared"). Non riprovare fuori: scrivi dentro il progetto, o chiedi alla persona cosa preferisce.','writing outside the session folder was not confirmed ("D:/work/shared"). Do not try again outside: write inside the project, or ask the person what they prefer.'],
    ['la scrittura fuori dalla cartella della sessione non è stata confermata. Non riprovare fuori: scrivi dentro il progetto, o chiedi alla persona cosa preferisce.','writing outside the session folder was not confirmed. Do not try again outside: write inside the project, or ask the person what they prefer.'],
  ];
  assert.equal(KERNEL_REFUSAL_REASONS_EN.length,pairs.length);
  for(const [it,en] of pairs){
    const italian=describeKernelRefusalReason(it);
    assert.ok(italian,`the Italian form is read: ${it}`);
    assert.equal(describeKernelRefusalReason(en),italian,en);
  }
});

test('the run that stopped without an answer, in either language',()=>{
  assert.equal(isStoppedWithoutAnswer('⛔ la generazione si e fermata senza risposta e senza esaurire i giri.'),true);
  assert.equal(isStoppedWithoutAnswer(' ⛔ generation stopped without an answer and without exhausting the turns. '),true);
  assert.equal(isStoppedWithoutAnswer('⛔ turns exhausted: 24 of 24 used without closing the task.'),false);
  const view=(raw:string)=>describeError(Object.assign(new Error(raw),{code:'fermato'}));
  assert.deepEqual(view('⛔ generation stopped without an answer and without exhausting the turns.').what,view('⛔ la generazione si e fermata senza risposta e senza esaurire i giri.').what);
});
