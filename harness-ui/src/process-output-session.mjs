import {randomUUID} from 'node:crypto';
import {ProcessOutputStoreError} from './process-output-contract.mjs';

const safeCode = (error, fallback) => typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ? error.code : fallback;

/** Identity is bound by the registry/service, never supplied by a model or a path. */
export async function runWithProcessOutput({store, sessionId, runId, toolCallId, emit, readToolAvailable=false}, execute) {
  const identity = {sessionId, runId, toolCallId, outputId: randomUUID()};
  let sequence = 0;
  const notify = async value => {
    if (typeof emit !== 'function' || await emit({type: 'CUSTOM', name: 'talos.process-output', value}) === false) {
      throw new ProcessOutputStoreError('The output receipt could not be recorded', 'OUTPUT_RECEIPT_FAILED');
    }
  };
  const fail = async errorCode => {
    try {return {...await store.fail({...identity, sequence, code: errorCode}), persistence: 'confirmed'};}
    catch {return {schema: 'talos.process-output.v1', ...identity, state: 'failed', persistence: 'unconfirmed', errorCode};}
  };
  let started;
  try {started = await store.begin(identity);}
  catch (error) {throw new ProcessOutputStoreError('Output storage is unavailable; the command was not started.', safeCode(error, 'OUTPUT_STORE_IO'));}
  try {await notify(started);}
  catch {await fail('OUTPUT_RECEIPT_FAILED'); throw new ProcessOutputStoreError('The output receipt could not be saved; the command was not started.', 'OUTPUT_RECEIPT_FAILED');}
  let result;
  let metadatiVisti; // i metadati con cui i pezzi sono entrati: la chiusura di un comando sfondato deve portare gli STESSI
  try {
    result = await execute({onBytes: async ({stream, bytes, metadata}) => {
      await store.append({...identity, sequence, stream, bytes, metadata});
      if (metadata !== undefined) metadatiVisti = metadata;
      sequence++;
    }});
  } catch {
    const receipt = await fail('OUTPUT_EXECUTION_UNCERTAIN');
    try {await notify(receipt);} catch { /* incomplete receipt is already explicit */ }
    throw new ProcessOutputStoreError('The command was attempted but did not settle; do not rerun automatically.', 'OUTPUT_EXECUTION_UNCERTAIN');
  }
  let receipt;
  /* ⭐ Owner, 08/10/2026 notte («"In sottofondo", con quanto è salvato»): un comando SFONDATO (dal tempo, dalla riga, o partito
     in sfondo) non ha fallito la conservazione. La cattura in memoria si è staccata apposta e l'output continua nel suo file
     (`fileSfondo`); i byte arrivati fino a lì sono salvati e si chiudono come conclusi, con terminazione 'background'. Prima
     finiva in `fail(OUTPUT_CAPTURE_NOT_CONFIRMED)`: il modello leggeva «retention failed… the command already ran» e, una riga
     sotto, «keeps running in the background» — misurato sulla 4176, 7 byte salvati e confermati. */
  const inSottofondo = result.messoInSfondo === true;
  if (inSottofondo) {
    try {receipt = {...await store.finish({...identity, sequence, termination: 'background', exitCode: null, ...(metadatiVisti !== undefined ? {metadata: metadatiVisti} : {})}), persistence: 'confirmed'};}
    catch (error) {receipt = await fail(safeCode(error, 'OUTPUT_STORE_IO'));}
  } else if (result.outputCapture?.state !== 'delivered') {
    receipt = await fail(safeCode({code: result.outputCapture?.errorCode}, 'OUTPUT_CAPTURE_NOT_CONFIRMED'));
  } else {
    const termination = result.fermatoSuRichiesta ? 'cancelled' : result.fermatoDalTempo ? 'timeout' : result.codice === -1 ? 'spawn-error' : 'exited';
    const exitCode = result.actualExitCode ?? result.codice ?? null;
    try {receipt = {...await store.finish({...identity, sequence, termination, exitCode, controlFooter: result.outputCapture.controlFooter, metadata: result.outputCapture.captureMetadata}), persistence: 'confirmed'};}
    catch (error) {receipt = await fail(safeCode(error, 'OUTPUT_STORE_IO'));}
  }
  let outputStorageFailed = receipt.state === 'failed';
  try {await notify(receipt);}
  catch {
    // Bytes may be durable while the journal ACK is not. Do not relabel the DB.
    receipt = {...receipt, receiptPersistence: 'unconfirmed', errorCode: 'OUTPUT_RECEIPT_FAILED'};
    outputStorageFailed = true;
  }
  const note = outputStorageFailed
    ? `[TALOS output retention failed (${receipt.errorCode}); the command already ran; do not rerun automatically. Output reference: ${identity.outputId}.]`
    : inSottofondo
      ? `[TALOS output reference: ${identity.outputId}; the command is still running in the background: ${receipt.storedBytes} bytes retained up to that point${receipt.state === 'limited' ? ' (the retention limit was reached)' : ''}; what it prints next goes to its output file.]`
      : `[TALOS output reference: ${identity.outputId}; retained ${receipt.storedBytes} of ${receipt.observedBytes} bytes${receipt.state === 'limited' ? '; the retention limit was reached' : ''}.]`;
  const recovery=readToolAvailable ? ` Read retained bytes with process_output({"outputId":"${identity.outputId}"}); follow nextOffset, and select stderr separately.` : '';
  return {...result, testo: `${note}${recovery}\n${result.testo ?? ''}`, processOutput: receipt, outputStorageFailed};
}
