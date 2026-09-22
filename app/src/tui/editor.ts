import {createEditorHistory,pushEditorHistory,redoEditorHistory,undoEditorHistory,type EditorHistory} from './editor-history.ts';
import {splitGraphemes} from './text-width.ts';

export type CollapsedPaste={start:number;end:number;chars:number;lines:number};
export type EditorSnapshot={text:string;cursor:number;collapsedPastes:CollapsedPaste[]};
export type EditorState={text:string;cursor:number;killBuffer:string;preferredColumn?:number;selectionAnchor?:number;collapsedPastes:CollapsedPaste[];editHistory:EditorHistory<EditorSnapshot>};
export type ComposerSegment={kind:'text'|'cursor'|'paste';text:string;selected?:boolean};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const clonePastes=(pastes:readonly CollapsedPaste[])=>pastes.map(paste=>({...paste}));
function clearPreferred(state:EditorState):EditorState{const {preferredColumn:_,...rest}=state;return rest;}
function clearSelection(state:EditorState):EditorState{const {selectionAnchor:_,...rest}=state;return rest;}
function clearTransient(state:EditorState):EditorState{return clearSelection(clearPreferred(state));}
function snapshot(state:EditorState):EditorSnapshot{return{text:state.text,cursor:clamp(state.cursor,0,state.text.length),collapsedPastes:clonePastes(state.collapsedPastes)};}
function withCursor(state:EditorState,cursor:number,extendSelection=false):EditorState{
  const nextCursor=clamp(cursor,0,state.text.length);const base=clearPreferred(state);
  if(!extendSelection)return{...clearSelection(base),cursor:nextCursor};
  const anchor=state.selectionAnchor??clamp(state.cursor,0,state.text.length);
  if(anchor===nextCursor)return{...clearSelection(base),cursor:nextCursor};
  return{...base,cursor:nextCursor,selectionAnchor:anchor};
}
function restoreSnapshot(state:EditorState,value:EditorSnapshot,editHistory:EditorHistory<EditorSnapshot>):EditorState{
  return{...clearTransient(state),text:value.text,cursor:clamp(value.cursor,0,value.text.length),collapsedPastes:clonePastes(value.collapsedPastes),editHistory};
}

export function previousGraphemeBoundary(text:string,cursor:number){let offset=0,previous=0;for(const g of splitGraphemes(text)){const next=offset+g.length;if(next>=cursor)return previous;previous=next;offset=next;}return previous;}
export function nextGraphemeBoundary(text:string,cursor:number){let offset=0;for(const g of splitGraphemes(text)){offset+=g.length;if(offset>cursor)return offset;}return text.length;}
function graphemeBoundaryAtOrBefore(text:string,cursor:number){const target=clamp(cursor,0,text.length);let offset=0;for(const g of splitGraphemes(text)){const next=offset+g.length;if(next>target)return offset;if(next===target)return next;offset=next;}return text.length;}
export function createEditorState(text=''):EditorState{return{text,cursor:text.length,killBuffer:'',collapsedPastes:[],editHistory:createEditorHistory<EditorSnapshot>()};}
export function replaceEditorText(_state:EditorState,text:string):EditorState{return createEditorState(text);}
export function selectionRange(state:EditorState):{start:number;end:number}|null{
  if(state.selectionAnchor===undefined)return null;
  const anchor=clamp(state.selectionAnchor,0,state.text.length),cursor=clamp(state.cursor,0,state.text.length);
  if(anchor===cursor)return null;
  return{start:Math.min(anchor,cursor),end:Math.max(anchor,cursor)};
}

export function remapCollapsedPastes(pastes:readonly CollapsedPaste[],editStart:number,removed:number,inserted:number){
  const editEnd=editStart+removed,delta=inserted-removed;const out:CollapsedPaste[]=[];
  for(const p of pastes){
    if(editEnd<=p.start){out.push({...p,start:p.start+delta,end:p.end+delta});continue;}
    if(editStart>=p.end){out.push({...p});continue;}
  }
  return out;
}

