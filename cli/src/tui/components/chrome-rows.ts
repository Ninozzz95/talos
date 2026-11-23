/*
 * The frame's chrome as the approved mockup draws it (07/10 `buildMain` header, `footerRows`; owner 08/10 «Tutta la
 * conversazione»), as rows of segments with the mockup's style roles (styled-rows.ts):
 *
 *    TALOS  ~/projects/shop-api · main                                              ← TALOS acc,b · the folder dim · the branch faint
 *    default · shift+tab · ? keys                                                   ← the mode dim (full access: err,b) · the keys faint
 *    qwen3-coder · openrouter: verified · ↑18.4k ↓6.1k · ctx 23% · ~/projects/shop-api · main
 *                                                                                   ← the model dim · the provider ok/warn · the rest faint
 *
 * Under 100 columns the second row is gone and a provider that is not verified takes «? keys»'s place in the first (C1R);
 * «checking…» does not (review of 0.6.2, B4: it is said at every start and needs nobody's attention, and it hid the keys hint).
 * Kept from the decisions the mockup does not draw: «no sandbox» beside the mode, never dropped (Q-R3-13); the queue count
 * (F-Q1); the console warnings (owner 02/10) and the context colours at 50/80/95 (Q-R5-2).
 */
import {t,tn} from '../../i18n/index.ts';
import {compactTokens,contextTone,percentText,providerBadge,type StatusProviderVerification,type StatusTone} from '../status-bar.ts';
import type {UsageSnapshot} from '../../runtime/usage-snapshot.ts';
import {displayWidth,truncateDisplay,truncateMiddle} from '../text-width.ts';
import {shellSafeText} from './terminal-shell.ts';
import type {StyledSegment} from './styled-rows.ts';

export const FOOTER_TWO_ROWS_FROM=100;
const S=(text:string,...roles:string[]):StyledSegment=>({text,roles});
const rowWidth=(row:readonly StyledSegment[])=>row.reduce((sum,segment)=>sum+displayWidth(segment.text),0);
/** Cut a row to the width, segment by segment, the last one ending in «…». */
export function fitRow(row:readonly StyledSegment[],width:number):StyledSegment[]{
  const limit=Math.max(0,Math.floor(width));const out:StyledSegment[]=[];let used=0;
  for(const segment of row){
    const w=displayWidth(segment.text);
    if(used+w<=limit){out.push(segment);used+=w;continue;}
    const room=limit-used;if(room>0)out.push({...segment,text:truncateDisplay(segment.text,room)});
    break;
  }
  return out;
}

export type HeaderInput={workspace:string;branch:string|null;width:number;status?:string;watching?:{task:string;done:boolean}|null;/* FE-048: the centre's tabs at the right end (the screen passes true; left out, the header of before) */tabs?:boolean;/* the centre shows the Review page */review?:boolean};
/* FE-048 (the mockup's `testata`): the tabs of the centre at the right end; «To do» is gone (owner 01/11 night, decision 3: it promised a page
   that does not exist, and what waits is already a card in the conversation). Terminal and Browser are not in the CLI (owner 31/10):
   `!` in the prompt is the shell. Chat is where the person is; Review opens /diff until it has its page. Under 56 columns the tabs give way. */
const TABS_FROM=56,PLACE_FROM=22;
function headerRight(width:number,review=false):StyledSegment[]{
  const tabs:StyledSegment[]=width<TABS_FROM?[]:[review?{text:` ${t('screen.chrome.tab.chat')} `,roles:['dim'],action:'centre:chat'}:S(` ${t('screen.chrome.tab.chat')} `,'inv'),S(' '),review?S(` ${t('screen.chrome.tab.review')} `,'inv'):{text:` ${t('screen.chrome.tab.review')} `,roles:['dim'],action:'centre:review'},];
  return tabs;
}
export function headerRow(input:HeaderInput):StyledSegment[]{
  if(input.watching){
    const task=shellSafeText(input.watching.task);
    return fitRow([S(' ◂ ','acc'),{...S(t(input.watching.done?'screen.chrome.watchingDone':'screen.chrome.watching'),'dim')},S(task,'acc','b'),{text:t('screen.chrome.back'),roles:['faint'],action:'unwatch'}].map((segment,index)=>index===0?{...segment,action:'unwatch'}:segment),input.width);
  }
  const branch=input.branch?S(' · '+shellSafeText(input.branch),'faint'):null;
  const status=input.status?S(' · '+shellSafeText(input.status),'warn'):null;
  const fixed=displayWidth(' TALOS  ')+(branch?displayWidth(branch.text):0)+(status?displayWidth(status.text):0);
  const right=input.tabs?headerRight(input.width,input.review):[];
  const room=Math.max(1,input.width-fixed-rowWidth(right)-(right.length?1:0));
  const place=displayWidth(input.workspace)>room?truncateMiddle(input.workspace,room):input.workspace;
  const logo=S(' TALOS','acc','b'),tail=status?[status]:[];
  /* C11b: the folder opens Projects (bozzetto-cli-retro/index.html:723) */
  const folder={...S('  '+place,'dim'),action:'open:projects'};
  const whole=[logo,folder,...(branch?[branch]:[]),...tail];
  if(!right.length)return fitRow(whole,input.width);
  /* the right end stays: the branch gives way first, then the folder */
  const fits=(row:readonly StyledSegment[])=>rowWidth(row)+rowWidth(right)+1<=input.width;
  const left=input.width-rowWidth(right)-2<PLACE_FROM?[logo,...tail]:[whole,[logo,folder,...tail]].find(fits)??[logo,...tail];
  return fitRow([...left,S(' '.repeat(Math.max(1,input.width-rowWidth(left)-rowWidth(right)))),...right],input.width);
}

