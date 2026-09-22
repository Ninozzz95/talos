export type OverlayId='provider'|'model'|'session'|'approval'|'help';
export type FocusContext='composer'|'command-menu'|'transcript'|'approval'|'model-picker'|'provider-picker'|'session-picker'|'help';
export type FocusState={current:FocusContext;stack:FocusContext[]};

export function focusForOverlay(overlay:OverlayId):FocusContext{return overlay==='model'?'model-picker':overlay==='provider'?'provider-picker':overlay==='session'?'session-picker':overlay;}
export function createFocusState(initial:FocusContext):FocusState{return{current:initial,stack:[]};}
export function openFocus(state:FocusState,next:FocusContext):FocusState{return next===state.current?state:{current:next,stack:[...state.stack,state.current]};}
export function closeFocus(state:FocusState):FocusState{const previous=state.stack.at(-1);if(!previous)return state;return{current:previous,stack:state.stack.slice(0,-1)};}
