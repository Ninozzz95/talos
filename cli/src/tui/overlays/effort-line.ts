/*
 * R5a (owner 2026-09-24): the reasoning-effort selector. First "a line of nodes in TALOS's glyph style"; then, after the owner
 * compared it with Claude Code 2.1.282's (`Faster … Smarter`, evenly spaced levels, a ▲ under the chosen one, `←/→ to
 * adjust · Enter to confirm`): "rendilo migliore e mi raccomando accento ambra e gli effort in ordine da default … max".
 *
 *   Effort · Z.ai: GLM 5.3 Flash
 *   Faster                                 Smarter
 *      ○────────○────────○────────●────────○   (a slider: amber up to and including ●, dim after it)
 *                                 ▲                      (amber: the theme's accent)
 *   default   low     medium    high      max
 *                             ────                       (amber)
 *   High: deeper reasoning, slower, more tokens.
 *   In use now: medium
 *   ← → adjust · Enter confirm · Esc cancel
 *
 * The levels are always in TALOS's order (default, minimal, low, medium, high, xhigh, max; an unknown level last), never in
 * the order a model declares them (the owner's frame showed `default — max — high — low`). Only the model's own levels are
 * shown. Beyond Claude Code's: the level in use is named when another is highlighted, each level has its sentence, and a
 * screen too narrow for every level trims the far ends with `…` around the chosen one. ASCII on a plain terminal.
 * Pure: app.ts opens it and applies the choice.
 */
import {t,type MessageId} from '../../i18n/index.ts';
import {displayWidth} from '../text-width.ts';
import type {OverlayContent} from './scroll-window.ts';

/* `filledTo`: the track's columns up to and including the chosen node, drawn in the accent (the slider, owner 2026-09-25). */
export type EffortLineRows={axis:string;track:string;pointer:string;labels:string;underline:string;sentence:string;filledTo:number};
const ORDER=['default','minimal','low','medium','high','xhigh','max'];
const KNOWN=new Set(['default','low','medium','high','xhigh','max']);

/** TALOS's order: default first, then the known levels from the least to the most reasoning; unknown ones last, as declared. */
export function orderedEfforts<T extends string>(levels:readonly T[]):T[]{
  const rank=(level:string)=>{const at=ORDER.indexOf(level);return at<0?ORDER.length:at;};
  return levels.map((level,index)=>({level,index})).sort((a,b)=>rank(a.level)-rank(b.level)||a.index-b.index).map(row=>row.level);
}

/** One level's sentence (the known levels have their own; any other declared level is named as such). */
export function effortSentence(level:string):string{
  return KNOWN.has(level)?t(`screen.effort.describe.${level}` as MessageId):t('screen.effort.describe.other',{level});
}

type Glyphs={node:string;chosen:string;rule:string;pointer:string;more:string};
const glyphs=(unicode:boolean):Glyphs=>unicode?{node:'○',chosen:'●',rule:'─',pointer:'▲',more:'…'}:{node:'o',chosen:'*',rule:'-',pointer:'^',more:'...'};

/* The nodes lo..hi evenly spaced, `slot` columns apart, after `lead` columns (room for `…`); each label centred under its
   node, as Claude Code centres its levels. */
function layout(choices:readonly string[],lo:number,hi:number,slot:number,lead:number,widest:number){
  const starts:number[]=[],centers:number[]=[];let width=0;
  for(let i=lo;i<=hi;i++){
    const center=lead+Math.floor(widest/2)+(i-lo)*slot,size=displayWidth(choices[i]!),start=Math.max(lead,center-Math.floor(size/2));
    centers.push(center);starts.push(start);width=Math.max(width,start+size);
  }
  return{starts,centers,width};
}
const put=(row:string[],at:number,text:string)=>{for(let i=0;i<text.length;i++)row[at+i]=text[i]!;};
const line=(row:string[])=>row.join('').replace(/\s+$/u,'');

export function effortLineRows({choices,selected,width,unicode}:{choices:readonly string[];selected:number;width:number;unicode:boolean}):EffortLineRows{
  const g=glyphs(unicode),n=choices.length;
  const chosen=Math.max(0,Math.min(n-1,Math.trunc(selected)||0));
  const widest=Math.max(1,...choices.map(c=>displayWidth(c)));
  const fit=(lo:number,hi:number)=>{
    const lead=lo>0?displayWidth(g.more)+1:0,tail=hi<n-1?displayWidth(g.more)+1:0,count=hi-lo;
    /* Evenly spaced, as roomy as the width allows (a label plus 1 to 5 columns). */
    const slot=count===0?widest:Math.max(widest+1,Math.min(widest+5,Math.floor((width-lead-tail-widest)/count)));
    const view=layout(choices,lo,hi,slot,lead,widest);
    return{lo,hi,lead,tail,slot,view,fits:view.width+tail<=width};
  };
  let lo=0,hi=n-1,best=fit(lo,hi);
  /* Too narrow for every level: drop the level farthest from the chosen one until it fits (or only the chosen one is left). */
  while(!best.fits&&(lo<chosen||hi>chosen)){if(chosen-lo>=hi-chosen)lo++;else hi--;best=fit(lo,hi);}
  const {view}=best;const total=view.width+best.tail;
  const blank=()=>Array.from({length:Math.max(total,1)},()=>' ');
  const track=blank(),pointer=blank(),labels=blank(),underline=blank();
  const first=view.centers[0]!,lastCenter=view.centers.at(-1)!;
  for(let c=first;c<=lastCenter;c++)track[c]=g.rule;
  view.centers.forEach((c,k)=>{track[c]=lo+k===chosen?g.chosen:g.node;});
  if(lo>0){put(track,0,g.more);put(labels,0,g.more);}
  if(hi<n-1){put(track,view.width+1,g.more);put(labels,view.width+1,g.more);}
  view.starts.forEach((s,k)=>put(labels,s,choices[lo+k]!));
  const k=chosen-lo;
  pointer[view.centers[k]!]=g.pointer;
  put(underline,view.starts[k]!,g.rule.repeat(displayWidth(choices[chosen]!)));
  const faster=t('screen.effort.faster'),smarter=t('screen.effort.smarter');
  const gap=Math.max(1,total-displayWidth(faster)-displayWidth(smarter));
  return{axis:`${faster}${' '.repeat(gap)}${smarter}`,track:line(track),pointer:line(pointer),labels:line(labels),underline:line(underline),sentence:effortSentence(choices[chosen]!),filledTo:view.centers[k]!+1};
}

export function effortLineOverlay({name,choices,selected,current=null,width,unicode}:{name:string;choices:readonly string[];selected:number;current?:string|null;width:number;unicode:boolean}):OverlayContent{
  const rows=effortLineRows({choices,selected,width,unicode});
  const chosen=choices[Math.max(0,Math.min(choices.length-1,selected))]??null;
  return{
    head:[{text:t('screen.effort.lineTitle',{model:name}),tone:'title'},{text:t('screen.effort.policy'),tone:'dim'}],
    sections:[{lines:[
      /* A slider: amber from the start up to and including the chosen node, dim after it (owner 2026-09-25). */
      {text:rows.axis,tone:'dim'},{text:rows.track,tone:'dim',accentTo:rows.filledTo},{text:rows.pointer,tone:'accent'},
      {text:rows.labels,tone:'plain'},{text:rows.underline,tone:'accent'},
      {text:rows.sentence,tone:'plain'},
      ...(current&&chosen&&current!==chosen?[{text:t('screen.effort.inUse',{level:current}),tone:'dim' as const}]:[]),
    ]}],
    foot:[{text:t('screen.effort.keys'),tone:'dim'}],
  };
}
