import {displayWidth,truncateDisplay} from '../text-width.ts';
import {sanitizeTranscriptText} from '../transcript-model.ts';
import type {DiffModel,DiffRow,DiffRowKind} from '../diff-model.ts';

export type DiffRenderLine={kind:DiffRowKind|'file';text:string};
export type DiffRenderModel={mode:'unified'|'narrow';lines:DiffRenderLine[];empty:boolean};

function safe(value:string){return sanitizeTranscriptText(value);}
function prefix(row:DiffRow){return row.kind==='add'?'+':row.kind==='remove'?'-':row.kind==='context'?' ':' ';}
function fit(value:string,width:number){const limit=Math.max(1,Math.floor(width));return displayWidth(value)<=limit?value:truncateDisplay(value,limit);}
function wideRow(row:DiffRow,width:number):DiffRenderLine{
  if(row.kind==='add'||row.kind==='remove'||row.kind==='context'){
    const old=row.oldLine===null?'':String(row.oldLine),next=row.newLine===null?'':String(row.newLine);
    const text=old.padStart(5)+' '+next.padStart(5)+' │ '+prefix(row)+safe(row.text);
    return{kind:row.kind,text:fit(text,width)};
  }
  return{kind:row.kind,text:fit(safe(row.text),width)};
}
function narrowRow(row:DiffRow,width:number):DiffRenderLine{
  const text=(row.kind==='add'||row.kind==='remove'||row.kind==='context'?prefix(row):'')+safe(row.text);
  return{kind:row.kind,text:fit(text,width)};
}

export function renderDiffModel(model:DiffModel,width:number):DiffRenderModel{
  const limit=Math.max(1,Math.floor(width)),mode:DiffRenderModel['mode']=limit>=72?'unified':'narrow';
  if(model.empty)return{mode,empty:true,lines:[{kind:'meta',text:'(no changes)'}]};
  const lines:DiffRenderLine[]=[];
  for(const plain of model.plain)lines.push(mode==='unified'?wideRow(plain,limit):narrowRow(plain,limit));
  for(const file of model.files){
    const label=(file.oldPath||'—')+(file.oldPath!==file.newPath?' → '+(file.newPath||'—'):'');
    lines.push({kind:'file',text:fit(safe(label),limit)});
    for(const row of file.rows)lines.push(mode==='unified'?wideRow(row,limit):narrowRow(row,limit));
  }
  return{mode,empty:false,lines};
}
