/*
 * 0.6.15 T3b (owner 26/10/2026, «la proposta completa»): the frames on the local channel between two TALOS CLI windows of the same
 * user. The shape of the kernel's remote wire (harness-ui/src/remoto/filo.mjs): 4 bytes of big-endian length, then JSON in UTF-8 —
 * the length first lets a frame that is too large be refused BEFORE it is held in memory (RFC 9113 §4.1 does the same).
 * Research of 26/10 (RICERCA-T3B-INOLTRO-FINESTRE.md, §3.3 and recommendation 5):
 * - two caps: 1 KiB until the handshake is done (nobody unauthenticated makes a window allocate), 8 MiB after (a page of 100
 *   messages; Hermes stops at 512 KiB, Codex goes to 256 MiB);
 * - a zero length or a length over the cap ends the connection: a length-prefixed stream cannot be resynchronised.
 */
export const WINDOW_FRAME_VERSION=1;
export const FRAME_CAP_BEFORE_AUTH=1024;
export const FRAME_CAP_AFTER_AUTH=8*1024*1024;

export type WindowFrame={v:number;t:string;[key:string]:unknown};
const fail=(code:string,message:string)=>Object.assign(new Error(message),{code});

/** One frame ready to write. Throws WINDOW_FRAME_TOO_LARGE over the cap. */
export function encodeFrame(message:{t:string;[key:string]:unknown},cap=FRAME_CAP_AFTER_AUTH):Buffer{
  const body=Buffer.from(JSON.stringify({v:WINDOW_FRAME_VERSION,...message}),'utf8');
  if(body.length>cap)throw fail('WINDOW_FRAME_TOO_LARGE',`A frame cannot exceed ${cap} bytes.`);
  const head=Buffer.alloc(4);head.writeUInt32BE(body.length,0);
  return Buffer.concat([head,body]);
}

/**
 * The reader: bytes in, whole frames out. A frame over the cap (checked on the length, before any allocation), a zero length, broken
 * JSON or another version throw: the caller closes the connection. `cap` can be raised once the handshake is done.
 */
export function createFrameReader(initialCap=FRAME_CAP_BEFORE_AUTH){
  let pending=Buffer.alloc(0);let cap=initialCap;
  return{
    push(chunk:Buffer|Uint8Array):WindowFrame[]{
      pending=pending.length?Buffer.concat([pending,Buffer.from(chunk)]):Buffer.from(chunk);
      const out:WindowFrame[]=[];
      while(pending.length>=4){
        const length=pending.readUInt32BE(0);
        if(length===0)throw fail('WINDOW_FRAME_EMPTY','A frame cannot be empty.');
        if(length>cap)throw fail('WINDOW_FRAME_TOO_LARGE',`A frame cannot exceed ${cap} bytes.`);
        if(pending.length<4+length)break;
        const body=pending.subarray(4,4+length);pending=pending.subarray(4+length);
        let frame:unknown;
        try{frame=JSON.parse(body.toString('utf8'));}catch{throw fail('WINDOW_FRAME_BAD','A frame is not valid JSON.');}
        if(!frame||typeof frame!=='object'||Array.isArray(frame))throw fail('WINDOW_FRAME_BAD','A frame must be a JSON object.');
        const f=frame as WindowFrame;
        if(f.v!==WINDOW_FRAME_VERSION)throw fail('WINDOW_FRAME_VERSION','Another version of the window channel.');
        if(typeof f.t!=='string'||!f.t)throw fail('WINDOW_FRAME_BAD','A frame needs a type.');
        out.push(f);
      }
      if(pending.length>=4&&pending.readUInt32BE(0)>cap)throw fail('WINDOW_FRAME_TOO_LARGE',`A frame cannot exceed ${cap} bytes.`);
      return out;
    },
    /** After the handshake: the larger cap. */
    raiseCap(next:number){cap=next;},
    get pendingBytes(){return pending.length;},
  };
}
