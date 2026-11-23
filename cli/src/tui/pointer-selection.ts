/*
 * Stage 6c (owner 02/10: «mouse acceso, selezione della CLI»: copy on release, double click a word, Ctrl+C in the VS Code
 * terminal; registro 12). The approved mockup's pointer flow (MOCKUP-FASE-UI-2026-10-01.html:1063, 1116-1119): a press
 * starts a selection where it lands and clears the old one; a drag draws it through the row writer (only the rows it covers,
 * no React render); the release copies it and says how many lines; a double click copies the word under the pointer; any key
 * takes the selection away. Ctrl+C with a selection copies it again (the VS Code terminal passes Ctrl+C to TALOS; its own
 * copy only works on its own selection, «Terminal Basics»). Only the left button selects.
 */
import type {PointerEvent} from './mouse.ts';
import type {CopyResult,CopyWhere} from './clipboard.ts';
import {selectedText,wordAt,type Cell,type Selection} from './selection.ts';
import type {HitTarget} from './hit-map.ts';

/* Two presses on the same cell within this time are a double click (the common desktop default is 500 ms). */
const DOUBLE_CLICK_MS=400;
/* stage 6c: what the app gives the pointer — the target under a cell (hit-map.ts) and how to run one */
export type ClickHandler={target(cell:Cell):string|null;element?(cell:Cell):readonly HitTarget[];/* FE-048: a new frame was painted */frame?():void;run(action:string):void;/* FE-048: the column a cell is in */column?(cell:Cell):{from:number;to:number}|null};
export type CopiedInfo={kind:'lines';count:number;where:CopyWhere|null}|{kind:'word';word:string;where:CopyWhere|null}|{kind:'failed'};

export function createPointerSelection({writer,now=Date.now,copy,onCopied,target,run,column}:{
  column?:(cell:Cell)=>{from:number;to:number}|null;
  writer:{select(selection:Selection|null):void;lines():string[]};
  now?:()=>number;copy:(text:string)=>Promise<CopyResult>;onCopied:(info:CopiedInfo)=>void;
  /* stage 6c «tutto cliccabile»: the clickable target under a cell (hit-map.ts), and running it. Owner 02/10 «Al rilascio»
     (WCAG 2.5.2 Pointer Cancellation; OpenCode #24986): it runs when the press and the release land on it with no drag
     between — dragging away cancels it and selects instead, so a drag that starts on an answer never sends it. */
  target?:(cell:Cell)=>string|null;run?:(action:string)=>void;
}){
  let anchor:Cell|null=null,current:Selection|null=null,lastPress:{at:number;cell:Cell}|null=null,pressed:string|null=null;
  const show=(next:Selection|null)=>{current=next;writer.select(next);};
  const send=async(text:string,info:(where:CopyWhere)=>CopiedInfo)=>{const result=await copy(text);onCopied(result.ok?info(result.where):{kind:'failed'});return result.ok;};
  return{
    /** A pointer report; resolves once a release has been copied. */
    async pointer(event:PointerEvent){
      if(event.button!==0)return;
      const cell={row:event.row,col:event.col};
      if(event.kind==='press'){
        /* on a target: remembered for the release, and the start of a selection if the pointer drags away */
        pressed=target?.(cell)??null;
        if(pressed){anchor=cell;lastPress=null;if(current)show(null);return;}
        const double=lastPress!==null&&now()-lastPress.at<=DOUBLE_CLICK_MS&&lastPress.cell.row===cell.row&&lastPress.cell.col===cell.col;
        lastPress=double?null:{at:now(),cell};anchor=double?null:cell;
        if(double){
          const word=wordAt(writer.lines()[cell.row]??'',cell.col);
          if(!word){show(null);return;}
          show({a:{row:cell.row,col:word.start},b:{row:cell.row,col:word.end}});
          await send(word.text,where=>({kind:'word',word:word.text,where}));
          return;
        }
        show(null);return;
      }
      if(!anchor)return;
      if(event.kind==='drag'){if(cell.row!==anchor.row||cell.col!==anchor.col){const bounds=column?.(anchor);show({a:anchor,b:cell,...(bounds?{column:bounds}:{})});}return;}
      /* release: a press cleared the selection, so only a drag left one to copy */
      const from=anchor;anchor=null;const clicked=pressed;pressed=null;
      if(!current){if(clicked&&target?.(cell)===clicked)run?.(clicked);return;}
      const text=selectedText(writer.lines(),from,current.b,current.column);
      if(!text)return;
      await send(text,where=>({kind:'lines',count:text.split('\n').length,where}));
    },
    /** Any key takes the selection away (the mockup's keydown). */
    key(){if(current)show(null);anchor=null;},
    /** The selected text, or null. */
    text():string|null{return current?selectedText(writer.lines(),current.a,current.b,current.column)||null:null;},
    /** Ctrl+C with a selection: copy it again; false when nothing is selected (Ctrl+C keeps its usual meaning). */
    async copyAgain():Promise<boolean>{const text=this.text();if(!text)return false;await send(text,where=>({kind:'lines',count:text.split('\n').length,where}));return true;},
  };
}
