import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizzaCapacita,datiMemoria} from '../../src/components/misura-memoria.js';
import {CAPACITA_MEMORIA as C,RUNTIME_MEMORIA as R} from '../../lab/fixtures/misura-memoria.js';
test('MEM-CONTRATTO: una misura invalida non diventa zero',()=>{assert.equal(normalizzaCapacita(C),C);for(const c of [null,{}, {...C,memory:{totalBytes:0,freeBytes:0}},{...C,memory:{totalBytes:10,freeBytes:11}},{...C,measuredAt:'ieri'}])assert.throws(()=>normalizzaCapacita(c),/non è valida/);});
test('MEM-RAM-DISCO: riserva del disco separata dalla memoria e zero liberi valido',()=>{const d=datiMemoria(C,R);assert.equal(d.libera,12*1024**3);assert.equal(d.discoAllocabile,99*1024**3);assert.equal(d.percentuale,62.5);assert.equal(d.caricato,true);assert.equal(datiMemoria({...C,memory:{...C.memory,freeBytes:0}},R).libera,0);});
test('MEM-ERRORE-RUNTIME: un errore di lettura non certifica un modello assente',()=>{assert.equal(datiMemoria(C,[],{erroreRuntime:'Server non raggiungibile'}).caricato,null);assert.equal(datiMemoria(C,[]).caricato,false);});
