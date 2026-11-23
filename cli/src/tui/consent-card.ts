/*
 * 0.6.15 remote control (contract CONTRATTO-DISPOSITIVI-CARTELLE-FILE-RISORSE-2026-10-23, Part 1 R5.12 and Revision 2): a phone
 * asks to work in a folder of this PC; the PC answers. «Allow “<device>” to work in <folder>?» — the full path on the PC only, the
 * device's name as text only — «Allow» and «Not now». Only the person answers it: never the model, and Full access does not apply
 * (it is outside the permission system, owner decision). It appears the moment the request exists (the kernel's consent events,
 * Revision 2: within a second, no polling) and leaves when it is answered, expires or is answered elsewhere.
 * The desktop draws it as a card with two buttons; the pairing mockup has no terminal frame for it, so it takes the TUI's card
 * form (elicit-card.ts: «╭─ title», «│» rows, pills). «Not now» is selected first, as the folder-trust question selects «Cancel»:
 * an Enter typed ahead never grants a folder (and the approvals' grace applies on top). Pure: state in, rows and outcome out.
 */
import {t} from '../i18n/index.ts';
import {fit,type CardRow,type CardSegment} from './question-card-rows.ts';
import {wrapToWidth} from './overlays/approval-dialog.ts';
import {displayWidth} from './text-width.ts';

export type ConsentCardState={richiestaId:string;device:string;folder:string;expiresAt:number;choice:'allow'|'not-now'};
export type ConsentKey={name:string;ctrl?:boolean;text?:string};
export type ConsentOutcome={kind:'none'}|{kind:'answer';allow:boolean};
const seg=(text:string,roles='',action?:string):CardSegment=>({text,roles:roles.split(' ').filter(Boolean),...(action?{action}:{})});

/*
 * Who may hold the keys instead of the card (reviews 3 and 4 of the Desktop, 26/10/2026). The card opens only when none does, and
 * steps aside when one opens after it — every owner `handleInput` serves before the cards, the slash-command menu and the native
 * scrollback included (C-1, C-3 of review 4: the menu's ↓ and Enter had answered the card). Every field is required, so the call
 * names each one; an owner the TUI adds later is NOT caught by the compiler (review 5, D-1: the agents panel was missing) — it has
 * to be added here and in app.ts, and test/tui/consent-wiring.test.ts proves each one arrives.
 *
 * `dockInUse` (review 5, D-1; owner 26/10/2026 «Aspetta che smetti»): the agents panel holds ↑/↓ and Enter while the composer is
 * empty. The card does not wait for the panel to close — a panel left open would hide the request until it expires on the device —
 * it waits while the person is USING it: until CONSENT_PANEL_IDLE_MS have passed since the panel's last key.
 */
export const CONSENT_PANEL_IDLE_MS=1500;
export type ConsentKeyOwners={overlay:string|null;fullAccess:boolean;tooLarge:boolean;exit:boolean;commandMenu:boolean;nativeScrollback:boolean;
  sheet:boolean;transcriptMode:boolean;panel:boolean;panelInUse:boolean};
export function consentCardWaits(owners:ConsentKeyOwners):boolean{
  return(owners.overlay!==null&&owners.overlay!=='consent')||owners.fullAccess||owners.tooLarge||owners.exit||owners.commandMenu
    ||owners.nativeScrollback||owners.sheet||owners.transcriptMode||owners.panel||owners.panelInUse;
}
/** The right panel is in use: on screen, holding the keys, and its last key less than the idle time ago. */
export function consentPanelInUse(panel:{holdsKeys:boolean;lastKeyAt:number|null},now:number):boolean{
  return panel.holdsKeys&&panel.lastKeyAt!==null&&now-panel.lastKeyAt<CONSENT_PANEL_IDLE_MS;
}

export function openConsentCard(request:{richiestaId:string;device:string;folder:string;expiresAt:number}):ConsentCardState{
  return{...request,choice:'not-now'};
}

export function consentCardKey(state:ConsentCardState,key:ConsentKey):{state:ConsentCardState;outcome:ConsentOutcome}{
  const none=(next:ConsentCardState)=>({state:next,outcome:{kind:'none'} as ConsentOutcome});
  if(key.name==='escape')return{state,outcome:{kind:'answer',allow:false}};
  if(key.name==='return')return{state,outcome:{kind:'answer',allow:state.choice==='allow'}};
  if(key.name==='left'||key.name==='right'||key.name==='tab'||key.name==='up'||key.name==='down')return none({...state,choice:state.choice==='allow'?'not-now':'allow'});
  return none(state);
}

/** «tutto cliccabile»: the two pills answer at once. Null for an action that is not the card's. */
export function consentCardClick(state:ConsentCardState,action:string):{state:ConsentCardState;outcome:ConsentOutcome}|null{
  if(action==='consent:allow')return{state,outcome:{kind:'answer',allow:true}};
  if(action==='consent:not-now')return{state,outcome:{kind:'answer',allow:false}};
  return null;
}

const mmss=(ms:number)=>{const s=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};

export function consentCardRows(state:ConsentCardState,width:number,now:number):CardRow[]{
  const inner=width-4;
  const allow=state.choice==='allow';
  /* the folder is never cut (the person must see WHICH folder they open), nor the note's command: both wrap */
  const wrapped=(text:string,roles:string)=>wrapToWidth(text,Math.max(1,inner-2)).map(line=>[seg(`  ${line.replace(/^ +/u,'')}`,roles)] as CardRow);
  const rows:CardRow[]=[
    [seg('╭─ ','acc'),seg(t('remote.consent.title'),'acc b'),seg(t('remote.consent.subtitle',{left:mmss(state.expiresAt-now)}),'dim')],
    [seg('')],
    /* review block 3: the question wraps too when it does not fit (40 columns is the TUI's minimum); on one line it keeps the bold name */
    ...(displayWidth(`${t('remote.consent.allowQuestion')}“${state.device}”${t('remote.consent.toWorkIn')}`)<=inner-2
      ?[[seg(`  ${t('remote.consent.allowQuestion')}`),seg(`“${state.device}”`,'b'),seg(t('remote.consent.toWorkIn'))] as CardRow]
      :wrapped(`${t('remote.consent.allowQuestion')}“${state.device}”${t('remote.consent.toWorkIn')}`,'')),
    ...wrapped(state.folder,'code'),
    [seg('')],
    ...wrapped(t('remote.consent.note'),'faint'),
    [seg('')],
    [seg('  '),seg(` ${t('remote.consent.allow')} `,allow?'pill':'dim','consent:allow'),seg('   '),seg(` ${t('remote.consent.notNow')} `,allow?'dim':'pill','consent:not-now'),seg(`   ${t('remote.consent.hint')}`,'faint')],
  ];
  return[...rows.map(row=>[seg('│ ','acc'),...fit(row,inner+1)]),[seg(`╰${'─'.repeat(width-2)}╯`,'acc')]];
}
