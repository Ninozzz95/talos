import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const dir=new URL('../parity/',import.meta.url);
test('R02-ARTEFATTI-SEPARATI: i test non scrivono nelle immagini di consegna',async()=>{
 const colpevoli=[];for(const nome of await readdir(dir)){if(!nome.endsWith('.mjs'))continue;const fonte=await readFile(new URL(nome,dir),'utf8');if(fonte.includes('.claude/immagini/'))colpevoli.push(nome);}
 assert.deepEqual(colpevoli,[],'Usare artifacts per gli output automatici; copiare solo le prove scelte alla consegna');
});