export function replaceRange(state:EditorState,start:number,end:number,value:string):EditorState{
  const from=clamp(start,0,state.text.length),to=Math.max(from,clamp(end,0,state.text.length));
  if(from===to&&value.length===0)return clearTransient(state);
  const editHistory=pushEditorHistory(state.editHistory,snapshot(state));
  return{...clearTransient(state),text:state.text.slice(0,from)+value+state.text.slice(to),cursor:from+value.length,collapsedPastes:remapCollapsedPastes(state.collapsedPastes,from,to-from,value.length),editHistory};
}

export function editInsert(state:EditorState,value:string):EditorState{
  if(!value)return clearPreferred(state);
  const selected=selectionRange(state);
  return selected?replaceRange(state,selected.start,selected.end,value):replaceRange(state,state.cursor,state.cursor,value);
}
export function moveCursor(state:EditorState,to:'left'|'right'|'home'|'end',extendSelection=false):EditorState{
  const selected=selectionRange(state);
  if(selected&&!extendSelection&&(to==='left'||to==='right'))return withCursor(state,to==='left'?selected.start:selected.end,false);
  const bounds=lineBounds(state.text,state.cursor);const cursor=to==='left'?previousGraphemeBoundary(state.text,state.cursor):to==='right'?nextGraphemeBoundary(state.text,state.cursor):to==='home'?bounds.start:bounds.end;return withCursor(state,cursor,extendSelection);
}
function isWord(ch:string|undefined){return !!ch&&/[\p{L}\p{N}_]/u.test(ch);}
export function moveWord(state:EditorState,direction:-1|1,extendSelection=false):EditorState{let c=clamp(state.cursor,0,state.text.length);if(direction<0){while(c>0&&!isWord(state.text[previousGraphemeBoundary(state.text,c)]))c=previousGraphemeBoundary(state.text,c);while(c>0&&isWord(state.text[previousGraphemeBoundary(state.text,c)]))c=previousGraphemeBoundary(state.text,c);}else{while(c<state.text.length&&!isWord(state.text[c]))c=nextGraphemeBoundary(state.text,c);while(c<state.text.length&&isWord(state.text[c]))c=nextGraphemeBoundary(state.text,c);}return withCursor(state,c,extendSelection);}
function lineBounds(text:string,cursor:number){const c=clamp(cursor,0,text.length);const start=text.lastIndexOf('\n',Math.max(0,c-1))+1;const next=text.indexOf('\n',c);const end=next<0?text.length:next;return{start,end};}
export function moveVertical(state:EditorState,direction:-1|1,extendSelection=false):EditorState{
 const c=clamp(state.cursor,0,state.text.length);const current=lineBounds(state.text,c);const preferred=state.preferredColumn??(c-current.start);
 if(direction<0){if(current.start===0)return extendSelection?state:withCursor(state,c,false);const previousEnd=current.start-1;const previous=lineBounds(state.text,previousEnd);const target=graphemeBoundaryAtOrBefore(state.text,previous.start+Math.min(preferred,previous.end-previous.start));const moved=withCursor(state,target,extendSelection);return{...moved,preferredColumn:preferred};}
 if(current.end===state.text.length)return extendSelection?state:withCursor(state,c,false);const nextStart=current.end+1;const next=lineBounds(state.text,nextStart);const target=graphemeBoundaryAtOrBefore(state.text,next.start+Math.min(preferred,next.end-next.start));const moved=withCursor(state,target,extendSelection);return{...moved,preferredColumn:preferred};
}
export function deleteBackward(state:EditorState):EditorState{const selected=selectionRange(state);if(selected)return replaceRange(state,selected.start,selected.end,'');const c=clamp(state.cursor,0,state.text.length);if(c===0)return clearPreferred(state);return replaceRange(state,previousGraphemeBoundary(state.text,c),c,'');}
export function deleteForward(state:EditorState):EditorState{const selected=selectionRange(state);if(selected)return replaceRange(state,selected.start,selected.end,'');const c=clamp(state.cursor,0,state.text.length);if(c>=state.text.length)return clearPreferred(state);return replaceRange(state,c,nextGraphemeBoundary(state.text,c),'');}
export function copySelection(state:EditorState):EditorState{const selected=selectionRange(state);return selected?{...state,killBuffer:state.text.slice(selected.start,selected.end)}:state;}
export function cutSelection(state:EditorState):EditorState{const selected=selectionRange(state);if(!selected)return state;const killed=state.text.slice(selected.start,selected.end);return{...replaceRange(state,selected.start,selected.end,''),killBuffer:killed};}
export function killToStart(state:EditorState):EditorState{if(selectionRange(state))return cutSelection(state);const c=clamp(state.cursor,0,state.text.length);const {start}=lineBounds(state.text,c);if(c===start)return clearPreferred(state);const killed=state.text.slice(start,c);return{...replaceRange(state,start,c,''),killBuffer:killed};}
export function killToEnd(state:EditorState):EditorState{if(selectionRange(state))return cutSelection(state);const c=clamp(state.cursor,0,state.text.length);const {end}=lineBounds(state.text,c);if(c>=end)return clearPreferred(state);const killed=state.text.slice(c,end);return{...replaceRange(state,c,end,''),killBuffer:killed};}
export function killWordBackward(state:EditorState):EditorState{if(selectionRange(state))return cutSelection(state);const end=clamp(state.cursor,0,state.text.length);const moved=moveWord(state,-1);if(moved.cursor===end)return clearPreferred(state);const killed=state.text.slice(moved.cursor,end);return{...replaceRange(state,moved.cursor,end,''),killBuffer:killed};}
export function yank(state:EditorState):EditorState{return state.killBuffer?editInsert(state,state.killBuffer):clearPreferred(state);}
export function undoEditor(state:EditorState):EditorState{const step=undoEditorHistory(state.editHistory,snapshot(state));return step?restoreSnapshot(state,step.value,step.history):clearTransient(state);}
export function redoEditor(state:EditorState):EditorState{const step=redoEditorHistory(state.editHistory,snapshot(state));return step?restoreSnapshot(state,step.value,step.history):clearTransient(state);}
export function visibleEditorText(state:EditorState){const c=clamp(state.cursor,0,state.text.length);const next=nextGraphemeBoundary(state.text,c);return{before:state.text.slice(0,c),cursor:state.text.slice(c,next)||' ',after:state.text.slice(next),atEnd:c===state.text.length};}

