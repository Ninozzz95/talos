/*
 * Stage 6a (owner 01/10: agents docked on the left and a full page; decisions 02/10 in registro 12). The rows of the
 * approved mockup (`dockRows`, `agentsFrame` and the footer pill in MOCKUP-FASE-UI-2026-10-01.html), compared with its
 * golden frames. Research (registro 12): Codex's agent command center (tabs by state, list and details, filters), Claude
 * Code's agent view (groups by state, Space to peek and reply), Hermes's delegation indicator, agent-deck and repomon
 * («needs you» triage). Pure: the agents and the clock in, rows of styled segments (the mockup's roles) out.
 *
 *   docked panel  34 columns, from 100 columns up: the agents grouped needs you → working → done, each with its time and
 *                 what it is doing (or what it asks), the selected one marked;
 *   full page     views List and Timeline; on the list filters All / Waiting for you / Errors / Finished / Stopped, the list on the left (48%) and the selected agent on the right
 *                 (what it asks, its live log, its task) — below 100 columns the list above and the agent below;
 *   footer pill   «← 3 agents · 1 needs you».
 */
import {ONE_COLUMN_FROM} from './regions/frame-shape.ts';
import type {StyledRow,StyledSegment} from './components/styled-rows.ts';
import {activityClock} from './activity-line.ts';
import {timeBand} from './charts.ts';
import {t,tn} from '../i18n/index.ts';
import {displayWidth,splitGraphemes} from './text-width.ts';
import type {LiveAgent} from './live-agents.ts';
import type {CardQuestion} from './question-card.ts';
import {simpleQuestion} from './agent-questions.ts';

export type AgentState='needs'|'working'|'done';
export type AgentCard={
  id:string;task:string;prompt:string;model:string|null;state:AgentState;ok:boolean;
  startMs:number;endMs:number|null;tokens:number;activity:string;log:readonly string[];
  /* stage 6b: `requestId` of the child's question; `simple` when the page answers it (else Space opens the stage 3 card) */
  question?:{q:string;options:readonly string[];requestId?:string;simple?:boolean};last?:string;
  /* the person or the turn stopped it: neither an error nor finished work */
  stopped?:boolean;
};
const PAGE_TWO_COLUMNS_FROM=100,PILL_WORDS_FROM=56,/* tester N5: under this the footer cut the long pill on the very word that matters */PILL_NEEDS_WHOLE_FROM=100;
/** The page's tabs, in order (the words in src/i18n/en/agents.ts). */
export const AGENT_TABS=['screen.agentsPanel.tab.all','screen.agentsPanel.tab.needs','screen.agentsPanel.tab.errors','screen.agentsPanel.tab.done','screen.agentsPanel.tab.stopped'] as const;
/** FE-048: the page's two views, as the mockup's `piuSchede`; the filters belong to the list. */
export const AGENT_VIEWS=['screen.agentsPanel.view.list','screen.agentsPanel.view.timeline'] as const;
const TIMELINE_VIEW=1;
type AgentGroup='needs'|'errors'|'working'|'done'|'stopped';
const groupOf=(a:AgentCard):AgentGroup=>a.state!=='done'?a.state:a.stopped?'stopped':a.ok?'done':'errors';
/* FE-048, the mockup's filters in the PC's words (Frontend); who waits first, then who failed, who works, who ended */
const TAB_MATCH:ReadonlyArray<(a:AgentCard)=>boolean>=[()=>true,a=>groupOf(a)==='needs',a=>groupOf(a)==='errors',a=>groupOf(a)==='done',a=>groupOf(a)==='stopped'];
const ORDER:AgentGroup[]=['needs','errors','working','done','stopped'];
const GROUP_LABEL:Record<AgentGroup,'screen.agentsPanel.tab.needs'|'screen.agentsPanel.tab.errors'|'screen.agentsPanel.tab.working'|'screen.agentsPanel.tab.done'|'screen.agentsPanel.tab.stopped'>={needs:'screen.agentsPanel.tab.needs',errors:'screen.agentsPanel.tab.errors',working:'screen.agentsPanel.tab.working',done:'screen.agentsPanel.tab.done',stopped:'screen.agentsPanel.tab.stopped'};
const STATE_WORD:Record<AgentGroup,'screen.agentsPanel.stateNeeds'|'screen.agentsPanel.stateFailed'|'screen.agentsPanel.stateWorking'|'screen.agentsPanel.stateDone'|'screen.agentsPanel.stateStopped'>={needs:'screen.agentsPanel.stateNeeds',errors:'screen.agentsPanel.stateFailed',working:'screen.agentsPanel.stateWorking',done:'screen.agentsPanel.stateDone',stopped:'screen.agentsPanel.stateStopped'};

