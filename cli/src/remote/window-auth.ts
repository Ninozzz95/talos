/*
 * 0.6.15 T3b: the handshake on the local channel between two TALOS CLI windows. Research of 26/10 (RICERCA-T3B-INOLTRO-FINESTRE.md,
 * recommendation 4), measured on this machine: a named pipe created by Node (libuv 1.52.1) gives READ to Everyone and ANONYMOUS and
 * does not reject remote clients — Node cannot set a private DACL. So:
 * - the window writes nothing to a client that has not written first (a read-only client gets nothing, ever);
 * - both sides prove they hold the window's token WITHOUT sending it (HMAC-SHA256 over two fresh nonces, each side's own label), and
 *   compare in constant time (`timingSafeEqual`): an impostor that only knows the pipe's name passes as neither the host nor the
 *   window. Gemini CLI compares its token with `!==`; Happy has none on its local channel.
 * The limit, said as it is: a program of the SAME user can read the token from the data folder (as for Codex, Hermes, OpenCode).
 * Pure: nonces in, proofs out.
 */
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

export const NONCE_BYTES=32;
export const TOKEN_BYTES=32;
export const HANDSHAKE_TIMEOUT_MS=2_000;

/** A new window token (32 random bytes, base64url): made at every start, written only in the window's registration, never printed. */
export function newWindowToken():string{return randomBytes(TOKEN_BYTES).toString('base64url');}
export function newNonce():string{return randomBytes(NONCE_BYTES).toString('base64url');}

const mac=(token:string,label:'srv'|'cli',first:string,second:string)=>createHmac('sha256',Buffer.from(token,'base64url')).update(`${label}|${first}|${second}`).digest('base64url');
/** The window answers the client's nonce with its own and proves it holds the token. */
export function windowProof(token:string,clientNonce:string,windowNonce:string):string{return mac(token,'srv',clientNonce,windowNonce);}
/** The client proves it holds the token, bound to both nonces in the other order (a reflected proof never passes). */
export function clientProof(token:string,windowNonce:string,clientNonce:string):string{return mac(token,'cli',windowNonce,clientNonce);}

/** Constant-time comparison of two base64url digests; anything malformed is simply «no». */
export function sameProof(expected:string,received:unknown):boolean{
  if(typeof received!=='string'||received.length>64)return false;
  const a=Buffer.from(expected,'base64url'),b=Buffer.from(received,'base64url');
  return a.length===32&&b.length===32&&timingSafeEqual(a,b);
}

/** A nonce as it arrives on the wire: base64url of exactly 32 bytes. */
export function validNonce(value:unknown):value is string{
  return typeof value==='string'&&value.length<=64&&/^[A-Za-z0-9_-]+$/u.test(value)&&Buffer.from(value,'base64url').length===NONCE_BYTES;
}
