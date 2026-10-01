import {Writable} from 'node:stream';
import {StringDecoder} from 'node:string_decoder';
import {normalizzaMetadatiCattura} from '../process-output-contract.mjs';

const CHUNK_BYTES = 65_536;
const high = n => n >= 0xd800 && n <= 0xdbff;
const low = n => n >= 0xdc00 && n <= 0xdfff;
const copyText = text => Buffer.from(text, 'utf16le').toString('utf16le');

function edges(text, limit) {
  let start = Math.floor(limit / 4), end = text.length - (limit - start);
  if (high(text.charCodeAt(start - 1)) && low(text.charCodeAt(start))) start--;
  if (low(text.charCodeAt(end)) && high(text.charCodeAt(end - 1))) end++;
  return {head: copyText(text.slice(0, start)), tail: copyText(text.slice(end))};
}

function boundedView(limit) {
  let head = '', tail = '', shortened = false, codeUnits = 0;
  return {
    append(text) {
      codeUnits += text.length;
      if (!shortened) {
        tail += text;
        if (tail.length > limit) {
          ({head, tail} = edges(tail, limit));
          shortened = true;
        }
      } else {
        const joined = tail + text;
        let from = Math.max(0, joined.length - (limit - head.length));
        if (low(joined.charCodeAt(from)) && high(joined.charCodeAt(from - 1))) from++;
        tail = copyText(joined.slice(from));
      }
    },
    snapshot() {
      const omittedCodeUnits = codeUnits - head.length - tail.length;
      return {codeUnits, omittedCodeUnits, text: omittedCodeUnits
        ? `${head}\n[${omittedCodeUnits} UTF-16 code units omitted from this preview]\n${tail}` : tail};
    },
  };
}

/** Raw bytes precede decoding and preview limits. ACK means the supplied sink accepted them. */
export function captureProcessOutput(child, {onBytes, onText, metadata = {schema: 'talos.process-output-metadata.v1', controlFooter: null}, maxCodeUnits = 160_000} = {}) {
  if (typeof onBytes !== 'function') throw new TypeError('onBytes must be a function');
  if (!Number.isSafeInteger(maxCodeUnits) || maxCodeUnits < 4) throw new RangeError('maxCodeUnits must be at least 4');
  const captureMetadata = normalizzaMetadatiCattura(metadata);
  const stdout = boundedView(maxCodeUnits), stderr = boundedView(maxCodeUnits), combined = boundedView(maxCodeUnits);
  const counts = {stdout: 0, stderr: 0};
  /* OEM36 tappa 2 (ledger Codex 30/09, owner sì): StringDecoder rende «�» i byte non UTF-8 senza dirlo. Un validatore
     rigoroso in parallelo, per flusso (stato interno ≤ 3 byte), dice se l'anteprima è fedele; dopo il primo byte non
     valido smette di lavorare. Non si cerca «�» nel testo: può essere un carattere legittimo. Solo metadati di
     esecuzione: captureMetadata v1, byte grezzi, ricevute e stato restano quelli di prima. */
  const utf8Valido = {stdout: true, stderr: true};
  const validatori = {stdout: new TextDecoder('utf-8', {fatal: true}), stderr: new TextDecoder('utf-8', {fatal: true})};
  const valida = (stream, bytes) => {
    if (!utf8Valido[stream]) return;
    try {validatori[stream].decode(bytes, bytes ? {stream: true} : undefined);} catch {utf8Valido[stream] = false;}
  };
  let deliveredBytes = 0, errorCode, serial = Promise.resolve();
  const fail = error => {
    if (errorCode) return;
    const code = error?.code;
    errorCode = typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : 'OUTPUT_CAPTURE_FAILED';
  };
  const pumps = ['stdout', 'stderr'].map(stream => new Promise(resolve => {
    const source = child[stream], decoder = new StringDecoder('utf8');
    const view = stream === 'stdout' ? stdout : stderr;
    const observe = text => {
      if (!text) return;
      view.append(text); combined.append(text);
      try {onText?.(stream, text);} catch { /* observers cannot interrupt capture */ }
    };
    const sink = new Writable({
      highWaterMark: CHUNK_BYTES,
      write(chunk, encoding, callback) {
        // There are at most two active writes, one per pipe. Each holds its ACK
        // until the shared sink finishes; native pipe backpressure bounds queues.
        serial = serial.then(async () => {
          for (let offset = 0; offset < chunk.length; offset += CHUNK_BYTES) {
            const bytes = chunk.subarray(offset, offset + CHUNK_BYTES);
            counts[stream] += bytes.length;
            valida(stream, bytes);
            observe(decoder.write(bytes));
            if (!errorCode) {
              try {await onBytes({stream, bytes, metadata: captureMetadata}); deliveredBytes += bytes.length;}
              catch (error) {fail(error);}
            }
          }
        }).catch(fail);
        serial.then(() => callback());
      },
      // un carattere tagliato dalla fine del flusso è non valido: la chiusura del validatore lo dice
      final(callback) {valida(stream, undefined); observe(decoder.end()); callback();},
    });
    sink.once('finish', resolve);
    sink.on('error', error => {fail(error); resolve();});
    if (!source) {sink.end(); return;}
    const incomplete = error => {
      fail(error ?? {code: 'OUTPUT_PIPE_CLOSED'});
      source.unpipe(sink);
      sink.end();
    };
    source.once('error', incomplete);
    source.once('close', () => {if (!source.readableEnded) incomplete();});
    source.pipe(sink);
  }));
  return {settled: Promise.all(pumps).then(() => ({
    stdout: stdout.snapshot(), stderr: stderr.snapshot(), combined: combined.snapshot(),
    metadata: {
      captureMetadata,
      state: errorCode ? 'failed' : 'delivered',
      observedBytes: counts.stdout + counts.stderr, deliveredBytes,
      stdoutBytes: counts.stdout, stderrBytes: counts.stderr,
      combinedCodeUnits: combined.snapshot().codeUnits,
      previewEncoding: {stdout: utf8Valido.stdout ? 'utf-8' : 'invalid-utf8', stderr: utf8Valido.stderr ? 'utf-8' : 'invalid-utf8'},
      ...(errorCode ? {errorCode} : {}),
    },
  }))};
}

/** A preview is distinct from the raw sink receipt and never instructs a retry. */
export function formatCapturedOutput(text, capture, limit = 4_000) {
  let result = String(text ?? '');
  if (result.length > limit) {
    const {head, tail} = edges(result, limit);
    result = `${head}\n[... middle omitted from preview ...]\n${tail}`;
  }
  if (capture.combinedCodeUnits > limit) {
    result = `[TALOS output preview: ${capture.combinedCodeUnits} UTF-16 code units observed across stdout/stderr; the middle is not shown.]\n${result}`;
  }
  if (capture.state === 'failed') {
    result = `[TALOS output capture failed (${capture.errorCode}): the command already ran; do not rerun automatically. Some output was not delivered to the sink.]\n${result}`;
  }
  // OEM36: detto in TESTA, dove anche un modello che guarda solo l'inizio lo legge
  const nonValidi = ['stdout', 'stderr'].filter(s => capture.previewEncoding?.[s] === 'invalid-utf8');
  if (nonValidi.length) {
    result = `[TALOS output preview is not faithful: ${nonValidi.join(' and ')} ${nonValidi.length > 1 ? 'are' : 'is'} not valid UTF-8, so invalid bytes are shown as U+FFFD. The original bytes are retained: read them with process_output (outputId of this command), and add encoding (for example cp850) only if the program is known to write that Windows code page. The command already ran and its bytes are kept.]\n${result}`;
  }
  return result;
}
