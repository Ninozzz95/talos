/*
 * Il cancello STATICO: i controlli che non hanno bisogno di un browser, lanciati sull'app vera.
 *
 * Si lancia con:  node scripts/cancello/statico.mjs
 *
 * ⛔ Esiste separato dall'orchestratore di proposito: gira in due secondi, non apre niente e non
 * tocca nessuna porta, quindi puo' stare in un hook o in CI dove aprire un browser non si puo'.
 * Cio' che richiede l'app VIVA (ascoltatori via CDP, stati a schermo, testo renderizzato) sta
 * nell'altro.
 *
 * ⛔ Sulle classi senza regola: il conteggio grezzo NON e' il conteggio dei difetti. Verificato a
 * campione il 06/9 — su tre, due erano difetti veri (`.conversation-hero` e `.ft-status-dot`: nessuno
 * stile ne' dalla classe ne' dall'id) e uno era una ridondanza innocua (`.ft-tree`, servito da
 * `[role=tree]`). La distinzione la fa l'orchestratore, che sull'app viva puo' CHIEDERE se
 * l'elemento ha davvero uno stile applicato invece di indovinarlo da un file.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simboliMancanti, classiSenzaRegola } from './riferimenti-morti.mjs';

// ⛔ i percorsi partono dalla radice del frontend, non da dove sta lo script: cosi' si lancia da
//    qualunque cartella senza che «funziona solo se sei nel posto giusto» diventi una trappola.
const RADICE = fileURLToPath(new URL('../../', import.meta.url));
const leggi = (p) => readFileSync(RADICE + p, 'utf8');
const html = leggi('index.template.html');
const css = [leggi('src/styles/index.css'), leggi('src/styles/foglio-monolite.css')].join(String.fromCharCode(10));
const sorgenti = { 'legacy/app.js': leggi('src/legacy/app.js') };
for (const f of readdirSync(RADICE + 'src/components')) if (f.endsWith('.js')) sorgenti[`components/${f}`] = leggi(`src/components/${f}`);
for (const f of readdirSync(RADICE + 'src/bridge')) if (f.endsWith('.js')) sorgenti[`bridge/${f}`] = leggi(`src/bridge/${f}`);

console.log('sorgenti letti:', Object.keys(sorgenti).length, '| css', Math.round(css.length / 1024) + 'K | html', Math.round(html.length / 1024) + 'K');

const s = simboliMancanti({ html, sorgenti });
console.log('\n== SIMBOLI CHIAMATI E MAI DISEGNATI:', s.length);
for (const v of s.slice(0, 12)) console.log('  ', JSON.stringify(v).slice(0, 160));

const c = classiSenzaRegola({ html, css, sorgenti });
console.log('\n== CLASSI USATE SENZA NESSUNA REGOLA:', c.length);
for (const v of c.slice(0, 25)) console.log('  ', JSON.stringify(v).slice(0, 150));
