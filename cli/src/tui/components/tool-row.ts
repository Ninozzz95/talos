import {t,tn} from '../../i18n/index.ts';
import {looksItalian} from '../../i18n/kernel-map.ts';
import type {ToolDenial} from '../tool-facts.ts';
import {rendererKindFor} from '../tool-display.ts';
import {renderTool,type ToolRenderResult,type ToolRowModel} from '../tools/registry.ts';
import {lineCount,sanitizeDisplayText} from '../tools/shared.ts';
import {displayWidth,truncateMiddle} from '../text-width.ts';

/* R5a (lane R's events reduced by transcript-model.ts): the facts this view adds to the ONE row. */
export type ToolRowViewModel=ToolRowModel&{
  savedOutput?:{path:string;keptChars:number;totalChars:number}|null;
  readCut?:{shownLines:number;totalLines:number|null;limitChars:number}|null;
  readLines?:{shownLines:number;totalLines:number|null}|null;
  askedPerson?:boolean;
};

const SEPARATOR=' · ';
/* A target cut narrower than this names nothing (row-format.ts keeps 12 for the same reason). */
const TARGET_MIN=12;
const number=(value:number)=>new Intl.NumberFormat('en-US').format(Math.round(value));
const clean=(value:unknown)=>sanitizeDisplayText(String(value??'')).replace(/\s*\n\s*/gu,' ').trim();

/*
 * R5a S10 (owner decision Q-R5-17; gate finding 15): why a tool did NOT run, from lane R's `facts.denial`. A rule or the
 * policy deciding alone names itself (`denied by rule …`, `denied by policy: …`); "you did not approve it" is written only
 * when the person was asked and said no — `denial.by === 'person'`, or, before lane R's facts arrive, a row whose
 * approval dialog this transcript opened. A reason that is not English is not shown (E14); the kernel's Italian `via` and
 * reason are taken off the evidence of a denied row, so its expanded view has no Italian either.
 */
export function denialSentence(denial:ToolDenial|null|undefined):string|null{
  if(!denial)return null;
  const reason=denial.reason&&!looksItalian(denial.reason)?clean(denial.reason).replace(/\.$/u,''):'';
  if(denial.by==='person')return t('tool.denied.person');
  if(denial.by==='rule'){
    const rule=clean(denial.rule);
    if(!rule)return reason?t('tool.denied.policy',{reason}):t('tool.denied.policyNoReason');
    const scope=clean(denial.scope);
    return scope?t('tool.denied.ruleScoped',{rule,scope}):t('tool.denied.rule',{rule});
  }
  if(denial.by==='mode')return reason?t('tool.denied.mode',{reason}):t('tool.denied.modeNoReason');
  return reason?t('tool.denied.policy',{reason}):t('tool.denied.policyNoReason');
}
function deniedRow(row:ToolRowViewModel):ToolRowViewModel{
  if(row.status!=='denied')return row;
  const denial=row.facts?.denial??null;
  let sentence=denialSentence(denial);
  /* No decider named yet: the kernel's "you did not approve it" stands only if the person was asked; otherwise the row says
     only what is known, that the action was refused (a policy deny reaches the kernel as the same "no", gate finding 15). */
  if(!sentence&&!row.askedPerson&&String(row.finalOutput??'').split(/\r?\n/u)[0]?.trim()===t('error.refused.notApproved'))sentence=t('error.refused.generic');
  const outcome=row.outcome&&(row.outcome.permissionVia!==null||row.outcome.permissionReason!==null)?{...row.outcome,permissionVia:null,permissionReason:null}:row.outcome;
  return{...row,...(sentence?{finalOutput:sentence}:{}),...(outcome!==row.outcome?{outcome}:{})};
}

/*
 * R5a S7 (owner decision Q-R5-11; gate finding 4): a read the kernel cut says so on its row, `450 of 500 lines · cut at
 * 8,000 characters`, in place of the line count of what came back (which counted a partial last line). The row is fitted
 * again: the target is cut in the middle to make room; when that would leave the target narrower than 12 columns (60
 * columns and a long path), `cut at …` moves to the first detail line instead. The height estimate measures this same row.
 */
/*
 * 0.6.13 gate (s21/s22 R5A-READCUT): with no kernel cut, the lines the model got (transcript-model.ts `readLines`, from the whole
 * result) replace the count of the screen's tail: `2,000 of 3,000 lines` for a page, `1,500 lines` for a whole long read. A range
 * the call asked for (`lines 10–19`) is said as asked and stays.
 */
/*
 * review 17 R17-1 of 0.6.13: `2,000 of 3,000 lines` is wider than the count it replaces, so the row is fitted again to `width` with
 * the same re-fit as `withReadCut` (a long path in 60 columns gave a line 71 wide, which wrapped onto two screen lines).
 */
