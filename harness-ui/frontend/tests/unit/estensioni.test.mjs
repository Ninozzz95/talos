import {test} from 'node:test';import assert from 'node:assert/strict';import {datiEstensione,filtraEstensioni} from '../../src/components/estensioni.js';import {ESTENSIONI} from '../../lab/fixtures/estensioni.js';
test('EXT-STATO: fidato non significa connesso, ignoto non concede fiducia',()=>{assert.equal(datiEstensione('mcp',{...ESTENSIONI.mcp[0],fidato:true}).stato,'Fidato');assert.equal(datiEstensione('hooks',{...ESTENSIONI.hooks[0],fidato:'true'}).fidabile,false);assert.equal(datiEstensione('skills',ESTENSIONI.skills[0]).stato,'Disponibile');});
test('EXT-DETTAGLI: argomenti, eventi e avvisi persistono dopo fiducia',()=>{assert.ok(JSON.stringify(datiEstensione('mcp',ESTENSIONI.mcp[0])).includes('--read-only'));assert.ok(JSON.stringify(datiEstensione('hooks',ESTENSIONI.hooks[0])).includes('Prima di usare un attrezzo'));assert.deepEqual(datiEstensione('plugins',{...ESTENSIONI.plugins[0],fidato:true}).avvisi,ESTENSIONI.plugins[0].avvisi);});
test('EXT-RICERCA: trova nome, descrizione e campi tecnici senza riordinare',()=>{assert.deepEqual(filtraEstensioni('mcp',ESTENSIONI.mcp,'read_document'),[ESTENSIONI.mcp[0]]);assert.equal(filtraEstensioni('skills',ESTENSIONI.skills,'consegna').length,1);});
test('EXT-REGIA-JSON: i token sono dati JSON validi',async()=>{const {readFile}=await import('node:fs/promises');const t=await readFile(new URL('../../mockup/talos-mockup.html',import.meta.url),'utf8');assert.doesNotThrow(()=>JSON.parse(t.match(/<script type="application\/json" id="talos-tokens-dtcg">([\s\S]*?)<\/script>/)[1]));});

/*
 * ⭐⭐⭐ 5-ter (17/09/2026) — LA FRASE DELLA FIDUCIA A SCHERMO, E MAI IL MOTIVO TECNICO.
 *
 * Da `ba420a95` il backend calcola `motivo` (`mai-approvato` · `regola-precedente` ·
 * `contenuto-cambiato`) e una `frase` scritta per una persona. Il pannello le buttava via e
 * disegnava un «Fida» nudo: un plugin GIÀ approvato che va riapprovato perché la regola è cambiata
 * aveva lo stesso aspetto di uno MANOMESSO — un allarme dove c'era un costo nostro, dichiarato.
 */
test('EXT-FRASE-01: la frase della fiducia arriva ai dati della scheda, e il motivo tecnico NO', () => {
  const dati = datiEstensione('plugins', { ...ESTENSIONI.plugins[0], fidato: false, motivo: 'contenuto-cambiato', frase: 'Il contenuto del pacchetto è cambiato dopo la tua approvazione: controllalo e approvalo di nuovo.' });
  assert.equal(dati.frase, 'Il contenuto del pacchetto è cambiato dopo la tua approvazione: controllalo e approvalo di nuovo.');
  /* ⛔ Il `motivo` è un nome tecnico e non deve poter arrivare a schermo da nessuna parte. */
  assert.equal(JSON.stringify(dati).includes('contenuto-cambiato'), false, 'il motivo tecnico non entra nei dati della scheda');
  assert.equal(JSON.stringify(dati).includes('mai-approvato'), false);
});

test('EXT-FRASE-02: senza frase non si inventa niente, e una frase vuota non diventa una riga vuota', () => {
  assert.equal(datiEstensione('plugins', { ...ESTENSIONI.plugins[0], fidato: false }).frase, null, 'un backend più vecchio non fa comparire una riga');
  assert.equal(datiEstensione('plugins', { ...ESTENSIONI.plugins[0], fidato: false, frase: '   ' }).frase, null, 'e nemmeno una frase di soli spazi');
  /* ⛔ AL CONTRARIO: la frase non cambia il resto — «Da fidare» resta lo stato, e il pulsante resta. */
  const d = datiEstensione('plugins', { ...ESTENSIONI.plugins[0], fidato: false, frase: 'x' });
  assert.equal(d.stato, 'Da fidare');
  assert.equal(d.fidabile, true);
});
