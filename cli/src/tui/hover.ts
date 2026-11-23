/*
 * The element under the pointer lights up (owner 31/10 «ogni elemento cliccabile, e al passaggio evidenziato»; 01/11 «hover deve essere
 * preciso nel punto esatto»), measured in a real Windows Terminal on 01/11: DEC 1003 crosses ConPTY clean. The key is the element's own
 * cells, never its action: two places with one action are two elements. No React render: the row writer paints over the last frame.
 * One report per cell arrives; only the last position of a tick counts, and nothing is written while the target stays the same.
 */
import type {HitTarget} from './hit-map.ts';

export type HoverCell={row:number;col:number};
export type Hover={move(cell:HoverCell):void;refresh():void;clear():void};
const same=(left:readonly HitTarget[],right:readonly HitTarget[])=>left.length===right.length&&left.every((target,index)=>target.row===right[index]!.row&&target.from===right[index]!.from&&target.to===right[index]!.to&&target.action===right[index]!.action);

export function createHover({targetAt,paint,shape,defer=setImmediate}:{
  targetAt:(cell:HoverCell)=>readonly HitTarget[];paint:(targets:readonly HitTarget[])=>void;shape?:(over:boolean)=>void;defer?:(run:()=>void)=>unknown;
}):Hover{
  let cell:HoverCell|null=null,shown:readonly HitTarget[]=[],waiting=false;
  const apply=()=>{
    waiting=false;
    const next=cell?targetAt(cell):[];
    if(same(next,shown))return;
    shown=next;paint(next);shape?.(next.length>0);
  };
  const later=()=>{if(waiting)return;waiting=true;defer(apply);};
  return{
    move(next){cell=next;later();},
    /* a new frame may have put another element, or none, under a pointer that did not move */
    refresh(){if(cell||shown.length)later();},
    /* a press or a drag: the selection is the only thing painted over the frame */
    clear(){cell=null;apply();},
  };
}
