/*
 * R3 lane RD — the ONE tool row (gate E1), owner decisions of 2026-09-24 (ledger "R3 — tools and approvals"):
 *
 *   <Label> <target> · <isolation> · <why it ran> · <result> · <duration>        (Q-R3-1)
 *     <detail lines: output tail / diff / reason>
 *
 *   - isolation: commands only (file tools are governed by permissions, R0 decision 3), from the CLI's own annotation as
 *     structured `facts.isolation` (gate E6), never kernel prose;
 *   - why it ran: the decision kinds (Q-R3-3); a person's `!` command is `typed by you`; nothing without a decision;
 *   - result: commands `exit N` (receipt or facts, gate E3), reads `N lines`, lists `N entries`, searches `N results`,
 *     writes `new file · N lines` or `+a −r`, edits `+a −r`; nothing to say is `done`;
 *   - duration: the kernel's measured `durationMs` only (never the CLI clock, which includes the approval wait): always
 *     for commands, from 1 s for other tools (Q-R3-2);
 *   - a state other than done replaces result and duration with its word (`waiting for you`, `running 12 s`, `denied`,
 *     `interrupted after 4.2 s`, `failed` + the exit code or the reason) — dictionary words, never the enum (E2);
 *   - too wide: the target is cut in the middle, then the duration goes, then the isolation word leaves its glyph; the
 *     glyph, the why field and the state word or exit code are never dropped. If even that does not fit, the target
 *     shrinks to `…`, then an `allow:` rule is cut in the middle, and whatever remains wraps (the estimate counts the
 *     same wrap, because it measures this same line).
 */
import {t} from '../../i18n/index.ts';
import {displayWidth,truncateDisplay,truncateMiddle} from '../text-width.ts';
import type {ToolKindView,ToolRenderContext,ToolRenderResult,ToolRowModel,ToolRowTone} from './registry.ts';
import {boundedLines,detailWidth,formatDuration,labelFor,sanitizeDisplayText,withoutKernelExitLine} from './shared.ts';

type FactRole='isolation'|'why'|'result'|'state'|'exit'|'duration';
type Fact={role:FactRole;text:string;short?:string;rule?:string};

const SEPARATOR=' · ';
/* The target keeps at least this many columns while facts are still being shortened (then it may shrink to `…`). */
const TARGET_MIN=12;

/** Q-R3-3: why a tool was allowed to run, in the owner's words; null when no decision was involved. */
function whyFact(row:ToolRowModel):Fact|null{
  const decision=row.decision??(row.origin==='person'?{kind:'typed' as const}:null);
  if(!decision)return null;
  if(decision.kind==='rule'){const rule=sanitizeDisplayText(String(decision.rule??'')).replace(/\s*\n\s*/gu,' ');return{role:'why',text:t('tool.why.rule',{rule}),rule};}
  return{role:'why',text:t(`tool.why.${decision.kind}`,{count:decision.count??''})};
}

/* A target is one line: its first line, and `…` when it had more (Q-R2-3). Shown as data (escaped controls). */
function oneLineTarget(value:string){const [first='',...more]=sanitizeDisplayText(String(value??'')).split('\n');const shown=first.trim();return more.some(line=>line.trim())?`${shown} …`.trim():shown;}

function composeLine(label:string,target:string,facts:readonly Fact[]){return{title:label+(target?' '+target:''),statusLabel:facts.map(fact=>fact.text).join(SEPARATOR)};}
function widthOf(label:string,target:string,facts:readonly Fact[]){const {title,statusLabel}=composeLine(label,target,facts);return displayWidth(title+SEPARATOR+statusLabel);}

function fit(label:string,target:string,facts:Fact[],width:number):{target:string;facts:Fact[]}{
  if(!Number.isFinite(width)||widthOf(label,target,facts)<=width)return{target,facts};
  const cut=(current:readonly Fact[],minimum:number)=>{
    if(!target)return '';
    const budget=Math.max(Math.min(minimum,displayWidth(target)),width-widthOf(label,'',current)-1);
    return displayWidth(target)<=budget?target:truncateMiddle(target,Math.max(1,budget));
  };
  const fits=(shown:string,current:readonly Fact[])=>widthOf(label,shown,current)<=width;
  let current=facts,shown=cut(current,TARGET_MIN);
  if(fits(shown,current))return{target:shown,facts:current};
  current=current.filter(fact=>fact.role!=='duration');shown=cut(current,TARGET_MIN);
  if(fits(shown,current))return{target:shown,facts:current};
  current=current.map(fact=>fact.role==='isolation'&&fact.short?{...fact,text:fact.short}:fact);shown=cut(current,TARGET_MIN);
  if(fits(shown,current))return{target:shown,facts:current};
  shown=cut(current,1);
  if(fits(shown,current))return{target:shown,facts:current};
  const why=current.find(fact=>fact.role==='why'&&fact.rule!==undefined);
  if(why){
    const others=current.filter(fact=>fact!==why);
    const room=width-widthOf(label,shown,others)-displayWidth(SEPARATOR)-displayWidth(t('tool.why.rule',{rule:''}));
    const rule=truncateMiddle(why.rule!,Math.max(1,room));
    current=current.map(fact=>fact===why?{...fact,text:t('tool.why.rule',{rule})}:fact);
  }
  return{target:shown,facts:current};
}