function withReadLines(row:ToolRowViewModel,result:ToolRenderResult,width:number):ToolRenderResult{
  const read=row.readLines;
  if(!read||row.readCut||row.status!=='completed'||rendererKindFor(row.name)!=='read')return result;
  const index=result.facts.indexOf(tn('tool.result.lines',lineCount(row.finalOutput)));
  if(index<0)return result;
  const said=read.totalLines!==null&&read.shownLines<read.totalLines
    ?t('tool.read.cutLines',{shown:number(read.shownLines),total:number(read.totalLines)})
    :tn('tool.result.lines',read.shownLines,{count:number(read.shownLines)});
  const onRow=fittedRow(result,refitFacts(result,index,[said],width),result.detailLines);
  /* review 18 R18-3 of 0.6.13 (0.6.14): under about 34 columns the row does not fit even with the target cut to «…»; the count goes to
     the first detail line, as withReadCut does with «cut at», and the row stays one screen line */
  if(!Number.isFinite(width)||displayWidth(onRow.line)<=width)return onRow;
  return fittedRow(result,refitFacts(result,index,[],width),[said,...result.detailLines]);
}
/* The read facts put in place of the fact at `index` (after the facts when there is none), and the target cut in the middle so that
   the row fits `width` again; `room` is the columns the target may take. */
function refitFacts(result:ToolRenderResult,index:number,added:string[],width:number){
  const facts=index>=0?[...result.facts.slice(0,index),...added,...result.facts.slice(index+1)]:[...result.facts,...added];
  const statusLabel=facts.join(SEPARATOR);
  const lineOf=(shown:string)=>result.label+(shown?' '+shown:'')+SEPARATOR+statusLabel;
  const room=Number.isFinite(width)?width-displayWidth(lineOf(''))-1:Number.POSITIVE_INFINITY;
  return{facts,statusLabel,room,target:!result.target||displayWidth(lineOf(result.target))<=width?result.target:room>=1?truncateMiddle(result.target,room):'…'};
}
function fittedRow(result:ToolRenderResult,fitted:ReturnType<typeof refitFacts>,detailLines:string[]):ToolRenderResult{
  const title=result.label+(fitted.target?' '+fitted.target:'');
  /* review 1 of 0.6.14 (A-2): with its only fact moved to a detail line (R18-3) the row has no status, and no separator hangs after the title */
  return{...result,title,statusLabel:fitted.statusLabel,line:fitted.statusLabel?title+SEPARATOR+fitted.statusLabel:title,target:fitted.target,facts:fitted.facts,detailLines};
}
function withReadCut(row:ToolRowViewModel,result:ToolRenderResult,width:number):ToolRenderResult{
  const cut=row.readCut;
  if(!cut||row.status!=='completed'||rendererKindFor(row.name)!=='read')return result;
  const lines=cut.totalLines===null?tn('tool.result.lines',cut.shownLines,{count:number(cut.shownLines)}):t('tool.read.cutLines',{shown:number(cut.shownLines),total:number(cut.totalLines)});
  const cutAt=t('tool.read.cutAt',{limit:number(cut.limitChars)});
  const counted=tn('tool.result.lines',lineCount(row.finalOutput));
  const index=result.facts.indexOf(counted);
  /* Both facts on the row while the target keeps a readable width; otherwise the cut goes to the first detail line. */
  let fitted=refitFacts(result,index,[lines,cutAt],width),detailLines=result.detailLines;
  if(result.target&&fitted.target!==result.target&&fitted.room<TARGET_MIN){fitted=refitFacts(result,index,[lines],width);detailLines=[cutAt,...detailLines];}
  return fittedRow(result,fitted,detailLines);
}
/*
 * R5a S6 (owner decision Q-R5-10; gate E6): a command output the executor kept in a private file says how much the row
 * holds and where the whole output is — the first detail line, in both views, so the way back is always under the row.
 */
function withSavedOutput(row:ToolRowViewModel,result:ToolRenderResult):ToolRenderResult{
  const saved=row.savedOutput;
  if(!saved)return result;
  const line=clean(t('tool.output.saved',{kept:number(saved.keptChars),total:number(saved.totalChars)}));
  return{...result,detailLines:[line,clean(saved.path),...result.detailLines]};
}

/* R3 gate E1: the ONE tool row (tools/row-format.ts). app.ts draws `title + ' · ' + statusLabel` (= `line`) and the dim
   `detailLines`; the height estimate, the search/copy text and the exit transcript read the same result. `now` (optional,
   default the clock) is the time a running row's elapsed is measured at, so a caller that re-renders once a second can
   pass its own tick and a test can pin it. R5a: the denial, the read cut and the kept output are added here, once, for
   every one of those readers. */
export function toolRowView(row:ToolRowViewModel,width:number,expanded:boolean,now?:number):ToolRenderResult{
  const shown=deniedRow(row);
  return withSavedOutput(shown,withReadCut(shown,withReadLines(shown,renderTool(shown,width,expanded,now),width),width));
}
