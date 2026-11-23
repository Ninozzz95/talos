/*
 * Stage 7.20 (mockup `markdownRows`, `inline`, `wrapSegs`): a note's Markdown as a sheet's rows — a heading in the accent,
 * bold; a «- » item as «  • » with its words wrapped under it; a code block between ``` as «  │ » rows; **bold** and `code`
 * inside a line. The same few forms the mockup draws, so a note's preview is the mockup's.
 */
import {pad,S,type Seg,type SegRow} from './sheet.ts';

const cells=(text:string)=>[...text].length;
/** **bold** and `code` inside a line (the mockup's `inline`). */
function inline(text:string,base:readonly string[]=[]):Seg[]{
  const out:Seg[]=[];const re=/(\*\*[^*]+\*\*|`[^`]+`)/gu;let last=0;let match:RegExpExecArray|null;
  while((match=re.exec(text))){
    if(match.index>last)out.push(S(text.slice(last,match.index),base));
    const token=match[0];
    out.push(token.startsWith('**')?S(token.slice(2,-2),[...base,'b']):S(token.slice(1,-1),['acc','code']));
    last=match.index+token.length;
  }
  if(last<text.length)out.push(S(text.slice(last),base));
  return out;
}
/** Segments wrapped by words to `width`, styles kept; a wrapped row starts with `indent` (the mockup's `wrapSegs`). */
function wrapSegs(segs:readonly Seg[],width:number,indent=''):SegRow[]{
  const words:Seg[]=[];for(const seg of segs)for(const part of seg.text.split(/(\s+)/u))if(part)words.push({...seg,text:part});
  const rows:Seg[][]=[];let current:Seg[]=[];let n=0;const ind=cells(indent);
  for(const word of words){
    const size=cells(word.text);
    if(n+size>width&&n>ind&&!/^\s+$/u.test(word.text)){rows.push(current);current=indent?[S(indent)]:[];n=ind;}
    if(n===ind&&/^\s+$/u.test(word.text)&&rows.length)continue;
    current.push(word);n+=size;
  }
  rows.push(current);return rows;
}
export function markdownRows(markdown:string,width:number):SegRow[]{
  const rows:SegRow[]=[];let inCode=false;
  for(const raw of markdown.split('\n')){
    if(raw.startsWith('```')){inCode=!inCode;continue;}
    if(inCode){rows.push([S('  │ ','faint'),S(pad(raw,Math.max(0,width-4)),'code')]);continue;}
    if(/^#{1,3} /u.test(raw)){rows.push([S(raw.replace(/^#+ /u,''),'acc b')]);continue;}
    if(/^- /u.test(raw)){rows.push(...wrapSegs([S('  • ','acc'),...inline(raw.slice(2))],width,'    '));continue;}
    if(!raw.trim()){rows.push([S('')]);continue;}
    rows.push(...wrapSegs(inline(raw),width));
  }
  return rows;
}
