import {exitCodeForEnvelope} from '../../errors.ts';
import type {TalosV2Event,TalosV2RunResult} from './types.ts';

export function encodeV2Event(event:TalosV2Event):string{return JSON.stringify(event)+'\n';}
export function encodeV2Stream(events:readonly TalosV2Event[]):string{
  return events.length?events.map(encodeV2Event).join(''):'';
}
export function encodeV2Result(result:TalosV2RunResult):string{return JSON.stringify(result)+'\n';}
export function exitCodeForV2Result(result:TalosV2RunResult):number{
  return result.ok?0:exitCodeForEnvelope(result.error?.envelope??{code:result.outcome==='cancelled'?'CANCELLED':'INTERNAL_ERROR'});
}