/* The mode as the mockup names it; a mode it does not draw keeps its own word. */
export function modeWord(mode:string):string{
  const known:Record<string,string>={default:'screen.chrome.mode.default',acceptEdits:'screen.chrome.mode.acceptEdits',plan:'screen.chrome.mode.plan',bypassPermissions:'screen.chrome.mode.bypassPermissions',auto:'screen.mode.auto',dontAsk:'screen.mode.dontAsk'};
  return known[mode]?t(known[mode] as any):shellSafeText(mode);
}
/* the mockup's three states: verified (ok), checking… (faint, while the one check is under way), not verified (warn). Which one is
   said, and the provider's name made safe for the terminal, are decided in ONE place (status-bar.ts `providerBadge`; review of
   0.6.2, B1 and B5: this copy and the status bar's each dropped the check's verdict and wrote the name as it came). */
const providerText=(verification:StatusProviderVerification)=>{
  const badge=providerBadge(verification);
  return{kind:badge.kind,role:badge.kind==='verified'?'ok':badge.kind==='checking'?'faint':'warn',text:badge.text};
};
const toneRole:Record<StatusTone,string[]>={normal:['faint'],warn:['warn'],high:['err'],critical:['err','b']};

export type FooterInput={
  mode:string;noSandbox:boolean;queueCount:number;width:number;
  model:string;provider?:StatusProviderVerification|null;snapshot:UsageSnapshot|null;
  workspace:string;branch:string|null;consoleWarnings?:number;
  /* 0.6.15 remote control (the pairing mockup v3, its session frame): the phones connected through this window, or the window
     that hosts the remote when it is another one */
  /* T4: `byCommand` — `talos remote` holds remote control in another terminal (owner 26/10/2026: a discreet line) */
  /* owner 27/10/2026: `administrator` — this window runs as administrator, a fixed warning right after the mode (never cut first);
     `elsewhereAdministrator` — the window that has remote control is one */
  remote?:{phones:readonly string[];elsewhere:string|null;byCommand?:boolean;administrator?:boolean;elsewhereAdministrator?:boolean};
  /* FE-048: what Zen keeps at the right end of its only row */
  zenRight?:readonly StyledSegment[];
  /* a card is open: the mode and the context stay, the keys of the frame do not work now, so they are not said */
  cardOpen?:boolean;
};
const contextCount=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
/* the context figure, with its colours at 50, 80 and 95 */
function contextSegment(input:FooterInput):StyledSegment{
  const window=contextCount(input.snapshot?.windowTokens),percent=contextCount(input.snapshot?.percent);
  return{...S(window&&percent!==null?t('screen.statusbar.contextShort',{percent:(input.snapshot?.estimated?'~':'')+percentText(percent)}):t('screen.statusbar.contextUnknown'),...toneRole[contextTone(percent)]),action:'open:context'};
}
/** The first row: the mode, the key that changes it, the keys; what the mockup does not draw follows, never in place of the mode.
 *  FE-048 (owner 31/10): on the only row, under 100 columns, the context stands right after the mode and the safety words, so the cut
 *  from the right takes everything else first and it drops last. */
