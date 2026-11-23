import test from 'node:test';import assert from 'node:assert/strict';import {createStoredZip,crc32} from '../../src/diagnostics/zip.ts';
test('stored zip contains standard signatures and files',()=>{const z=createStoredZip([{name:'doctor.json',data:'{}'},{name:'manifest.json',data:'{"x":1}'}]);assert.equal(z.readUInt32LE(0),0x04034b50);assert.equal(z.readUInt32LE(z.length-22),0x06054b50);assert.match(z.toString('utf8'),/doctor\.json/u);});
test('crc32 matches standard vector',()=>assert.equal(crc32(Buffer.from('123456789')),0xcbf43926));
