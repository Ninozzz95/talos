export type OverlayId='provider'|'model'|'session'|'approval'|'question'|'plan'|'elicit'|'help'|'consent'|'remote';
export type FocusContext='composer'|'command-menu'|'transcript'|'approval'|'question'|'plan'|'elicit'|'model-picker'|'provider-picker'|'session-picker'|'help'|'consent'|'remote';
export type FocusState={current:FocusContext;stack:FocusContext[]};

export function focusForOverlay(overlay:OverlayId):FocusContext{return overlay==='model'?'model-picker':overlay==='provider'?'provider-picker':overlay==='session'?'session-picker':overlay;}
export function createFocusState(initial:FocusContext):FocusState{return{current:initial,stack:[]};}
export function openFocus(state:FocusState,next:FocusContext):FocusState{return next===state.current?state:{current:next,stack:[...state.stack,state.current]};}
export function closeFocus(state:FocusState):FocusState{const previous=state.stack.at(-1);if(!previous)return state;return{current:previous,stack:state.stack.slice(0,-1)};}
/** 0.6.15 (review block 3, R-A): a context that left while covered leaves the stack too; the same state when it is not there. */
export function dropFocus(state:FocusState,context:FocusContext):FocusState{
  if(state.current!==context&&!state.stack.includes(context))return state;
  const stack=state.stack.filter(entry=>entry!==context);
  if(state.current!==context)return{current:state.current,stack};
  return{current:stack.at(-1)??'composer',stack:stack.slice(0,-1)};
}
