/*
 * Stage 3: the question card drawn as the approved mockup draws it (`questionCard` and `cardRows` in
 * lavoro/MOCKUP-FASE-UI-2026-10-01.html; golden frames step-03-domande-del-modello-*), with real terminal cell widths
 * (string-width through text-width.ts) where the mockup counted code points. Rows of styled segments: the roles are the
 * mockup's (acc, b, i, dim, faint, inv, ok, warn, code, add, del, pill) so the conformance gate can compare them, and a
 * segment may carry the click target the mockup gives it (qtab:N, opt:N, send).
 */
import {displayWidth,splitGraphemes} from './text-width.ts';
import {t} from '../i18n/index.ts';
import {shownOptions,tabTitle,unansweredCount,type QuestionCardState} from './question-card.ts';

export type CardSegment={text:string;roles:string[];action?:string};
export type CardRow=CardSegment[];
const seg=(text:string,roles='',action?:string):CardSegment=>({text,roles:roles.split(' ').filter(Boolean),...(action?{action}:{})});

function cells(text:string,width:number):string{let out='',used=0;for(const g of splitGraphemes(text)){const w=displayWidth(g);if(used+w>width)break;out+=g;used+=w;}return out;}
export function fit(row:CardRow,width:number):CardRow{
  const out:CardRow=[];let used=0;
  for(const s of row){if(used>=width)break;const take=cells(s.text,width-used);if(take)out.push({...s,text:take});used+=displayWidth(take);}
  if(used<width)out.push(seg(' '.repeat(width-used)));
  return out;
}
export function trunc(text:string,width:number):string{return displayWidth(text)>width?cells(text,Math.max(0,width-1))+'…':text;}
function pad(text:string,width:number):string{const w=displayWidth(text);return w>=width?cells(text,width):text+' '.repeat(width-w);}
function wrapWords(row:CardRow,width:number):CardRow[]{
  const words:CardRow=[];for(const s of row)for(const part of s.text.split(/(\s+)/u))if(part)words.push({...s,text:part});
  const rows:CardRow[]=[];let current:CardRow=[];let used=0;
  for(const word of words){const w=displayWidth(word.text);if(used+w>width&&used>0&&!/^\s+$/u.test(word.text)){rows.push(current);current=[];used=0;}if(used===0&&/^\s+$/u.test(word.text)&&rows.length)continue;current.push(word);used+=w;}
  rows.push(current);return rows;
}
/* The mockup's clock: whole seconds, floored («4m 54s», «58s»). */
export function cardClock(ms:number):string{const s=Math.floor(Math.max(0,ms)/1000);return s<60?`${s}s`:`${Math.floor(s/60)}m ${String(s%60).padStart(2,'0')}s`;}

export function questionCardRows(state:QuestionCardState,width:number,now:number):CardRow[]{
  const rows:CardRow[]=[];const inner=width-4;const narrow=width<100;
  const question=state.questions[state.qi]!;
  const tabs:CardRow=[seg('  ')];
  state.questions.forEach((q,i)=>{const done=state.answers[q.id]!==undefined;tabs.push(seg(` ${done?'✓ ':''}${tabTitle(q)} `,i===state.qi&&!state.review?'inv':done?'ok':'dim',`qtab:${i}`),seg(' '));});
  if(state.review)tabs.push(seg(` ${t('screen.question.review')} `,'inv'));
  const unanswered=unansweredCount(state);
  const title:CardRow=[seg('╭─ ','acc'),seg(state.asker!==undefined?t('screen.question.agentTitle',{task:state.asker||t('screen.question.agentUnnamed')}):t('screen.question.title'),'acc b'),seg(t('screen.question.position',{n:state.qi+1,total:state.questions.length})+(unanswered?t('screen.question.unanswered',{count:unanswered}):''),'dim')];
  if(state.deadline!==null){const left=state.deadline-now;title.push(seg(t('screen.question.closesIn',{clock:cardClock(left)}),left<60_000?'warn':'faint'));}
  rows.push(title,tabs);
  const wrapAll=(list:CardRow[])=>[...list.map(r=>[seg('│ ','acc'),...fit(r,inner+1)]),[seg(`╰${'─'.repeat(width-2)}╯`,'acc')]];
  if(state.review){
    rows.push([seg('')],[seg(`  ${t('screen.question.ready')}`,'b')]);
    for(const q of state.questions){const a=state.answers[q.id];rows.push([seg(`   ${pad(tabTitle(q),12)}`,'dim'),seg(a===undefined?t('screen.question.skipped'):Array.isArray(a)?a.join(', '):a,a===undefined?'faint':'')]);}
    rows.push([seg('')],[seg('  '),seg(` ${t('screen.question.send')} `,'pill','send'),seg('   '),seg(` ${t('screen.question.change')} `,'dim','qtab:0'),seg(`   ${t('screen.question.reviewHint')}`,'faint')]);
    return wrapAll(rows);
  }
  rows.push([seg('')]);
  for(const r of wrapWords([seg(question.question,'b')],inner))rows.push([seg('  '),...r]);
  if(question.why)rows.push([seg(`  ${question.why}`,'dim i')]);
  rows.push([seg('')]);
  const options=shownOptions(question);
  const preview=!narrow?question.options?.[state.sel]?.preview:undefined;
  const listWidth=preview?Math.floor(inner*0.52):inner;
  const optionRows:CardRow[]=[];
  options.forEach((option,i)=>{
    const selected=i===state.sel;const picked=question.multiSelect&&(state.picks[question.id]??[]).includes(option.label);
    const mark=question.multiSelect?(picked?'[x] ':'[ ] '):'';
    const label=`${i+1}. ${mark}${option.label}${option.recommended?`  ${t('screen.question.recommended')}`:''}`;
    optionRows.push([seg(selected?' › ':'   ',selected?'acc':''),seg(trunc(label,listWidth-4),selected?'acc b':option.recommended?'b':'',`opt:${i}`)]);
    if(option.other&&selected&&state.editing?.kind==='other')optionRows.push([seg('     '),seg(pad(`${state.editing.text}▍`,listWidth-6),'code')]);
    else optionRows.push([seg(`     ${trunc(option.description,listWidth-6)}`,'dim','',),].map(s=>({...s,action:`opt:${i}`})));
  });
  if(!question.options&&state.editing?.kind==='free')optionRows.push([seg('   '),seg(pad(`${state.editing.text}▍`,inner-4),'code')]);
  if(preview){
    const lines=preview.split('\n');
    for(let i=0;i<Math.max(optionRows.length,lines.length+1);i++){
      const left=optionRows[i]??[seg('')];
      const line=lines[i-1]??'';
      const right=i===0?[seg('│ ','faint'),seg(t('screen.question.preview'),'faint')]:[seg('│ ','faint'),seg(line,line.startsWith('+')?'add':line.startsWith('-')?'del':'code')];
      rows.push([...fit(left,listWidth),seg(' '),...right]);
    }
  }else rows.push(...optionRows);
  if(state.editing?.kind==='note')rows.push([seg(`  ${t('screen.question.note')}`,'faint'),seg(pad(`${state.editing.text}▍`,inner-8),'code')]);
  else if(state.notes[question.id])rows.push([seg(`  ${t('screen.question.note')}`,'faint'),seg(state.notes[question.id]!,'dim')]);
  rows.push([seg('')]);
  const last=state.qi===state.questions.length-1;
  rows.push([seg(`  ${t('screen.question.hint',{toggle:question.multiSelect?t('screen.question.hint.toggle'):'',next:t(last?'screen.question.hint.toReview':'screen.question.hint.next')})}`,'faint')]);
  return wrapAll(rows);
}
