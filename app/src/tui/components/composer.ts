import {composerSegments,copySelection,deleteBackward,deleteForward,killToEnd,killToStart,killWordBackward,moveCursor,moveVertical,moveWord,redoEditor,replaceEditorText,undoEditor,yank,type EditorState} from '../editor.ts';


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


export type ComposerFastEditorAction='backspace'|'delete-forward'|'left'|'right'|'home'|'end'|'word-left'|'word-right'|'select-left'|'select-right'|'select-home'|'select-end'|'select-up'|'select-down'|'select-word-left'|'select-word-right'|'kill-start'|'kill-end'|'kill-word'|'yank'|'undo'|'redo'|'copy-selection';
export type ComposerFastEditorActionInput={
  bootPhase:string;
  focus:string;
  modalOwner:boolean;
  vimMode:string;
  auxCount:number;
  routed:null|{kind:string;action?:string};
  editor:EditorState;
};

export function composerFastEditorAction(input:ComposerFastEditorActionInput):ComposerFastEditorAction|null{
  if(input.bootPhase!=='ready'||input.focus!=='composer'||input.modalOwner||input.auxCount!==0)return null;
  if(input.vimMode!=='disabled'&&input.vimMode!=='insert')return null;
  if(input.routed?.kind!=='action'||typeof input.routed.action!=='string')return null;
  const action=input.routed.action as ComposerFastEditorAction;
  const allowed:readonly ComposerFastEditorAction[]=['backspace','delete-forward','left','right','home','end','word-left','word-right','select-left','select-right','select-home','select-end','select-up','select-down','select-word-left','select-word-right','kill-start','kill-end','kill-word','yank','undo','redo','copy-selection'];
  if(!allowed.includes(action))return null;
  if(action==='delete-forward'&&input.editor.text.length===0)return null;
  return action;
}

export function applyComposerFastEditorAction(editor:EditorState,action:ComposerFastEditorAction):EditorState{
  if(action==='backspace')return deleteBackward(editor);
  if(action==='delete-forward')return deleteForward(editor);
  if(action==='left'||action==='right'||action==='home'||action==='end')return moveCursor(editor,action);
  if(action==='word-left')return moveWord(editor,-1);
  if(action==='word-right')return moveWord(editor,1);
  if(action==='select-left')return moveCursor(editor,'left',true);
  if(action==='select-right')return moveCursor(editor,'right',true);
  if(action==='select-home')return moveCursor(editor,'home',true);
  if(action==='select-end')return moveCursor(editor,'end',true);
  if(action==='select-up')return moveVertical(editor,-1,true);
  if(action==='select-down')return moveVertical(editor,1,true);
  if(action==='select-word-left')return moveWord(editor,-1,true);
  if(action==='select-word-right')return moveWord(editor,1,true);
  if(action==='kill-start')return killToStart(editor);
  if(action==='kill-end')return killToEnd(editor);
  if(action==='kill-word')return killWordBackward(editor);
  if(action==='yank')return yank(editor);
  if(action==='undo')return undoEditor(editor);
  if(action==='redo')return redoEditor(editor);
  if(action==='copy-selection')return copySelection(editor);
  return editor;
}


export type ComposerHistoryActionInput={
  bootPhase:string;
  focus:string;
  modalOwner:boolean;
  vimMode:string;
  auxCount:number;
  routed:null|{kind:string;action?:string};
  key:{ctrl?:boolean};
  editor:EditorState;
  history:readonly string[];
  historyIndex:number;
  reverseIndex:number;
};
export type ComposerHistoryPlan={editor:EditorState;historyIndex:number;reverseIndex:number};

export function planComposerHistoryAction(input:ComposerHistoryActionInput):ComposerHistoryPlan|null{
  if(input.bootPhase!=='ready'||input.focus!=='composer'||input.modalOwner||input.auxCount!==0)return null;
  if(input.vimMode!=='disabled'&&input.vimMode!=='insert')return null;
  if(input.routed?.kind!=='action'||typeof input.routed.action!=='string')return null;
  const action=input.routed.action;
  if(action!=='history-prev'&&action!=='history-next'&&action!=='history-search')return null;

  if(action==='history-search'){
    const found=reverseHistoryMatch(input.history,input.editor.text,input.reverseIndex);
    if(!found)return{editor:input.editor,historyIndex:input.historyIndex,reverseIndex:0};
    return{editor:replaceEditorText(input.editor,found.value),historyIndex:found.index,reverseIndex:found.index+1};
  }

  if(!input.key.ctrl){
    const moved=moveVertical(input.editor,action==='history-prev'?-1:1);
    const hadSelection=input.editor.selectionAnchor!==undefined;
    if(moved.cursor!==input.editor.cursor||hadSelection){
      return{editor:moved,historyIndex:input.historyIndex,reverseIndex:input.reverseIndex};
    }
  }

  if(input.history.length===0)return{editor:input.editor,historyIndex:input.historyIndex,reverseIndex:input.reverseIndex};
  const delta=action==='history-prev'?1:-1;
  const next=Math.max(-1,Math.min(input.history.length-1,input.historyIndex+delta));
  return{
    editor:replaceEditorText(input.editor,next>=0?(input.history[next]??''):''),
    historyIndex:next,
    reverseIndex:0,
  };
}

export type HistorySearchState={query:string;nextIndex:number;matchIndex:number|null};
export function reverseHistoryMatch(history:readonly string[],query:string,from=0):{index:number;value:string}|null{for(let i=Math.max(0,from);i<history.length;i++){if(history[i]!.toLowerCase().includes(query.toLowerCase()))return{index:i,value:history[i]!};}return null;}
export function composerDisplay(state:EditorState){return composerSegments(state);}