export function footerModeRow(input:FooterInput):StyledSegment[]{
  const full=input.mode==='bypassPermissions';
  const provider=input.provider?providerText(input.provider):null;
  const narrowBadge=input.width<FOOTER_TWO_ROWS_FROM&&provider!==null&&provider.kind==='unverified';
  return fitRow([
    {...S(' '+modeWord(input.mode),...(full?['err','b']:['dim'])),action:'frame:mode'},
    ...(input.noSandbox?[S(' · '+t('screen.chrome.noSandbox'),'err','b')]:[]),
    ...(input.width<FOOTER_TWO_ROWS_FROM?[S(' · ','faint'),contextSegment(input)]:[]),
    ...(input.remote?.administrator?[S(' · '+t('remote.footer.administrator'),'warn')]:[]),
    ...(input.cardOpen?[]:[S(t('screen.chrome.modeKey'),'faint')]),
    ...(narrowBadge||input.cardOpen?[]:[S(t('screen.chrome.keys'),'faint')]),
    ...(input.queueCount>0?[S(' · '+t('screen.shortcut.queue',{count:input.queueCount}),'faint')]:[]),
    ...(narrowBadge?[S(' · '+provider!.text,provider!.role)]:[]),
    ...(input.remote?.phones.length?[S(' · ','faint'),S(t('remote.footer.phones',{names:input.remote.phones.join(', ')}),'ok')]:input.remote?.byCommand?[S(' · '+t('remote.footer.command'),'faint')]:input.remote?.elsewhere?[S(' · '+t(input.remote.elsewhereAdministrator?'remote.footer.elsewhereAdministrator':'remote.footer.elsewhere',{name:input.remote.elsewhere}),'faint')]:[]),
  ],input.width);
}
/** Zen's only row (FE-048, the mockup's `piedeZen`): the two things needed to work safely never leave, the mode and the context. */
export function footerZenRow(input:FooterInput):StyledSegment[]{
  const left=[
    {...S(' '+modeWord(input.mode),...(input.mode==='bypassPermissions'?['err','b']:['faint'])),action:'frame:mode'},
    ...(input.noSandbox?[S(' · '+t('screen.chrome.noSandbox'),'err','b')]:[]),
    S(' · ','faint'),contextSegment(input),
  ];
  const right=input.zenRight??[];const gap=input.width-rowWidth(left)-rowWidth(right);
  return fitRow(right.length&&gap>=1?[...left,S(' '.repeat(gap)),...right]:left,input.width);
}
/* C11b (bozzetto-cli-retro/index.html:845): the folder and the branch are two pieces with the same words as before; only the folder opens
   Projects. When the cut in the middle ate the « · » between them, nobody can say which part is which, and nothing is a target. */
function placePieces(shown:string,folder:boolean,branch:boolean):StyledSegment[]{
  if(!folder)return[S(shown,'faint')];
  if(!branch)return[{...S(shown,'faint'),action:'open:projects'}];
  const at=shown.lastIndexOf(' · ');
  if(at<=0)return[S(shown,'faint')];
  return[{...S(shown.slice(0,at),'faint'),action:'open:projects'},S(shown.slice(at),'faint')];
}
/** The second row, from 100 columns: model, provider, tokens, context, folder and branch; the folder goes first when it does not fit. */
export function footerModelRow(input:FooterInput):StyledSegment[]|null{
  if(input.width<FOOTER_TWO_ROWS_FROM)return null;
  const snapshot=input.snapshot,provider=input.provider?providerText(input.provider):null;
  const count=contextCount;
  const tilde=snapshot?.estimated?'~':'';
  const tokensIn=count(snapshot?.inputTokens),tokensOut=count(snapshot?.outputTokens);
  const tokens=tokensIn===null&&tokensOut===null?null:t('screen.statusbar.tokens',{input:tokensIn===null?'?':tilde+compactTokens(tokensIn),output:tokensOut===null?'?':tilde+compactTokens(tokensOut)});
  const model=shellSafeText(provider&&input.model.startsWith(`${input.provider!.id}:`)?input.model.slice(input.provider!.id.length+1):input.model);
  const warnings=count(input.consoleWarnings);
  const place=[input.workspace,input.branch?shellSafeText(input.branch):''].filter(Boolean).join(' · ');
  const head=[...(model?[{...S(' '+model,'dim'),action:'open:model'}]:[S(' ')]),...(provider?[S(' · ','faint'),S(provider.text,provider.role)]:[])];
  const tail=[...(tokens?[S(' · '+tokens,'faint')]:[]),S(' · ','faint'),contextSegment(input),...(warnings?[S(' · '+tn('screen.statusbar.console',warnings),'warn')]:[])];
  const placeSegment=place?placePieces(' · '+place,Boolean(input.workspace),Boolean(input.branch)):[];
  const whole=[...head,...tail,...placeSegment];
  if(rowWidth(whole)<=input.width)return whole;
  const room=input.width-rowWidth([...head,...tail])-3;
  if(place&&room>=8)return [...head,...tail,...placePieces(' · '+truncateMiddle(place,room),Boolean(input.workspace),Boolean(input.branch))];
  return fitRow([...head,...tail],input.width);
}
