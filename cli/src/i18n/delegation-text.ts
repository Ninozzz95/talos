/*
 * ASYNC phase, step 2 (owner 01/10; «never Italian on the screen», R2 gate E4). The unified kernel tells the MODEL about
 * delegations in Italian (harness-ui/src/subagent-orchestrator.mjs and the `delega_sottotask` branch of talosHarness.mjs).
 * The CLI words them in English on the DISPLAY copy only: the model keeps the kernel's text. Each sentence is the kernel's
 * constant, compared whole, and pinned against its source by test/i18n/delegation-text.test.ts (the same rule as
 * kernel-map.ts): a reworded kernel turns the test red instead of reaching the screen in Italian.
 */
import {t} from './index.ts';

/* F-022 (desktop 42b988d42, 02/10): «con i permessi del padre» is today's wording; «modifiche entro i permessi del padre» stays
   for sessions saved before it. */
const STARTED=/^Sotto-agente (?<id>\S+) avviato in background \((?<mode>sola lettura|con i permessi del padre|modifiche entro i permessi del padre)\)\. Continua il lavoro: il risultato finale verrà consegnato separatamente quando sarà disponibile\.$/u;
/* K4b (desktop, realigned 08/10/2026 to 156689e4e): the kernel now writes this sentence in English; the Italian one stays for sessions saved before. */
const STARTED_EN=/^Sub-agent (?<id>\S+) started in the background \((?<mode>read-only|with the parent's permissions)\)\. Keep working: the final result will be delivered separately when it is available\.$/u;
/* Realigned 13/10/2026 to r4 de8f33317: after the mode the kernel may say how the agent started and on which model, then tells the MODEL
   how to wait. The screen keeps its short line and the two facts a person cares about; STARTED_EN stays for sessions saved before. */
const STARTED_EN2=/^Sub-agent (?<id>\S+) started in the background \((?<mode>read-only|with the parent's permissions)\)\.(?<how> It started on its own \(Coordination is on in this conversation\)\.| The person approved starting it\.)?(?: It runs on (?<model>\S+), as the person asked\.)? Work on what does not depend on it\. Its result reaches you as a new message, delivered only after you END YOUR TURN: when nothing else is left, stop with a one-line status\. Do not wait with sleep and do not keep checking list_children for it\.$/u;
/* 0.6.11 (R-03, r4 7c0531092, talosHarness.mjs `rifiutoDellaDelega`): a refusal may carry a stable code («REFUSED [CODE].»), a reason
   that then ends with its own full stop, and one of two tails that tell the MODEL whether to retry. The screen keeps the reason only.
   The old form («REFUSED. <reason> No child was started.») stays for sessions saved before. The kernel's loop note («[TALOS: "x" has
   failed N times in a row…]», R-03) can come before or after the refusal: it is the model's, not the person's, and is left out. */
const REFUSED=/^REFUSED(?: \[(?<code>[A-Z][A-Z0-9_]*)\])?\. (?<reason>[\s\S]*?)(?: Retrying the same call will be refused again: change the request, or tell the person what blocks it\.| This can succeed later: retry only after the cause has changed\.)? No child was started\.$/u;
/* No leading `\s*`: every tool result reaches this function (event-adapter.ts), and a leading `\s*` tried at each position of a long
   run of blank lines is quadratic (the bugfixer's review of 0.6.11, F4: 40,000 blank lines blocked the screen for 4.1 s). The spaces
   around the note are trimmed after. Bounded too, on one line (review 2 of 0.6.11, S3-1): a result with «REFUSED» and many notes
   that never close made each one scan to the end of the text (800 KB, 10.5 s). The kernel's note (`notaStessoAttrezzo`) is one
   line of about 470 characters. */
const LOOP_NOTE=/\[TALOS: "[^"\n]{1,200}" has failed \d{1,9} times in a row[^\]\n]{0,2000}\]/gu;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const EVIDENCE=/^Il sotto-agente ha dichiarato successo, ma non ha lasciato evidenza verificabile: (?:(?<write>la richiesta prevedeva una modifica ma non risultano scritture o artefatti)|(?<failed>\d+) tool su (?<total>\d+) hanno fallito e non risultano scritture o artefatti)\. Il lavoro non è considerato concluso\.$/u;
const EVIDENCE_EN=/^The sub-agent declared success, but left no verifiable evidence: (?:(?<write>the request involved a change but there are no writes or artifacts)|(?<failed>\d+) of (?<total>\d+) tools failed and there are no writes or artifacts)\. The work is not considered finished\.$/u;
const FOLDER_MISSING_EN=/^the folder (?<folder>[\s\S]+?) does not exist on this computer\.(?: Omit the folder to work where the one who delegated to you works, or use exactly "(?<parent>[^"]+)"\.)?$/u;
const FOLDER_MISSING=/^la cartella (?<folder>[\s\S]+?) non esiste su questo computer\.(?: Ometti la cartella per lavorare dove lavora chi ti ha delegato, oppure usa esattamente «(?<parent>[^»]+)»\.)?$/u;

/** One kernel reason (`motivo`) in English, or null when it is not one the kernel is known to write. */
function englishReason(reason:string):string|null{
  const fixed:Record<string,string>={
    'la sessione padre non esiste più':t('screen.delegation.reason.parentGone'),
    'La modalità della delega deve essere lettura o modifica.':t('screen.delegation.reason.mode'),
    'La sessione padre è limitata alla lettura: non può delegare modifiche.':t('screen.delegation.reason.parentReadOnly'),
    'non si sa con quale modello far partire la sotto-sessione':t('screen.delegation.reason.noModel'),
    'la sessione figlia non ha restituito un identificatore valido':t('screen.delegation.reason.noId'),
    'Il contratto della delega non è valido: nessuna capacità può essere assunta.':t('screen.delegation.reason.contract'),
  };
  /* the same reasons as the kernel writes them since K4b */
  const fixedEn:Record<string,string>={
    'the parent session no longer exists':t('screen.delegation.reason.parentGone'),
    'The delegation mode must be read or write.':t('screen.delegation.reason.mode'),
    'The parent session is limited to reading: it cannot delegate changes.':t('screen.delegation.reason.parentReadOnly'),
    'it is not known which model to start the sub-session with':t('screen.delegation.reason.noModel'),
    'the child session did not return a valid identifier':t('screen.delegation.reason.noId'),
    'The delegation contract is not valid: no capability can be assumed.':t('screen.delegation.reason.contract'),
  };
  if(Object.hasOwn(fixed,reason))return fixed[reason]!;
  if(Object.hasOwn(fixedEn,reason))return fixedEn[reason]!;
  const limit=/^limite di (?<count>\d+) figli concorrenti raggiunto$/u.exec(reason);
  if(limit)return t('screen.delegation.reason.limit',{count:limit.groups!.count!});
  const depth=/^profondità di delega massima raggiunta \(limite (?<limit>\d+)\)$/u.exec(reason);
  if(depth)return t('screen.delegation.reason.depth',{limit:depth.groups!.limit!});
  const limitEn=/^limit of (?<count>\d+) concurrent children reached$/u.exec(reason);
  if(limitEn)return t('screen.delegation.reason.limit',{count:limitEn.groups!.count!});
  const depthEn=/^maximum delegation depth reached \(limit (?<limit>\d+)\)$/u.exec(reason);
  if(depthEn)return t('screen.delegation.reason.depth',{limit:depthEn.groups!.limit!});
  /* r4 R-03 (session-registry.mjs, DELEGATION_SOLO_LIMIT) */
  const solo=/^this conversation has already started the most agents allowed on its own \((?<count>\d+)\)\. Call delega_sottotask again to ask the person to approve this one\.?$/u.exec(reason);
  if(solo)return t('screen.delegation.reason.soloLimit',{count:solo.groups!.count!});
  if(/^no one can answer here \(an automation or a Workflow step\), and this run has already started the most agents allowed on its own\.?$/u.test(reason))return t('screen.delegation.reason.soloLimitNobody');
  const folder=FOLDER_MISSING.exec(reason)??FOLDER_MISSING_EN.exec(reason);
  if(folder)return t('screen.delegation.reason.folderMissing',{folder:folder.groups!.folder!})+(folder.groups!.parent?t('screen.delegation.reason.useExactly',{folder:folder.groups!.parent}):'');
  return null;
}

/** The `delega_sottotask` result in English (the start, or a refusal), or null when it is not one of the kernel's. */
export function englishDelegationText(text:string):string|null{
  const value=String(text??'');
  const startedEn=STARTED_EN2.exec(value)??STARTED_EN.exec(value);
  if(startedEn){
    const raw=startedEn.groups!.id!;const id=UUID.test(raw)?raw.slice(0,8):raw;
    const mode=t(startedEn.groups!.mode==='read-only'?'screen.delegation.mode.readOnly':'screen.delegation.mode.parent');
    const facts=(startedEn.groups!.how?.startsWith(' It started on its own')?t('screen.delegation.started.onItsOwn'):'')+(startedEn.groups!.model?t('screen.delegation.started.model',{model:startedEn.groups!.model}):'');
    return facts?t('screen.delegation.startedWith',{id,mode,facts}):t('screen.delegation.started',{id,mode});
  }
  const started=STARTED.exec(value);
  if(started){
    const raw=started.groups!.id!;const id=UUID.test(raw)?raw.slice(0,8):raw;
    const mode=started.groups!.mode;
    return t('screen.delegation.started',{id,mode:t(mode==='sola lettura'?'screen.delegation.mode.readOnly':mode==='con i permessi del padre'?'screen.delegation.mode.parent':'screen.delegation.mode.edit')});
  }
  /* most tool results are not a delegation's: nothing more to read (review F4) */
  if(!value.includes('REFUSED'))return null;
  const refused=REFUSED.exec(value.replace(LOOP_NOTE,' ').trim());
  if(!refused)return null;
  const reason=refused.groups!.reason!.trim();
  /* with a code the kernel adds a full stop to a reason that had none: the known reasons are matched with and without it */
  const english=englishReason(reason)??(refused.groups!.code&&reason.endsWith('.')?englishReason(reason.slice(0,-1)):null);
  if(english)return t('screen.delegation.refused',{reason:english});
  if(/[àèéìòù«»]|\b(?:il|la|di|non|della|delle|sessione|cartella)\b/iu.test(reason))return t('screen.delegation.refused',{reason:t('screen.delegation.reason.generic')});
  /* 0.6.11 (review F5): an English reason the table does not know (DELEGATION_START_FAILED's start error, the model check's words…)
     is shown as the kernel wrote it, but without the code and the retry tail, which are the model's; before r4 R-03 such a refusal
     had neither and stayed as it was. The old form, with no code and no tail, still stays as it was. */
  if(!refused.groups!.code&&value===`REFUSED. ${reason} No child was started.`)return null;
  return t('screen.delegation.refused',{reason:/[.!?]$/u.test(reason)?reason:`${reason}.`});
}

/** One line of a child's summary: the kernel's own reasons in English; the child's words, in any language, untouched. */
export function englishDelegationLine(line:string):string{
  const evidence=EVIDENCE.exec(line)??EVIDENCE_EN.exec(line);
  if(evidence){
    const detail=evidence.groups!.write?t('screen.delegation.evidence.write'):t('screen.delegation.evidence.failed',{failed:evidence.groups!.failed!,total:evidence.groups!.total!});
    return t('screen.delegation.evidence',{detail});
  }
  if(line==='errore sconosciuto nella sessione figlia'||line==='unknown error in the child session')return t('screen.delegation.unknownError');
  return englishReason(line)??line;
}
