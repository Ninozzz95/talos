import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/parity',testMatch:['board-vivo.spec.mjs','memoria-vivo.spec.mjs','attivita-vivo.spec.mjs','libreria-vivo.spec.mjs','ricerca-vivo.spec.mjs','officina-vivo.spec.mjs', 'automazioni-vivo.spec.mjs','capability-vivo.spec.mjs','estensioni-vivo.spec.mjs','doctor-vivo.spec.mjs','impostazioni-vivo.spec.mjs','fonte-ricerca-vivo.spec.mjs','catalogo-modelli-vivo.spec.mjs','misura-memoria-vivo.spec.mjs','runtime-modelli-vivo.spec.mjs','provider-card-vivo.spec.mjs'],timeout:90_000,fullyParallel:false,forbidOnly:true,retries:0,workers:1,
 reporter:[['list'],['json',{outputFile:'artifacts/board-vivo.json'}]],
 use:{channel:'chrome',headless:true,locale:'it-IT',reducedMotion:'reduce',trace:'retain-on-failure'},
 projects:[['desktop-1440x900',1440,900],['desktop-1280x800',1280,800],['desktop-1024x800',1024,800]].map(([name,width,height])=>({name,use:{viewport:{width,height}}})),
});
