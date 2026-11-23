/*
 * R5a lane S — S5, what Enter does while TALOS works (owner decisions Q-R5-7 and Q-R5-8; gate E8; owner 2026-09-16).
 *
 * Three named modes (Hermes `/busy queue|steer|interrupt`, `hermes_cli/config_defaults.py:808`, 2026-09-24;
 * `ui-tui/src/app/useConfigSync.ts:45-64`, 2026-09-02), config `ui.busyInput`, default `queue` (today's behaviour):
 *   - queue: Enter keeps the message and sends it when the turn ends;
 *   - steer: Enter steers the running turn (what Alt+S does);
 *   - interrupt: Enter stops the turn, then sends the message.
 * In every mode `Alt+S` steers and Esc interrupts (E8); a `!` command typed during a turn is queued whatever the mode
 * (owner 2026-09-16: never runs beside the agent). Slash commands follow Q-R5-8: the views run at once, the commands that
 * change the session wait for the turn to end; every other command keeps today's behaviour (it runs at once).
 * Pure: app.ts carries the decision out.
 */
import {t} from '../i18n/index.ts';
import type {UiBusyInput} from '../config/types.ts';

export const BUSY_INPUT_MODES:readonly UiBusyInput[]=Object.freeze(['queue','steer','interrupt']);
export const DEFAULT_BUSY_INPUT:UiBusyInput='queue';
export function parseBusyInput(value:unknown):UiBusyInput|null{return typeof value==='string'&&(BUSY_INPUT_MODES as readonly string[]).includes(value)?value as UiBusyInput:null;}

/* Q-R5-8 (a), as the owner decided it: views run at once; these change the session and wait for the turn. `/busy` is not
   one of them (owner 2026-09-24): it changes what Enter does now, a screen preference, so it runs at once like Hermes's
   (no busy guard, ui-tui/src/app/slash/commands/session.ts:622). */
export const SLASH_VIEWS:ReadonlySet<string>=new Set(['help','status','context','queue','usage']);
/* F-Q2 (owner 03/10: «/effort e simili mentre il modello gira … devono cambiare immediatamente»; Claude Code interactive-mode: «Claude
   Code runs some commands as soon as you send them instead of queueing them, among them /model, /effort»): the settings — /model,
   /effort, /permissions — run at once and apply from the next request; what acts on the session still waits for the turn. */
export const SLASH_AFTER_TURN:ReadonlySet<string>=new Set(['provider','compact','clear','resume','fork']);
export function slashTiming(name:string):'now'|'after-turn'{return SLASH_AFTER_TURN.has(name)?'after-turn':'now';}

export type BusyEnterAction='send'|'queue'|'steer'|'interrupt-and-send'|'slash-now'|'slash-after-turn';
/** What Enter does with `text` now. `running` is whether a turn is open. */
export function busyEnterAction({text,running,mode}:{text:string;running:boolean;mode:UiBusyInput}):BusyEnterAction{
  const trimmed=String(text??'').trim();
  if(trimmed.startsWith('/')){const name=trimmed.slice(1).split(/\s+/u)[0]??'';return running&&slashTiming(name)==='after-turn'?'slash-after-turn':'slash-now';}
  if(!running)return 'send';
  if(trimmed.startsWith('!'))return 'queue';
  return mode==='steer'?'steer':mode==='interrupt'?'interrupt-and-send':'queue';
}

/** The fixed line while a turn runs: what Enter, Alt+S and Esc do in this mode (Q-R5-7). */
export function busyLine(mode:UiBusyInput):string{return t(`screen.busyLine.${mode}`);}
export function busyEffect(mode:UiBusyInput):string{return t(`screen.busyInput.effect.${mode}`);}
/** The one-time tip, the first time Enter is pressed while TALOS works (Hermes `cli.md:430`, 2026-09-23). */
export function busyTip(mode:UiBusyInput):string{return t('screen.busyInput.tip',{effect:busyEffect(mode)});}

export type BusySlash={kind:'show'}|{kind:'set';mode:UiBusyInput}|{kind:'usage'};
export function busySlash(args:readonly string[]):BusySlash{
  if(args.length===0)return{kind:'show'};
  const mode=args.length===1?parseBusyInput(args[0]!.toLowerCase()):null;
  return mode?{kind:'set',mode}:{kind:'usage'};
}
export function busyShowText(mode:UiBusyInput):string{return t('screen.busyInput.show',{mode,effect:busyEffect(mode)});}
export function busySetText(mode:UiBusyInput):string{return t('screen.busyInput.set',{mode,effect:busyEffect(mode)});}
/** `/busy [mode]`: the line to show and, for a valid mode, the mode to adopt (and remember). */
export function busyCommand(args:readonly string[],current:UiBusyInput):{text:string;mode:UiBusyInput|null}{
  const choice=busySlash(args);
  if(choice.kind==='set')return{text:busySetText(choice.mode),mode:choice.mode};
  return{text:choice.kind==='show'?busyShowText(current):t('screen.usage.busy'),mode:null};
}
/** The Enter actions that earn the one-time tip: a message or a `!` command typed while TALOS works. */
export function tipsOnEnter(action:BusyEnterAction):boolean{return action==='queue'||action==='steer'||action==='interrupt-and-send';}
