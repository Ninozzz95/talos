import type {BusyKind} from './components/status-indicator.ts';

export type LiveActivity={kind:BusyKind;startedAt:number|null};
export function deriveLiveActivity(state:{running:boolean;preparing?:boolean;reasoning:unknown;tools:readonly {status:string}[]},busySince:number):LiveActivity{
  if(state.preparing&&!state.running)return{kind:'starting',startedAt:busySince};
  if(!state.running)return{kind:'idle',startedAt:null};
  if(state.tools.some(row=>row.status==='running'))return{kind:'tool',startedAt:busySince};
  return{kind:'thinking',startedAt:busySince};
}
