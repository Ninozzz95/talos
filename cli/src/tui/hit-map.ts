/*
 * Stage 6c (owner 01/10 «tutto cliccabile», decisions 02/10; registro 12). The approved mockup marks its clickable segments
 * (`data-a`, dispatched by `click(verb:arg)`); here a styled segment may carry the same `action`. Codex's mouse works on the
 * most recently painted layout (tui/src/analytics/mouse.rs), so after each paint every block of rows says where it was laid
 * out (Ink's measureElement: layout coordinates, which are the screen's in the full screen) and the targets are rebuilt from
 * them; a block drawn later is on top. Pure.
 */
import {displayWidth} from './text-width.ts';

/* `element`: pieces that are one thing to the person (a list voice on two rows, its mark and its label) light up together; without it a piece is its own element, whatever its action */
export type HitSegment={text:string;action?:string;element?:string};
/* `clip`: the screen rows the block is seen in (a transcript item partly above or below its region is cut there) */
export type HitBlock={x:number;y:number;rows:readonly (readonly HitSegment[])[];clip?:{top:number;bottom:number}};
export type HitTarget={row:number;from:number;to:number;action:string;element?:string};

/** The cells each action covers, block by block, in drawing order. */
export function hitTargets(blocks:readonly HitBlock[]):HitTarget[]{
  const out:HitTarget[]=[];
  for(const block of blocks){
    block.rows.forEach((row,index)=>{
      const at=block.y+index;
      if(block.clip&&(at<block.clip.top||at>block.clip.bottom))return;
      let col=block.x;
      for(const segment of row){
        const width=displayWidth(segment.text);
        if(segment.action&&width>0)out.push({row:at,from:col,to:col+width-1,action:segment.action,...(segment.element?{element:segment.element}:{})});
        col+=width;
      }
    });
  }
  return out;
}

/** The element under a cell, the last drawn on top; null where nothing is clickable. */
export function hitTargetAt(targets:readonly HitTarget[],cell:{row:number;col:number}):HitTarget|null{
  for(let i=targets.length-1;i>=0;i--){const target=targets[i]!;if(target.row===cell.row&&cell.col>=target.from&&cell.col<=target.to)return target;}
  return null;
}
/** Every piece of the element under a cell: what the hover lights. */
export function hitElementAt(targets:readonly HitTarget[],cell:{row:number;col:number}):HitTarget[]{
  const hit=hitTargetAt(targets,cell);if(!hit)return[];
  return hit.element?targets.filter(target=>target.element===hit.element):[hit];
}
/** Its action: hover and click read the same cells. */
/** One reading per frame: a mouse moving over the screen asks far more often than the screen changes. */
export function frameMemo<T>(compute:()=>T):{get():T;clear():void}{
  let held:{value:T}|null=null;
  return{get:()=>(held??={value:compute()}).value,clear:()=>{held=null;}};
}

/** The blocks of the frame around the chat. While a card is open they take no click and no hover, as they take no key: what waits is answered first. */
export const FRAME_BLOCKS:ReadonlySet<string>=new Set(['header','mode-row','model-row','agents-pill','bar-rows','panel-rows']);

/** A block inside a hidden box is not on screen, whatever the layout says of it: it takes no click and no hover. */
export function inHiddenBox(node:unknown):boolean{
  for(let at=node as {style?:{display?:string};parentNode?:unknown}|null|undefined;at;at=at.parentNode as typeof at)if(at.style?.display==='none')return true;
  return false;
}

export function hitAt(targets:readonly HitTarget[],cell:{row:number;col:number}):string|null{return hitTargetAt(targets,cell)?.action??null;}
