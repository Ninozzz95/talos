/*
 * 0.6.6 (live-065 on the ChatGPT plan, 14/10/2026): the CLI gives the kernel «On request» in every mode but plan and applies its own
 * mode (F-P-001, owner 09/10/2026), so the preamble told the model «Turn permission: On request.» — and with the person in Full
 * access the model answered «I cannot raise the permissions» and stopped. The kernel now takes, from its host, the words the MODEL
 * reads for the turn's permission (`permessoPerIlModello`, r4 e9aa7df26: only the «Turn permission» line and its cache key; the
 * gates and RunStarted keep `permessi`). Here: the CLI's real mode, in the model's language (English), one line under 200
 * characters, saying what runs, what is asked and that being asked is not a refusal. Codex tells its model its approval policy and
 * sandbox in the same way (`<approval_policy>`, `<sandbox_mode>` in its environment context).
 */
import type {PermissionMode} from '../security/types.ts';
import {sessionModeOf} from './session-modes.ts';

const WORDS:Record<PermissionMode,string>={
  default:'Ask before edits: reading runs freely; edits and commands are asked to the person, who may allow them. Being asked is not a refusal.',
  acceptEdits:'Accept edits: file edits and simple file commands in the project run; other commands are asked to the person. Being asked is not a refusal.',
  plan:'Plan mode (read only): read and plan, change nothing; propose the plan for the person to approve.',
  auto:'Auto: safe actions run; the rest is asked to the person, who may allow them. Being asked is not a refusal.',
  dontAsk:'Do not ask: what the person\'s rules allow runs; anything else is refused without asking.',
  /* 0.6.8 (owner 16/10/2026): Full access no longer asks for a project's secret files; this computer's login credentials («Chiedere
     sempre»), a network path and the person-only actions still ask (permission-engine.ts). Decisions 155, 157 and 158 (owner
     04/11/2026): a network path, root in WSL, writes outside the project and the provider questions pass too; a critical deletion
     and a paid research still ask */
  bypassPermissions:"Full access: everything runs without asking, project secrets included; login keys, deleting a disk, a top, user or project folder or a parent, and paid research are asked to the person.",
};
/* the 0.6.6 review's F3: with nobody in front (`-p`, a command, an automation run) what would be asked is refused, not asked —
   «Being asked is not a refusal» would be false there (headless/denials.ts says the refusal to the model when it happens) */
const NOBODY:Record<PermissionMode,string>={
  default:'Ask before edits, with nobody here to answer: reading runs freely; edits and commands that would be asked are refused.',
  acceptEdits:'Accept edits, with nobody here to answer: file edits and simple file commands in the project run; other commands are refused.',
  plan:'Plan mode (read only): read and plan, change nothing; write the plan in your answer.',
  auto:'Auto, with nobody here to answer: safe actions run; the rest is refused.',
  dontAsk:WORDS.dontAsk,
  bypassPermissions:"Full access: everything runs without asking, project secrets included; login keys, deleting a disk, a top, user or project folder or a parent, and paid research are refused: nobody is here to answer.",
};
export function modelPermissionWords(mode:PermissionMode|null|undefined,options:{nobody?:boolean}={}):string|null{
  const words=options.nobody?NOBODY:WORDS;return mode&&Object.hasOwn(words,mode)?words[mode]:null;
}

/* A new session's mode is remembered once the registry has given its id, but the kernel reads these words while it starts the
   first turn: the mode of the session being started is held here until then (starts are one at a time, session-facade.ts). */
let starting:PermissionMode|null=null;
export function withStartingMode<T>(mode:PermissionMode|null|undefined,start:()=>T):T{const before=starting;starting=mode??null;try{return start();}finally{starting=before;}}

/** The registry's `permessoPerIlModello`: the words for the session's mode, or null (the kernel then keeps `permessi`). */
export function permissionForModel(voce:unknown,options:{nobody?:boolean}={}):string|null{
  const id=voce&&typeof voce==='object'?(voce as {sessionId?:unknown}).sessionId:undefined;
  return modelPermissionWords(sessionModeOf(typeof id==='string'?id:null)??starting,options);
}
/** 0.6.8 (desktop a4dfea6df): the registry's `accessoPienoDellOspite`. The kernel's gates get «On request» in every mode but plan
 *  (F-P-001), so `document_create` asks the host whether the person is in Full access, where a document on a secret file is
 *  written without asking (owner 16/10/2026). A sub-agent has no mode of its own here: it has its root session's. */
export function fullAccessForSession(voce:unknown):boolean{
  const row=voce&&typeof voce==='object'?voce as {sessionId?:unknown;radiceId?:unknown}:{};
  const id=typeof row.sessionId==='string'?row.sessionId:null;const root=typeof row.radiceId==='string'?row.radiceId:null;
  return(sessionModeOf(id)??sessionModeOf(root)??starting)==='bypassPermissions';
}
/** The same, for a process where nobody answers what would be asked (`-p`, a command, the automations' host). */
export function permissionForModelWithNobody(voce:unknown):string|null{return permissionForModel(voce,{nobody:true});}
