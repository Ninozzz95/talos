/* Test fixture: "ok" with something that is not an evidence object. */
import {parentPort} from 'node:worker_threads';
parentPort.postMessage({ok:true,evidence:'yes, supported'});
