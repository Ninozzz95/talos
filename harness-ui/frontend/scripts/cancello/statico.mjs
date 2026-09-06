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
 * ⛔⛔ SULLE CLASSI SENZA REGOLA: il conteggio NON e' un conteggio di difetti, ed e' importante non
 * leggerlo cosi'. Misurato sull'app viva il 06/9, e la misura ha smentito la mia prima lettura:
 *   · `.ft-node` (39 elementi) e `.ft-tree` sembravano nudi guardando i file, ma dal vivo hanno
 *     `list-style-type: none` da una regola generica: NESSUN difetto visivo;
 *   · `.conversation-hero`, `.hero-logo` e `.ft-status-dot`, che avevo chiamato «difetti veri»
 *     leggendo il CSS, sul vivo non erano nemmeno PRESENTI nella pagina: vivono in stati che non
 *     avevo aperto, e su di loro non si puo' dire niente senza aprirli.
 * ⇒ Una classe senza regola e' un SOSPETTO, non un verdetto. Il verdetto lo da' la misura
 *   sull'ELEMENTO vivo — ha davvero l'aspetto sbagliato? — e per quella serve l'orchestratore.
 *   Questo file elenca dove guardare; non dice cosa e' rotto.
 * ⛔ La lezione vale oltre questo file: la stessa fretta che mi ha fatto scrivere «difetti veri» in
 *   un commit poi rettificato e' quella che riempie un rapporto di falsi positivi e lo fa smettere
 *   di essere letto.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simboliMancanti, classiSenzaRegola } from './riferimenti-morti.mjs';
import { funzioniMaiChiamate } from './funzioni-morte.mjs';

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
console.log('\n== CLASSI USATE SENZA NESSUNA REGOLA:', c.length, '(SOSPETTI da guardare, non difetti confermati)');
for (const v of c.slice(0, 25)) console.log('  ', JSON.stringify(v).slice(0, 150));

const morte = funzioniMaiChiamate(sorgenti['legacy/app.js']);
console.log();
console.log('== FUNZIONI DICHIARATE E MAI CHIAMATE:', morte.length);
for (const m of morte) console.log('   ', m.nome);
