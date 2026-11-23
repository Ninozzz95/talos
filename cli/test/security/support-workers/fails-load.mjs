/* Test fixture: the SDK could not be loaded inside the worker (a platform package skipped by npm, say). */
import {parentPort} from 'node:worker_threads';
parentPort.postMessage({ok:false,stage:'load',message:'Cannot find package mxc-sdk'});
