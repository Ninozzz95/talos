import {displayWidth,splitGraphemes} from '../text-width.ts';
import {composerSegments,copySelection,deleteBackward,deleteForward,draftText,editorFromDraft,insertPaste,killToEnd,killToStart,killWordBackward,moveCursor,moveVertical,moveWord,redoEditor,undoEditor,yank,type ComposerSegment,type EditorDraft,type EditorState} from '../editor.ts';


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

export type ComposerPasteOwnership={
  bootPhase:string;
  focus:string;
  modalOwner:boolean;
  vimMode:string;
  auxCount:number;
};

export function composerOwnsPaste(input:ComposerPasteOwnership):boolean{
  if(input.bootPhase!=='ready'||input.focus!=='composer'||input.modalOwner||input.auxCount!==0)return false;
  return input.vimMode==='disabled'||input.vimMode==='insert';
}

export type ComposerFastPasteInput=ComposerPasteOwnership&{
  key:{ctrl?:boolean;meta?:boolean};
  routed:null|{kind:string;text?:string};
};

export function composerFastPasteInput(input:ComposerFastPasteInput):string|null{
  if(!composerOwnsPaste(input))return null;
  if(input.key.ctrl||input.key.meta)return null;
  if(input.routed?.kind!=='text'||typeof input.routed.text!=='string'||input.routed.text.length<=1)return null;
  return input.routed.text;
}

export function applyComposerFastPasteInput(editor:EditorState,text:string):EditorState{
  return insertPaste(editor,text);
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
  /* R4 Q-R4-9: an entry keeps its paste blocks (EditorDraft); a plain string is an entry without pastes. */
  history:readonly (string|EditorDraft)[];
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
    return{editor:editorFromDraft(input.history[found.index]??found.value),historyIndex:found.index,reverseIndex:found.index+1};
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
    editor:editorFromDraft(next>=0?(input.history[next]??''):''),
    historyIndex:next,
    reverseIndex:0,
  };
}

export type HistorySearchState={query:string;nextIndex:number;matchIndex:number|null};
export function reverseHistoryMatch(history:readonly (string|EditorDraft)[],query:string,from=0):{index:number;value:string}|null{for(let i=Math.max(0,from);i<history.length;i++){const value=draftText(history[i]!);if(value.toLowerCase().includes(query.toLowerCase()))return{index:i,value};}return null;}
export function composerDisplay(state:EditorState){return composerSegments(state);}

/*
 * R1 lane L (gate E3/E4, review D-02): the composer owns its line breaks. The text is hard-wrapped by grapheme into rows
 * of exactly the content width with the width function Ink lays out with, so the row count the budget receives is the
 * row count Ink renders, and a message longer than the composer's cap scrolls INSIDE the composer to the cursor instead
 * of growing past the screen (a recalled 60-line paste overwrote the header, footer and session line before R1).
 * Row 0 of the window starts with the prompt marker `>`; an arrow next to it says rows are hidden above/below.
 */
export type ComposerPiece={text:string;kind:ComposerSegment['kind'];selected:boolean};
export type ComposerLayout={rows:ComposerPiece[][];total:number;start:number;cursorRow:number;hiddenAbove:number;hiddenBelow:number};
export const COMPOSER_PREFIX_COLUMNS=2;

/*
 * R3 owner decision (keep TAB): a tab in the text is drawn as spaces up to the next COMPOSER_TAB_STOP, clipped at the end
 * of the row, so the width the budget measures is the width Ink draws (string-width gives a raw tab 0 cells, the terminal
 * up to 8). Display only: the editor keeps the tab, and the cursor on a tab is one cell at its start.
 */
export const COMPOSER_TAB_STOP=4;
export function composerRows(segments:readonly ComposerSegment[],contentWidth:number):{rows:ComposerPiece[][];cursorRow:number}{
  const width=Math.max(1,Math.floor(contentWidth));const rows:ComposerPiece[][]=[[]];let used=0,cursorRow=0;
  const push=(text:string,kind:ComposerSegment['kind'],selected:boolean)=>{
    const row=rows[rows.length-1]!;const last=row[row.length-1];
    if(last&&last.kind===kind&&last.selected===selected&&kind!=='cursor')last.text+=text;else row.push({text,kind,selected});
  };
  const breakRow=()=>{rows.push([]);used=0;};
  const tabCells=()=>{if(used>=width)breakRow();return Math.min(COMPOSER_TAB_STOP-(used%COMPOSER_TAB_STOP),width-used);};
  for(const segment of segments){
    const selected=Boolean(segment.selected);
    if(segment.kind==='cursor'&&segment.text==='\t'){
      const w=tabCells();cursorRow=rows.length-1;push(' ','cursor',selected);if(w>1)push(' '.repeat(w-1),'text',selected);used+=w;
      continue;
    }
    if(segment.kind==='cursor'){
      /* The cursor on a line break is drawn as a cell at the end of the row, then the row breaks. */
      const cell=segment.text==='\n'||segment.text===''?' ':segment.text;const w=Math.max(1,displayWidth(cell));
      if(used+w>width&&used>0)breakRow();
      cursorRow=rows.length-1;push(cell,'cursor',selected);used+=w;
      if(segment.text==='\n')breakRow();
      continue;
    }
    for(const g of splitGraphemes(segment.text)){
      if(g==='\n'||g==='\r\n'){breakRow();continue;}
      if(g==='\t'){const w=tabCells();push(' '.repeat(w),segment.kind,selected);used+=w;continue;}
      const w=displayWidth(g);
      if(used+w>width&&used>0)breakRow();
      push(g,segment.kind,selected);used+=w;
    }
  }
  return{rows,cursorRow};
}

export function composerLayout(segments:readonly ComposerSegment[],{contentWidth,maxRows}:{contentWidth:number;maxRows:number}):ComposerLayout{
  const {rows,cursorRow}=composerRows(segments,contentWidth);
  const visible=Math.max(1,Math.floor(maxRows));
  const start=Math.max(0,Math.min(rows.length-visible,cursorRow-visible+1));
  const shown=rows.slice(start,start+visible);
  return{rows:shown,total:rows.length,start,cursorRow,hiddenAbove:start,hiddenBelow:Math.max(0,rows.length-start-shown.length)};
}
