import assert from 'node:assert/strict';import test from 'node:test';import {Readable} from 'node:stream';
import {readStreamLimited} from '../src/io.ts';

test('stdin reader accepts input up to the byte limit',async()=>{const r=Readable.from([Buffer.from('hello')]);assert.equal(await readStreamLimited(r,5),'hello');});
test('stdin reader rejects input once the byte limit is exceeded',async()=>{const r=Readable.from([Buffer.alloc(4),Buffer.alloc(4)]);await assert.rejects(()=>readStreamLimited(r,7),/STDIN_TOO_LARGE/u);});
