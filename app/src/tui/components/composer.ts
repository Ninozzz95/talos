import type {EditorState} from '../editor.ts';
import {composerSegments} from '../editor.ts';

export type HistorySearchState={query:string;nextIndex:number;matchIndex:number|null};
export function reverseHistoryMatch(history:readonly string[],query:string,from=0):{index:number;value:string}|null{for(let i=Math.max(0,from);i<history.length;i++){if(history[i]!.toLowerCase().includes(query.toLowerCase()))return{index:i,value:history[i]!};}return null;}
export function composerDisplay(state:EditorState){return composerSegments(state);}