const seg=(text:string,roles:string|readonly string[]=''):StyledSegment=>({text,roles:typeof roles==='string'?roles.split(' ').filter(Boolean):[...roles]});
/** Stage 6c: the row is the mockup's `data-a` target for `action` (agentpage:id, agent:id, atab:n, areply:n, agents, agentspage). */
const clickable=(row:StyledSegment[],action:string):StyledSegment[]=>row.map(segment=>({...segment,action}));
const chars=(text:string)=>splitGraphemes(text);
const width=(text:string)=>displayWidth(text);
function pad(text:string,w:number):string{if(width(text)>=w)return chars(text).slice(0,w).join('');return text+' '.repeat(w-width(text));}
function trunc(text:string,w:number):string{return width(text)>w?chars(text).slice(0,Math.max(0,w-1)).join('')+'…':text;}
export function thousands(n:number):string{return n>=1000?`${(n/1000).toFixed(1).replace(/\.0$/u,'')}k`:String(Math.round(n));}
/** A row cut or padded to exactly `w` cells. */
function fit(row:readonly StyledSegment[],w:number):StyledSegment[]{
  const out:StyledSegment[]=[];let used=0;
  for(const s of row){if(used>=w)break;let take='';for(const g of chars(s.text)){if(used+width(take+g)>w)break;take+=g;}if(take)out.push({...s,text:take});used+=width(take);}
  if(used<w)out.push(seg(' '.repeat(w-used)));
  return out;
}
/** Word wrap, long words cut (the mockup's `wrap`). */
function wrap(text:string,w:number):string[]{
  const out:string[]=[];
  for(const para of String(text).split('\n')){
    if(!para){out.push('');continue;}
    let line='';
    for(const word of para.split(/(\s+)/u)){
      if(width(line+word)>w&&line.trim()){out.push(line.replace(/\s+$/u,''));line=word.replace(/^\s+/u,'');}else line+=word;
      while(width(line)>w){out.push(chars(line).slice(0,w).join(''));line=chars(line).slice(w).join('');}
    }
    out.push(line.replace(/\s+$/u,''));
  }
  return out;
}
const elapsed=(a:AgentCard,now:number)=>activityClock((a.endMs??now)-a.startMs);
function icon(a:AgentCard,glyph:string):[string,string]{
  if(a.state==='working')return[glyph,'acc'];
  if(a.state==='needs')return['?','acc'];
  if(a.stopped)return['■','dim'];
  return a.ok?['✓','ok']:['■','del'];
}
export const agentDoing=(a:AgentCard)=>a.state==='needs'&&a.question?t('screen.agentsPanel.asks',{question:a.question.q}):a.activity;
const ordered=(cards:readonly AgentCard[])=>ORDER.flatMap(group=>cards.filter(a=>groupOf(a)===group));

/** The agents over time: one band each, from when it started to when it ended; a band that reaches the right edge is still working. */
function timelineRows(cards:readonly AgentCard[],w:number,now:number,glyph:string):StyledSegment[][]{
  const list=[...cards].sort((a,b)=>a.startMs-b.startMs);
  if(!list.length)return[[seg(t('screen.agentsPanel.pageEmpty'),'dim')]];
  const from=list[0]!.startMs,span=Math.max(1,now-from),nameWidth=Math.min(30,Math.floor(w*.4)),bandWidth=Math.max(10,w-nameWidth-14);
  const color=(a:AgentCard)=>({needs:'warning',errors:'danger',working:'accent',done:'success',stopped:'muted'} as const)[groupOf(a)];
  const out:StyledSegment[][]=[[seg(` ${t('screen.agentsPanel.timelineTitle')}`,'b'),seg(`  ${activityClock(span)} · ${tn('screen.agentsPanel.timelineCount',list.length)}`,'faint')],[seg('')]];
  for(const a of list){
    const [mark,role]=icon(a,glyph),end=(a.endMs??now)-from;
    out.push([seg(` ${mark} `,role),seg(pad(trunc(a.task,nameWidth),nameWidth+1)),...timeBand((a.startMs-from)/span,end/span,bandWidth,{color:color(a)}),seg(`  ${elapsed(a,now)}`,'dim')]);
  }
  out.push([seg('')],[seg(` ${t('screen.agentsPanel.timelineNote')}`,'faint')]);
  return out;
}

