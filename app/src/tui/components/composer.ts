import type {EditorState} from '../editor.ts';
import {composerSegments} from '../editor.ts';


export type ComposerStore={
  getSnapshot:()=>EditorState;
  subscribe:(listener:()=>void)=>(()=>void);
  update:(fn:(editor:EditorState)=>EditorState)=>EditorState;
  replace:(next:EditorState)=>EditorState;
};

export function createComposerStore(initial:EditorState):ComposerStore{
  let snapshot=initial;
  const listeners=new Set<()=>void>();
  const publish=(next:EditorState)=>{
    if(next===snapshot)return snapshot;
    snapshot=next;
    for(const listener of [...listeners])listener();
    return snapshot;
  };
  return{
    getSnapshot:()=>snapshot,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    update(fn){return publish(fn(snapshot));},
    replace(next){return publish(next);},
  };
}

export type ComposerFastTextInput={
  bootPhase:string;
  focus:string;
  modalOwner:boolean;
  vimMode:string;
  auxCount:number;
  key:{ctrl?:boolean;meta?:boolean};
  routed:null|{kind:string;text?:string};
};

export function composerFastTextInput(input:ComposerFastTextInput):string|null{
  if(input.bootPhase!=='ready'||input.focus!=='composer'||input.modalOwner||input.auxCount!==0)return null;
  if(input.vimMode!=='disabled'&&input.vimMode!=='insert')return null;
  if(input.key.ctrl||input.key.meta)return null;
  if(input.routed?.kind!=='text'||typeof input.routed.text!=='string'||input.routed.text.length!==1)return null;
  const code=input.routed.text.charCodeAt(0);
  return code<32||code===127?null:input.routed.text;
}

export type HistorySearchState={query:string;nextIndex:number;matchIndex:number|null};
export function reverseHistoryMatch(history:readonly string[],query:string,from=0):{index:number;value:string}|null{for(let i=Math.max(0,from);i<history.length;i++){if(history[i]!.toLowerCase().includes(query.toLowerCase()))return{index:i,value:history[i]!};}return null;}
export function composerDisplay(state:EditorState){return composerSegments(state);}