export function insertPaste(state:EditorState,text:string):EditorState{
  const selected=selectionRange(state);const start=selected?.start??state.cursor;const end=selected?.end??state.cursor;const next=replaceRange(state,start,end,text);const lines=text.split(/\r?\n/u).length;
  return text.length>=4096||lines>=20?{...next,collapsedPastes:[...next.collapsedPastes,{start,end:start+text.length,chars:text.length,lines}]}:next;
}

export function composerSegments(state:EditorState):ComposerSegment[]{
  const out:ComposerSegment[]=[];const ranges=[...state.collapsedPastes].sort((a,b)=>a.start-b.start);const selected=selectionRange(state);
  const pushText=(start:number,end:number)=>{
    if(end<start)return;
    if(selected){
      const selectedStart=Math.max(start,selected.start),selectedEnd=Math.min(end,selected.end);
      if(selectedEnd<=selectedStart){if(end>start)out.push({kind:'text',text:state.text.slice(start,end)});return;}
      if(selectedStart>start)out.push({kind:'text',text:state.text.slice(start,selectedStart)});
      out.push({kind:'text',text:state.text.slice(selectedStart,selectedEnd),selected:true});
      if(selectedEnd<end)out.push({kind:'text',text:state.text.slice(selectedEnd,end)});
      return;
    }
    if(state.cursor<start||state.cursor>end){if(end>start)out.push({kind:'text',text:state.text.slice(start,end)});return;}
    if(state.cursor>start)out.push({kind:'text',text:state.text.slice(start,state.cursor)});const next=Math.min(end,nextGraphemeBoundary(state.text,state.cursor));out.push({kind:'cursor',text:state.text.slice(state.cursor,next)||' '});if(next<end)out.push({kind:'text',text:state.text.slice(next,end)});
  };
  let pos=0;for(const p of ranges){if(p.start<pos)continue;pushText(pos,p.start);const pasteSelected=Boolean(selected&&selected.end>p.start&&selected.start<p.end);if(!selected&&state.cursor>=p.start&&state.cursor<p.end)pushText(p.start,p.end);else out.push({kind:'paste',text:'[paste: '+p.lines+' lines, '+p.chars+' chars]',...(pasteSelected?{selected:true}:{})});pos=p.end;}pushText(pos,state.text.length);return out;
}