/** The keys the selected agent can take right now, and no other (the mockup's `tasti`). */
function pageFoot(a:AgentCard|undefined):string{
  return[a?t('screen.agentsPanel.foot.open'):'',a?.state==='needs'&&a.question?t('screen.agentsPanel.foot.reply'):'',a&&a.state!=='done'?t('screen.agentsPanel.foot.stop'):'',t('screen.agentsPanel.foot.back')].join('');
}

/** The full page, `width` × `height` cells. `view` indexes AGENT_VIEWS, `tab` AGENT_TABS; `reply` is what the person is typing to the agent. */
export function agentsPageRows(cards:readonly AgentCard[],{width:w,height:h,now,view=0,tab,selectedId,glyph,reply}:{width:number;height:number;now:number;view?:number;tab:number;selectedId:string|null;glyph:string;reply?:string|null}):StyledRow[]{
  const rows:StyledSegment[][]=[];
  rows.push([seg(t('screen.agentsPanel.title'),'acc b'),seg(t('screen.agentsPanel.pageScope'),'dim'),seg(t('screen.agentsPanel.pageKeys'),'faint')]);
  rows.push([seg(' '),...AGENT_VIEWS.flatMap((name,i)=>[...clickable([seg(` ${t(name)} `,i===view?'inv':'dim')],`aview:${i}`),seg(' ')])]);
  if(view===TIMELINE_VIEW){rows.push([seg('─'.repeat(w),'faint')],...timelineRows(cards,w,now,glyph));while(rows.length<h-1)rows.push([seg('')]);rows.push([seg(t('screen.agentsPanel.foot.timeline'),'faint')]);return rows.slice(0,h).map(r=>fit(r,w));}
  rows.push([seg(' '),...AGENT_TABS.flatMap((name,i)=>[...clickable([seg(` ${t(name)} ${cards.filter(TAB_MATCH[i]!).length} `,i===tab?'inv':'dim')],`atab:${i}`),seg(' ')])]);
  rows.push([seg('─'.repeat(w),'faint')]);
  const list=cards.filter(TAB_MATCH[tab]??(()=>true));
  const wide=w>=PAGE_TWO_COLUMNS_FROM;const lw=wide?Math.floor(w*0.48):w;
  const left:StyledSegment[][]=[];
  for(const name of ORDER){
    const group=list.filter(a=>groupOf(a)===name);if(!group.length)continue;
    left.push([seg(` ${t(GROUP_LABEL[name])}`,'faint')]);
    for(const a of group){
      const sel=a.id===selectedId;const [mark,role]=icon(a,glyph);
      left.push(clickable([seg(sel?' › ':'   ',role),seg(`${mark} `,role),seg(pad(trunc(a.task,lw-24),lw-24),sel?'b':''),seg(pad(elapsed(a,now),8),'dim'),seg(t('screen.agentsPanel.tokensShort',{tokens:thousands(a.tokens)}),'faint')],`agent:${a.id}`));
      left.push(clickable([seg(`     ${trunc(agentDoing(a),lw-6)}`,a.state==='needs'?'acc':'dim')],`agent:${a.id}`));
    }
  }
  if(!list.length)left.push([seg(t('screen.agentsPanel.pageEmpty'),'dim')]);
  const sel=cards.find(a=>a.id===selectedId)??list[0];
  const dw=wide?w-lw-4:w-4;const right:StyledSegment[][]=[];
  if(sel){
    right.push([seg(sel.task,'acc b')]);
    right.push([seg(t(STATE_WORD[groupOf(sel)]),'dim'),seg(t('screen.agentsPanel.facts',{model:sel.model??t('screen.agentsPanel.modelUnknown'),tokens:thousands(sel.tokens),time:elapsed(sel,now)}),'faint')]);
    right.push([seg('')]);
    if(sel.state==='needs'&&sel.question){
      right.push([seg(t('screen.agentsPanel.asksYou'),'acc b')]);
      for(const line of wrap(sel.question.q,dw))right.push([seg(line)]);
      right.push([seg('')]);
      sel.question.options.forEach((option,i)=>right.push(clickable([seg(` ${i+1}. `,'acc'),seg(option)],`areply:${i}`)));
      right.push([seg(t(sel.question.simple===false?'screen.agentsPanel.replyHintCard':'screen.agentsPanel.replyHint'),'faint')]);
      if(reply!==undefined&&reply!==null)right.push([seg(' › ','acc'),seg(pad(`${reply}▍`,30),'code')]);
    }else if(sel.last){
      right.push([seg(t('screen.agentsPanel.lastMessage'),'faint')]);
      for(const line of wrap(sel.last,dw))right.push([seg(line)]);
    }
    if(sel.log.length){
      const tail=sel.log.slice(-6);
      right.push([seg('')]);
      right.push([seg(t('screen.agentsPanel.live'),'faint'),seg(sel.state==='working'?t('screen.agentsPanel.liveHint'):'','faint')]);
      tail.forEach((line,i)=>{const live=i===tail.length-1&&sel.state==='working';right.push([seg(live?`${glyph} `:'● ',live?'acc':'ok'),seg(trunc(line,dw-2),live?'':'dim')]);});
    }
    right.push([seg('')]);
    right.push([seg(t('screen.agentsPanel.task'),'faint')]);
    for(const line of wrap(sel.prompt,dw))right.push([seg(line,'dim')]);
  }
  const H=h-rows.length-1;
  if(wide){for(let i=0;i<H;i++)rows.push([...fit(left[i]??[seg('')],lw),seg('│ ','faint'),...fit(right[i]??[seg('')],w-lw-2)]);}
  else{const all=[...left,[seg('─'.repeat(w),'faint')],...right];for(let i=0;i<H;i++)rows.push(all[i]??[seg('')]);}
  rows.push([seg(pageFoot(sel),'faint')]);
  return rows.slice(0,h).map(r=>fit(r,w));
}

