/* Test fixture: the SDK loaded, and its platform measurement threw. */
import {parentPort} from 'node:worker_threads';
parentPort.postMessage({ok:false,stage:'support',message:'dism failed'});
