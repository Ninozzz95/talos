/* Test fixture: a support worker whose measurement BLOCKS its own thread for 300 ms (like the SDK's three synchronous spawns), then answers. */
import {parentPort} from 'node:worker_threads';
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,300);
parentPort.postMessage({ok:true,evidence:{isSupported:true,availableMethods:['processcontainer'],isolationTier:'base-container'}});
