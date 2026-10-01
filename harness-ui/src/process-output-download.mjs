import {OUTPUT_CHUNK_BYTES, ProcessOutputStoreError} from './process-output-contract.mjs';

const states = new Set(['recording','complete','limited','failed','interrupted']);
const safeId = v => typeof v === 'string' && v.trim() && v.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(v);
const integer = v => Number.isSafeInteger(v) && v >= 0;
const integrity = () => {throw new ProcessOutputStoreError('Output changed or failed integrity verification during download','OUTPUT_INTEGRITY_FAILED');};

/** A bounded snapshot of the selected retained stream, never a second execution. */
export async function prepareProcessOutputDownload(read, {sessionId,outputId,stream='stdout'} = {}, {signal} = {}) {
  if(typeof read !== 'function' || !safeId(sessionId)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(outputId)
    || !['stdout','stderr'].includes(stream)) throw new ProcessOutputStoreError('Invalid output download request','OUTPUT_INVALID_INPUT');
  const check = (p, offset, limit, identity, end) => {
    if(!p || p.schema !== 'talos.process-output-page.v1' || p.outputId !== outputId || p.stream !== stream
      || !safeId(p.runId) || !safeId(p.toolCallId) || !states.has(p.state) || p.encoding !== 'raw'
      || typeof p.footerStatus !== 'string' || !/^[a-z-]{1,64}$/.test(p.footerStatus)
      || p.offset !== offset || !['bytes','availableBytes','storedBytes','observedBytes'].every(k=>integer(p[k]))
      || p.availableBytes > p.storedBytes || p.storedBytes > p.observedBytes
      || p.bytes !== Math.max(0,Math.min(limit,p.availableBytes-offset)) || !(p.data instanceof Uint8Array) || p.data.length !== p.bytes
      || (identity && (p.runId !== identity.runId || p.toolCallId !== identity.toolCallId || p.availableBytes < end))) integrity();
  };
  signal?.throwIfAborted();
  let first = await read(sessionId,{outputId,stream,offset:0,limit:OUTPUT_CHUNK_BYTES,format:'raw'},{signal});
  signal?.throwIfAborted(); check(first,0,OUTPUT_CHUNK_BYTES);
  const snapshot = Object.freeze({outputId,stream,runId:first.runId,toolCallId:first.toolCallId,
    bytes:first.availableBytes,storedBytes:first.storedBytes,observedBytes:first.observedBytes,
    state:first.state,footerStatus:first.footerStatus});
  async function* chunks() {
    let offset=0;
    while(offset < snapshot.bytes) {
      signal?.throwIfAborted();
      const limit=Math.min(OUTPUT_CHUNK_BYTES,snapshot.bytes-offset);
      const page=first ?? await read(sessionId,{outputId,stream,offset,limit,format:'raw'},{signal});
      first=null;
      signal?.throwIfAborted(); check(page,offset,limit,snapshot,snapshot.bytes);
      offset+=page.bytes;
      yield page.data;
    }
    first=null;
  }
  return {snapshot,chunks:chunks()};
}