/** The panel's cards from the live agents (the kernel's events) and the transcript's agent rows (their result summary):
 *  «needs you» while an approval waits on the person, done with its outcome once ended. */
export function agentCards(agents:readonly LiveAgent[],items:readonly {kind:string;childId?:string;summary?:string|null}[],
  questions:readonly {sessionId:string;requestId:string;questions:readonly CardQuestion[]}[]=[]):AgentCard[]{
  /* stage 6b: a child's question to the person (the controller's list) makes it «needs you» and is shown on the page */
  const asked=new Map(questions.map(ask=>[ask.sessionId,ask]));
  const last=new Map<string,string>();
  for(const item of items)if(item.kind==='agent'&&item.childId&&item.summary)last.set(item.childId,item.summary);
  return agents.map(agent=>({
    id:agent.childId,task:agent.task??agent.childId,prompt:agent.prompt??agent.task??'',model:agent.model,
    state:agent.ended?'done':agent.approvalsPending>0||asked.has(agent.childId)?'needs':'working',ok:agent.outcome==='completed',
    startMs:agent.startedAtMs??agent.endedAtMs??0,endMs:agent.ended?agent.endedAtMs:null,tokens:agent.tokens,
    activity:agent.activity.at(-1)??'',log:agent.activity,...(last.has(agent.childId)?{last:last.get(agent.childId)!}:{}),...(agent.outcome==='stopped'?{stopped:true}:{}),
    ...(asked.has(agent.childId)&&!agent.ended?{question:cardQuestion(asked.get(agent.childId)!)}:{}),
  }));
}
function cardQuestion(ask:{requestId:string;questions:readonly CardQuestion[]}):NonNullable<AgentCard['question']>{
  const simple=simpleQuestion(ask.questions);
  if(simple)return{q:simple.q,options:simple.options,requestId:ask.requestId,simple:true};
  const first=ask.questions[0]?.question??'';
  return{q:ask.questions.length>1?t('screen.agentsPanel.moreQuestions',{question:first,count:ask.questions.length-1}):first,options:[],requestId:ask.requestId,simple:false};
}

