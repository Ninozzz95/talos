/*
 * Stage 3, the plan card (owner 02/10, registro 12). In plan mode the model proposes a plan (`present_plan`, kernel
 * `talos.plan.v1`) and the turn waits for the person. Drawn as the approved mockup draws it (`planCard`, golden frames
 * step-04-permessi-e-piano-*): «╭─ Plan mode · TALOS proposes this plan and waits for you», the numbered steps, the pills
 * «Approve and start» «Edit the plan» «Keep planning» and the hint; plus the owner's row with two more keys (02/10: a =
 * accept edits, c = clean conversation — Claude Code's other choices, which the kernel has). Keys: Enter approves asking
 * before edits (the mockup's «switching to default mode»), e opens the plan in the editor and the edited text goes back as a
 * correction so the model re-proposes it (owner 02/10, like Gemini CLI Ctrl+X), Esc keeps planning. Pure: state in, rows
 * and outcome out.
 */
import {t,tn} from '../i18n/index.ts';
import type {PlanDecisionKind} from '../runtime/types.ts';
import {planSteps} from './components/plan-receipt.ts';
import {fit,type CardRow,type CardSegment} from './question-card-rows.ts';

export type PlanCardState={requestId:string;hash:string;content:string;steps:string[]};
export type PlanKey={name:string;ctrl?:boolean;text?:string};
export type PlanOutcome={kind:'none'}|{kind:'decide';decision:PlanDecisionKind}|{kind:'edit'};
const seg=(text:string,roles='',action?:string):CardSegment=>({text,roles:roles.split(' ').filter(Boolean),...(action?{action}:{})});

export function openPlanCard({requestId,hash,content}:{requestId:string;hash:string;content:string}):PlanCardState{
  return{requestId,hash,content,steps:planSteps(content)};
}

export function planCardKey(_state:PlanCardState,key:PlanKey):PlanOutcome{
  if(key.name==='return')return{kind:'decide',decision:'ask-before-edits'};
  if(key.name==='escape')return{kind:'decide',decision:'keep-planning'};
  if(key.ctrl)return{kind:'none'};
  if(key.text==='e')return{kind:'edit'};
  if(key.text==='a')return{kind:'decide',decision:'accept-edits'};
  if(key.text==='c')return{kind:'decide',decision:'clean-conversation'};
  return{kind:'none'};
}

/** Stage 6c «tutto cliccabile»: a click on one of the card's buttons is the key it names (mockup `click`: papprove → Enter,
 *  pedit → e, preject → Escape); null for an action that is not the card's. */
export function planCardClick(state:PlanCardState,action:string):PlanOutcome|null{
  if(action==='approve')return planCardKey(state,{name:'return'});
  if(action==='edit')return planCardKey(state,{name:'e',text:'e'});
  if(action==='keep')return planCardKey(state,{name:'escape'});
  return null;
}

/** The card at `width` columns in at most `maxRows` rows: a longer plan shows its first steps and how many more. */
export function planCardRows(state:PlanCardState,width:number,maxRows=Number.POSITIVE_INFINITY):CardRow[]{
  const inner=width-4;const rows:CardRow[]=[];
  rows.push([seg('╭─ ','acc'),seg(t('screen.plan.title'),'acc b'),seg(t('screen.plan.subtitle'),'dim')]);
  /* title, blank, actions, extra keys and the border are always drawn; the steps take what is left */
  const room=Math.max(1,Math.min(state.steps.length,maxRows-5));
  const shown=state.steps.length>room?state.steps.slice(0,Math.max(0,room-1)):state.steps;
  shown.forEach((step,index)=>rows.push([seg(`  ${index+1}. `,'acc'),seg(step)]));
  if(shown.length<state.steps.length)rows.push([seg(`  ${tn('screen.plan.more',state.steps.length-shown.length)}`,'faint')]);
  rows.push([seg('')]);
  rows.push([seg('  '),seg(` ${t('screen.plan.approve')} `,'pill','approve'),seg('   '),seg(` ${t('screen.plan.edit')} `,'dim','edit'),seg('   '),
    seg(` ${t('screen.plan.keep')} `,'dim','keep'),seg(`   ${t('screen.plan.hint')}`,'faint')]);
  rows.push([seg(`  ${t('screen.plan.moreKeys')}`,'faint')]);
  return[...rows.map(row=>[seg('│ ','acc'),...fit(row,inner+1)]),[seg(`╰${'─'.repeat(width-2)}╯`,'acc')]];
}