function evidenceLines(row:ToolRowModel,width:number):string[]{
  const outcome=row.outcome;if(!outcome)return[];
  const rows:string[]=[];
  if(outcome.receiptStatus)rows.push(`receipt ${outcome.receiptStatus}`);
  if(outcome.exitCode!==null)rows.push(`exit ${outcome.exitCode}`);
  if(outcome.enforcement!==null)rows.push(`enforcement ${outcome.enforcement}`);
  if(outcome.allowed!==null||outcome.permissionVia!==null){
    const decision=outcome.allowed===true?'allowed':outcome.allowed===false?'denied':'not reported';
    rows.push(`permission ${decision}${outcome.permissionVia?` via ${outcome.permissionVia}`:''}`);
  }
  if(outcome.permissionReason)rows.push(`permission reason ${outcome.permissionReason}`);
  if(outcome.risk)rows.push(`risk ${outcome.risk}`);
  return rows.map(text=>truncateDisplay(sanitizeDisplayText(text),detailWidth(width)));
}

function firstLine(text:string){return String(text??'').split(/\r?\n/u).map(line=>line.trim()).find(Boolean)??'';}

/* The kernel's own heads (talosHarness.mjs CODICE_NESSUN_TEST / CODICE_NESSUNA_SUITE, pinned in da2-prova-not-run.test.ts):
   only the START of the answer counts (`^`, no `m` flag), so a command that prints «NOT RUN: …» later is just output. */
function notRunReason(output:string):'tool.state.notRun.noTests'|'tool.state.notRun.noSuite'|null{
  const text=String(output??'');
  if(/^NOT RUN: NO_TESTS_RAN — /u.test(text))return 'tool.state.notRun.noTests';
  if(/^NOT RUN: NO_TEST_SUITE_CONFIGURED — /u.test(text))return 'tool.state.notRun.noSuite';
  return null;
}

export function composeToolRow(row:ToolRowModel,view:ToolKindView,context:ToolRenderContext):ToolRenderResult{
  const label=sanitizeDisplayText(view.label??labelFor(row));
  const target=oneLineTarget(view.target);
  const facts:Fact[]=[];
  if(view.command&&row.facts?.isolation){const kind=row.facts.isolation;facts.push({role:'isolation',text:t(`tool.isolation.${kind}`),short:t(`tool.isolation.${kind}.glyph`)});}
  const why=whyFact(row);if(why)facts.push(why);
  const exit=row.facts?.exitCode??row.outcome?.exitCode??null;
  const duration=typeof row.facts?.durationMs==='number'&&Number.isFinite(row.facts.durationMs)?row.facts.durationMs:null;
  const state=(text:string)=>facts.push({role:'state',text});
  let tone:ToolRowTone;
  switch(row.status){
    case 'approval':tone='waiting';state(t('tool.state.waiting'));break;
    case 'queued':case 'running':case 'streaming':{
      tone='running';
      const elapsed=row.startedAt===null?0:Math.max(0,context.now-row.startedAt);
      state(view.liveTail||elapsed<1000?t('tool.state.running'):t('tool.state.runningFor',{duration:formatDuration(elapsed)}));
      break;
    }
    case 'completed':{
      if(view.command){
        tone=exit!==null&&exit!==0?'failed':'done';
        if(exit!==null)facts.push({role:'exit',text:t('tool.exit',{code:exit})});else state(t('tool.state.done'));
        if(duration!==null)facts.push({role:'duration',text:formatDuration(duration)});
      }else{
        tone='done';
        if(view.result.length)for(const text of view.result)facts.push({role:'result',text});else state(t('tool.state.done'));
        if(duration!==null&&duration>=1000)facts.push({role:'duration',text:formatDuration(duration)});
      }
      break;
    }
    case 'failed':{
      tone='failed';
      /* D-A2 (owner 04/10): a `prova` the kernel did not run says why, in words, and has no exit code to show. */
      const notRun=row.name==='prova'?notRunReason(row.finalOutput):null;
      state(notRun?t(notRun):t('tool.state.failed'));
      if(!notRun&&exit!==null)facts.push({role:'exit',text:t('tool.exit',{code:exit})});
      if(view.command&&duration!==null)facts.push({role:'duration',text:formatDuration(duration)});
      break;
    }
    case 'denied':tone='denied';state(t('tool.state.denied'));break;
    case 'cancelled':case 'interrupted':{
      tone='interrupted';
      /* owner 13/10/2026: an identical copy the kernel discarded was not interrupted by anybody, and never started */
      if(row.facts?.duplicate){state(t('tool.state.duplicate'));break;}
      const ran=row.startedAt!==null&&row.endedAt!==null?row.endedAt-row.startedAt:0;
      state(ran>=1000?t('tool.state.interruptedAfter',{duration:formatDuration(ran)}):t('tool.state.interrupted'));
      break;
    }
    default:tone='unknown';state(t('tool.state.unknown'));
  }
  const fitted=fit(label,target,facts,context.width);
  const {title,statusLabel}=composeLine(label,fitted.target,fitted.facts);

  const detail:string[]=[];
  if(row.status==='denied'){
    /* E9: the refusal's English reason (transcript-model.ts puts describeRefusal's sentence in finalOutput). */
    detail.push(truncateDisplay(sanitizeDisplayText(firstLine(row.finalOutput)||t('error.refused.generic')),detailWidth(context.width)));
  }else if(row.status==='failed'&&!view.showsOutput){
    detail.push(...boundedLines(withoutKernelExitLine(row.finalOutput).trim(),context.width,2));
  }
  detail.push(...view.detail);
  if(context.expanded){
    detail.push(...evidenceLines(row,context.width));
    // Q-R2-3: the raw kernel name is shown only here, in the expanded detail, as the secondary identifier.
    detail.push(truncateDisplay(sanitizeDisplayText(t('tool.detail.raw',{name:row.name})),detailWidth(context.width)));
  }
  return{title,statusLabel,line:title+SEPARATOR+statusLabel,detailLines:detail,tone,label,target:fitted.target,facts:fitted.facts.map(fact=>fact.text)};
}
