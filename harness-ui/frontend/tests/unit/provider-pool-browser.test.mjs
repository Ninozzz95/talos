import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, extname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { cartellaFoto } from '../aiuto/cartella-foto.mjs';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../..', import.meta.url));
const prove = cartellaFoto('bc12-provider-pool');

test('PH-UI-BROWSER componenti reali: menu, azioni, tastiera, desktop, mobile e moto ridotto', async t => {
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  t.after(()=>browser.close());
  // Il risolutore di prova legge solo sorgenti frontend; evita la scansione delle
  // directory del profilo Windows, non consentita alla sandbox di esbuild.
  const sorgenti={name:'sorgenti-ph',setup(b){
    b.onResolve({filter:/.*/},args=>{
      if(/\.(woff2?|ttf)$/u.test(args.path))return {path:args.path,external:true};
      // 13/09: un riferimento che comincia con «/» e' un INDIRIZZO servito dall'app a runtime
      // (qui «/talos/brand/logo-short.svg», che static-files.mjs serve davvero), non un file da
      // impacchettare. Senza questa riga esbuild lo legge come percorso su disco, arriva a
      // C:/talos/... e il cancello lo respinge: il test cadeva su una risorsa che nel browser
      // funziona benissimo. Stessa idea dei font qui sopra: cio' che serve la rete resta fuori.
      // Su POSIX anche l'entry point assoluto del CSS comincia con «/»: quello e' un FILE e deve
      // restare interno al bundle. `kind` distingue i due casi senza dipendere dalla piattaforma.
      if(args.kind!=='entry-point'&&args.path.startsWith('/'))return {path:args.path,external:true};
      const path=resolve(args.resolveDir||frontend,args.path);
      if(relative(frontend,path).startsWith('..'))throw new Error('Sorgente fuori dal frontend: ' + path + '  (chiesto da ' + (args.importer || 'ingresso') + ' come ' + args.path + ')');
      return {path,namespace:'ph'};
    });
    b.onLoad({filter:/.*/,namespace:'ph'},async args=>({contents:await readFile(args.path,'utf8'),resolveDir:dirname(args.path),loader:extname(args.path)==='.css'?'css':'js'}));
  }};
  const script = await build({ absWorkingDir:tmpdir(), plugins:[sorgenti], stdin:{contents:`
    import {creaProviderCard} from './src/components/provider-card.js';
    import {creaSceltaFallback} from './src/components/fonti-modelli.js';
    window.ph={creaProviderCard,creaSceltaFallback};
  `,resolveDir:frontend,sourcefile:'ph-banco.js'},tsconfigRaw:{},bundle:true,write:false,format:'iife',logLevel:'silent' });
  const stile = await build({absWorkingDir:tmpdir(),plugins:[sorgenti],entryPoints:[resolve(frontend,'src/styles/main.css')],tsconfigRaw:{},bundle:true,write:false,external:['./fonts/*'],logLevel:'silent'});
  for(const larghezza of [1440,390]){
    const page=await browser.newPage({viewport:{width:larghezza,height:1000},reducedMotion:'reduce'});
    t.after(()=>page.close());
    const errori=[];page.on('pageerror',e=>errori.push(e.message));
    // Tutta la prova è isolata: nessuna richiesta del browser può raggiungere un servizio.
    await page.route('**/*',route=>route.abort());
    await page.setContent('<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body><main style="padding:16px;max-width:900px;margin:auto"><h1>Fornitori e accessi</h1><p>Banco P-H · componenti isolati</p><div id="card"></div><div id="scelta"></div><div id="menu"></div></main></body></html>');
    await page.addStyleTag({content:stile.outputFiles[0].text});
    await page.addScriptTag({content:script.outputFiles[0].text});
    await page.evaluate(()=>{
      window.azioni=[];window.fallback=[];
      const row={id:'deepseek',label:'DeepSeek',keyConfigured:true,requiresKey:true,supportsEndpoint:true,endpoint:'https://api.deepseek.com',timeoutSeconds:60,origineChiave:'custodia',pool:[
        {impronta:'a'.repeat(64),origine:'custodia',stato:'in-panchina',causa:'traffico',inPanchinaFino:Date.parse('2026-09-12T17:00:00Z')},
        {impronta:'b'.repeat(64),origine:'custodia',stato:'disponibile'},
      ],modelliDiRiserva:[{id:'deepseek-flash',nome:'DeepSeek Flash',toolCalling:true}]};
      document.querySelector('#card').append(ph.creaProviderCard(row,{aperta:true,onAzionePool:async azione=>{azioni.push(azione.azione);},onMenu:(voci)=>{
        const menu=document.querySelector('#menu');menu.replaceChildren();
        for(const voce of voci){const b=document.createElement('button');b.textContent=voce.etichetta;b.type='button';b.addEventListener('click',()=>{voce.aziona();menu.replaceChildren();});menu.append(b);}
      }}));
      document.querySelector('#scelta').append(ph.creaSceltaFallback({fornitori:[row],onChange:v=>{window.fallback=v;}}));
    });
    await page.getByRole('button',{name:'Azioni per chiave 2',exact:true}).click();
    await page.locator('#menu').getByRole('button',{name:'Rimuovi',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>azioni),['rimuovi']);
    await page.locator('[data-provider-key]').fill('finta-di-prova-browser');
    await page.getByRole('button',{name:'Aggiungi chiave',exact:true}).click();
    assert.equal(await page.locator('[data-provider-key]').inputValue(),'');
    assert.equal((await page.locator('body').innerText()).includes('finta-di-prova-browser'),false);
    await page.getByLabel('Fornitore e modello con cui continuare').selectOption('0');
    await page.getByRole('button',{name:'Aggiungi',exact:true}).focus();await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(()=>fallback),[{provider:'deepseek',model:'deepseek-flash'}]);
    await page.getByRole('button',{name:'Rimuovi DeepSeek · DeepSeek Flash',exact:true}).focus();await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(()=>fallback),[]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
    await mkdir(prove,{recursive:true});
    await page.screenshot({path:resolve(prove,`PH-UI-${larghezza}.png`),fullPage:true});
    assert.deepEqual(errori,[]);
  }
});
