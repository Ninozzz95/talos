import {randomUUID} from 'node:crypto';

const errorCode = error => typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
  ? error.code : 'OUTPUT_STORE_IO';
const identity = receipt => ({sessionId: receipt.sessionId, operationId: receipt.operationId});

/** Journal deletion is the session's commit point; output cleanup has a durable intent. */
export async function deleteSessionWithOutput({store, sessionId, deleteJournal}) {
  const receipt = await store.beginSessionDeletion({sessionId, operationId: randomUUID()});
  const request = identity(receipt);
  try {await deleteJournal();}
  catch (error) {
    try {await store.cancelSessionDeletion(request);}
    catch (cleanupError) {
      // Bytes remain intact and fenced. Startup observes the still-existing
      // journal and cancels the intent; never complete a failed journal delete.
      console.warn('[process-output] Failed deletion awaits startup reconciliation:', errorCode(cleanupError));
    }
    throw error;
  }
  try {return await store.completeSessionDeletion(request);}
  catch (error) {return {state: 'pending', code: errorCode(error)};}
}

/** Only call during startup, before restoring sessions or accepting new runs. */
export async function recoverProcessOutputDeletions({store, sessionExists}) {
  let after = null, completed = 0, cancelled = 0;
  do {
    const page = await store.listSessionDeletions({after, limit: 128});
    for (const receipt of page.items) {
      const present = await sessionExists(receipt.sessionId);
      if (typeof present !== 'boolean') throw new TypeError('Session existence must be established before output recovery');
      if (present) {await store.cancelSessionDeletion(identity(receipt)); cancelled++;}
      else {await store.completeSessionDeletion(identity(receipt)); completed++;}
    }
    after = page.nextAfter;
  } while (after !== null);
  return {completed, cancelled};
}
