import type {TalosV2Cursor,TalosV2Event} from './types.ts';

export class TalosV2ReplayError extends Error{
  code:string;
  details:Record<string,unknown>;
  constructor(code:string,message:string,details:Record<string,unknown>={}){
    super(message);
    this.name='TalosV2ReplayError';
    this.code=code;
    this.details=details;
  }
}

export function replayDurableAfter(events:readonly TalosV2Event[],cursor:TalosV2Cursor|null):TalosV2Event[]{
  const replayable=events.filter(event=>event.cursor!==null);
  if(cursor===null)return replayable.filter(event=>event.durability==='durable');
  const wrongSession=events.find(event=>event.sessionId!==cursor.sessionId);
  if(wrongSession)throw new TalosV2ReplayError(
    'PROTOCOL_CURSOR_SESSION_MISMATCH',
    'Replay cursor is bound to a different session',
    {cursorSessionId:cursor.sessionId,eventSessionId:wrongSession.sessionId}
  );
  if(replayable.length===0)throw new TalosV2ReplayError(
    'PROTOCOL_CURSOR_UNAVAILABLE',
    'No retained replay range is available for this cursor',
    {cursor}
  );
  const sequences=replayable.map(event=>event.cursor!.sequence);
  const oldest=Math.min(...sequences);
  const newest=Math.max(...sequences);
  if(cursor.sequence<oldest-1||cursor.sequence>newest)throw new TalosV2ReplayError(
    'PROTOCOL_CURSOR_UNAVAILABLE',
    'Requested replay cursor is outside the retained range',
    {cursor,oldestSequence:oldest,newestSequence:newest}
  );
  return replayable.filter(event=>
    event.sessionId===cursor.sessionId
    &&event.cursor!.sequence>cursor.sequence
    &&event.durability==='durable'
  );
}
