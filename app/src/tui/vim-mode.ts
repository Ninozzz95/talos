import {deleteForward,moveCursor,moveVertical,nextGraphemeBoundary,previousGraphemeBoundary,redoEditor,undoEditor,type EditorState} from './editor.ts';
import type {InkKeyLike} from './keybindings.ts';

export type VimInputMode='insert'|'normal';
export type VimState={enabled:boolean;mode:VimInputMode};
export type VimInputResult={handled:boolean;state:VimState;editor:EditorState};

export function createVimState():VimState{return{enabled:false,mode:'insert'};}
export function toggleVim(state:Readonly<VimState>):VimState{return state.enabled?{enabled:false,mode:'insert'}:{enabled:true,mode:'insert'};}
export function vimModeHint(state:Readonly<VimState>):string{
  if(!state.enabled)return'';
  return state.mode==='insert'
    ?'VIM INSERT · Esc normal · Alt+V off'
    :'VIM NORMAL · h/j/k/l · b/w · 0/$ · x · u/Ctrl+R · i/a/I/A · Alt+V off';
}

function setCursor(state:EditorState,cursor:number):EditorState{
  const {selectionAnchor:_,preferredColumn:__,...rest}=state;
  return{...rest,cursor:Math.max(0,Math.min(state.text.length,cursor))};
}
function isWordAt(state:EditorState,cursor:number):boolean{
  if(cursor<0||cursor>=state.text.length)return false;
  const end=nextGraphemeBoundary(state.text,cursor);
  return/[\p{L}\p{N}_]/u.test(state.text.slice(cursor,end));
}
function vimWordForward(state:EditorState):EditorState{
  let cursor=state.cursor;
  if(cursor>=state.text.length)return setCursor(state,cursor);
  if(isWordAt(state,cursor))while(cursor<state.text.length&&isWordAt(state,cursor))cursor=nextGraphemeBoundary(state.text,cursor);
  while(cursor<state.text.length&&!isWordAt(state,cursor))cursor=nextGraphemeBoundary(state.text,cursor);
  return setCursor(state,cursor);
}
function vimWordBackward(state:EditorState):EditorState{
  let cursor=state.cursor;
  if(cursor<=0)return setCursor(state,0);
  cursor=previousGraphemeBoundary(state.text,cursor);
  while(cursor>0&&!isWordAt(state,cursor))cursor=previousGraphemeBoundary(state.text,cursor);
  while(cursor>0){
    const previous=previousGraphemeBoundary(state.text,cursor);
    if(!isWordAt(state,previous))break;
    cursor=previous;
  }
  return setCursor(state,cursor);
}
function result(state:Readonly<VimState>,editor:EditorState,handled:boolean):VimInputResult{return{handled,state:{enabled:state.enabled,mode:state.mode},editor};}
function insertMode(state:Readonly<VimState>):VimState{return{enabled:state.enabled,mode:'insert'};}

export function handleVimInput(input:{state:Readonly<VimState>;editor:EditorState;ch:string;key:InkKeyLike}):VimInputResult{
  const {state,editor,ch,key}=input;
  if(!state.enabled)return result(state,editor,false);
  if(state.mode==='insert'){
    if(key.escape)return{handled:true,state:{enabled:true,mode:'normal'},editor};
    return result(state,editor,false);
  }

  if(key.escape)return result(state,editor,false);
  if(key.ctrl&&ch.toLowerCase()==='c')return result(state,editor,false);
  if(key.ctrl&&ch.toLowerCase()==='r')return{handled:true,state:{enabled:true,mode:'normal'},editor:redoEditor(editor)};
  if(key.ctrl||key.meta)return result(state,editor,false);
  if((ch==='?'||ch==='/')&&editor.text.trim().length===0)return result(state,editor,false);

  if(ch==='i')return{handled:true,state:insertMode(state),editor};
  if(ch==='a')return{handled:true,state:insertMode(state),editor:moveCursor(editor,'right')};
  if(ch==='I')return{handled:true,state:insertMode(state),editor:moveCursor(editor,'home')};
  if(ch==='A')return{handled:true,state:insertMode(state),editor:moveCursor(editor,'end')};
  if(ch==='h')return{handled:true,state:{enabled:true,mode:'normal'},editor:moveCursor(editor,'left')};
  if(ch==='l')return{handled:true,state:{enabled:true,mode:'normal'},editor:moveCursor(editor,'right')};
  if(ch==='j')return{handled:true,state:{enabled:true,mode:'normal'},editor:moveVertical(editor,1)};
  if(ch==='k')return{handled:true,state:{enabled:true,mode:'normal'},editor:moveVertical(editor,-1)};
  if(ch==='w')return{handled:true,state:{enabled:true,mode:'normal'},editor:vimWordForward(editor)};
  if(ch==='b')return{handled:true,state:{enabled:true,mode:'normal'},editor:vimWordBackward(editor)};
  if(ch==='0')return{handled:true,state:{enabled:true,mode:'normal'},editor:moveCursor(editor,'home')};
  if(ch==='$')return{handled:true,state:{enabled:true,mode:'normal'},editor:moveCursor(editor,'end')};
  if(ch==='x')return{handled:true,state:{enabled:true,mode:'normal'},editor:deleteForward(editor)};
  if(ch==='u')return{handled:true,state:{enabled:true,mode:'normal'},editor:undoEditor(editor)};
  if(ch)return result(state,editor,true);
  return result(state,editor,false);
}
