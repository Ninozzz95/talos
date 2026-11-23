/* New session offers the folders the person trusted: the list reads the records and decides nothing. */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {listTrustedFolders} from '../../src/security/trust-authority.ts';

test('the latest first, a broken or foreign record left out, a cap, and nothing when there is no folder yet',async()=>{
  const root=mkdtempSync(join(tmpdir(),'talos-trust-list-'));
  try{
    assert.deepEqual(await listTrustedFolders(root),[]);
    const folders=join(root,'folders');mkdirSync(folders);
    const write=(name:string,value:unknown)=>writeFileSync(join(folders,name),typeof value==='string'?value:JSON.stringify(value));
    write('a.json',{schema:'talos.cli.folder-trust.v1',canonicalRoot:'C:/old',decidedAt:'2026-10-01T00:00:00Z'});
    write('b.json',{schema:'talos.cli.folder-trust.v1',canonicalRoot:'C:/new',decidedAt:'2026-11-01T00:00:00Z'});
    write('c.json','not json');write('d.json',{schema:'other',canonicalRoot:'C:/x',decidedAt:'2026-11-01T00:00:00Z'});write('e.txt','x');
    const exists=async()=>true;
    assert.deepEqual((await listTrustedFolders(root,{exists})).map(row=>row.path),['C:/new','C:/old']);
    assert.deepEqual((await listTrustedFolders(root,{limit:1,exists})).map(row=>row.path),['C:/new']);
    assert.deepEqual((await listTrustedFolders(root,{exists:async folder=>folder==='C:/old'})).map(row=>row.path),['C:/old'],'a folder that is gone is no choice');
  }finally{rmSync(root,{recursive:true,force:true});}
});