/** Where the agents are on screen beyond their card in the right panel: the full page (its tab and selection). */
/* `reply`: what the person is typing to the selected agent's question (Space on the page), null when not replying */
export type AgentsSurface={page:{tab:number;selectedId:string|null;reply?:string|null;/* AGENT_VIEWS: absent is the list */view?:number}|null};
export const AGENTS_CLOSED:AgentsSurface={page:null};
export type AgentsStep='card'|'page'|'closed';
type AgentsPlace={cardShown:boolean;columns:number};
/** The agents in the order the panel lists them (needs you → working → done); on the page, only the tab's. */
export function agentsOrder(cards:readonly AgentCard[],tab:number|null=null):AgentCard[]{
  const matches=tab===null?null:TAB_MATCH[tab]??null;
  return ordered(matches?cards.filter(matches):cards);
}
/** The page opens on the given agent, else on the first that needs you, else on the first (the mockup's openAgentsPage). */
export function openAgentsPage(surface:AgentsSurface,cards:readonly AgentCard[],id:string|null):AgentsSurface{
  return{...surface,page:{tab:0,selectedId:id??(cards.find(a=>a.state==='needs')??cards[0])?.id??null}};
}
/** Alt+A: closed → card → page → closed; under the panel's width closed → page → closed (the mockup's `alt+a`). */
export function cycleAgentsSurface(surface:AgentsSurface,{cardShown,columns}:AgentsPlace):AgentsStep{
  if(surface.page)return'closed';
  return cardShown||columns<ONE_COLUMN_FROM?'page':'card';
}
/** `/agents`: the card when there is room for it and it is not on screen, else the page. */
export function showAgentsSurface(_surface:AgentsSurface,{cardShown,columns}:AgentsPlace):AgentsStep{
  return!cardShown&&columns>=ONE_COLUMN_FROM?'card':'page';
}
/** ↑/↓ in a list that wraps around, as the mockup's; an agent no longer listed counts as the first. */
export function moveAgentSelection(order:readonly AgentCard[],selectedId:string|null,delta:number):string|null{
  if(!order.length)return null;
  const at=Math.max(0,order.findIndex(a=>a.id===selectedId));
  return order[((at+delta)%order.length+order.length)%order.length]!.id;
}

/** Stage 6b: the mockup's toast sits at the bottom right of whatever is on screen (`.toast`, right:14px bottom:14px); on the
 *  full page it takes the right end of the last row, which keeps its own words on the left. */
export function withToast(rows:readonly StyledRow[],toast:string|null,w:number):StyledRow[]{
  if(!toast||!rows.length)return[...rows];
  const note=` ${toast} `,room=Math.max(0,w-width(note));
  const last=rows[rows.length-1]!.map(s=>s.text).join('');
  return[...rows.slice(0,-1),[seg(pad(trunc(last.replace(/\s+$/u,''),room),room),'faint'),seg(note,['acc','b'])]];
}

/** The footer pill: «← 3 agents · 1 needs you»; nothing without agents. */
/** Zen's count of the live agents (the mockup's `piedeZen`). */
export function agentsCount(cards:readonly AgentCard[]):StyledSegment[]{
  const live=cards.filter(card=>card.state==='working'||card.state==='needs').length;
  return live?clickable([seg(tn('screen.agentsPanel.pillShort',live),'dim')],'agents'):[];
}
export function agentsPill(cards:readonly AgentCard[],columns=Number.POSITIVE_INFINITY):StyledSegment[]{
  const live=cards.filter(card=>card.state==='working'||card.state==='needs');
  if(!live.length)return[];
  const needs=live.filter(card=>card.state==='needs').length;
  const words=columns<PILL_WORDS_FROM||(needs&&columns<PILL_NEEDS_WHOLE_FROM)?(needs?t('screen.agentsPanel.pillNeedsShort',{count:needs}):tn('screen.agentsPanel.pillShort',live.length))
    :`${tn('screen.agentsPanel.pill',live.length)}${needs?t('screen.agentsPanel.pillNeeds',{count:needs}):''} `;
  return[seg(words,needs?['pill','acc']:['dim','band'])].map(segment=>({...segment,action:'agents'}));
}
