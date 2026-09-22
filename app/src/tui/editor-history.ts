export const EDITOR_HISTORY_LIMIT=100;
export type EditorHistory<T>={past:T[];future:T[];limit:number};

export function createEditorHistory<T>(limit=EDITOR_HISTORY_LIMIT):EditorHistory<T>{
  const bounded=Math.max(1,Math.trunc(limit));
  return{past:[],future:[],limit:bounded};
}

function boundedTail<T>(rows:T[],limit:number):T[]{return rows.length>limit?rows.slice(rows.length-limit):rows;}

export function pushEditorHistory<T>(history:EditorHistory<T>,value:T):EditorHistory<T>{
  return{past:boundedTail([...history.past,value],history.limit),future:[],limit:history.limit};
}

export function undoEditorHistory<T>(history:EditorHistory<T>,current:T):{value:T;history:EditorHistory<T>}|null{
  if(history.past.length===0)return null;
  const value=history.past[history.past.length-1]!;
  return{value,history:{past:history.past.slice(0,-1),future:[current,...history.future].slice(0,history.limit),limit:history.limit}};
}

export function redoEditorHistory<T>(history:EditorHistory<T>,current:T):{value:T;history:EditorHistory<T>}|null{
  if(history.future.length===0)return null;
  const value=history.future[0]!;
  return{value,history:{past:boundedTail([...history.past,current],history.limit),future:history.future.slice(1),limit:history.limit}};
}
