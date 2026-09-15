/*
 * Ottavo controllo del cancello: I VELI SI GUARDANO DENTRO.
 *
 * ⛔⛔⛔ 07/09/2026 — nato da un difetto che l'owner ha visto prima di me, dopo che avevo detto
 * «fatto» senza guardare lo schermo. Il velo «Modello e ragionamento» aveva il catalogo giusto e
 * l'aria di essere rotto: campo di ricerca senza bordo, righe senza forma, e il cursore del
 * ragionamento tagliato via dal bordo del dialogo.
 *
 * Le due cause sono due FAMIGLIE, non due sviste — ed è per questo che esiste un controllo:
 *
 * 1. **La variabile che in quel contesto non c'è.** `.sheet-input` si applicava eccome, e diceva
 *    `border: 1px solid var(--line)`. Ma `--line` era definita solo su `dialog.sheet-dialog,
 *    dialog.command-dialog, .ft-actions-menu`: dentro un velo del tema non esiste.
 *    ⛔ Il vincolo che non conoscevo, e che la ricerca ha aggiunto: un `var()` **senza fallback** su
 *    una variabile assente rende la dichiarazione *invalida al tempo del calcolo*, e la proprietà
 *    torna al valore iniziale — non a un ripiego. Da lì `border: 0px none` e fondo trasparente,
 *    senza un errore da nessuna parte.
 *    Fonti 07/09/2026: Matthias Ott, «CSS Custom Properties Fail Without Fallback»; Scrimba, «CSS
 *    Variables: A Complete Guide 2026».
 *    ⇒ Due cure, e il controllo le nomina: definire la variabile anche sul contenitore nuovo,
 *      oppure scrivere `var(--line, <valore>)`.
 *
 * 2. **Il contenuto tagliato invece che scorrevole.** Il corpo del velo aveva `overflow: hidden` da
 *    una regola scritta per un markup precedente: il cursore finiva 42 px oltre il bordo e non
 *    c'era modo di raggiungerlo. Un difetto che nessun test funzionale vede — «`overflow: hidden`
 *    clipping content won't show up in a DOM diff» (Bug0, «What Is Visual Regression Testing?»,
 *    letto il 07/09/2026): il nodo c'è, il testo c'è, e sullo schermo non c'è niente.
 *
 * Gira col browser perché «una dichiarazione è caduta» e «questo non si raggiunge» sono domande a
 * cui solo la pagina viva può rispondere.
 *
 *   node scripts/cancello/veli-sani.mjs              tutti i veli del template
 *   node scripts/cancello/veli-sani.mjs veloModello  uno solo
 *
 * ⛔ Di suo guarda il 4174. Per non toccare la porta dell'owner durante una prova, si passa
 *   `TALOS_VELI_BASE=http://127.0.0.1:4211`.
 * Esce 1 se trova un velo malato: è un cancello, non un rapporto.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RADICE = fileURLToPath(new URL('../../', import.meta.url));
const BASE = process.env.TALOS_VELI_BASE || 'http://127.0.0.1:4174';

/**
 * Gli id dei veli dichiarati nel template. Puro: si legge il markup, invece di tenere a mano un
 * elenco che resterebbe indietro al primo velo nuovo.
 * @param {string} html
 * @returns {string[]}
 */
export function veliDelTemplate(html) {
  /*
   * ⛔ 07/9, primo giro del controllo: cercando ogni `id` che inizia per «velo» tornavano anche
   *   `veloAlberoNota` e `veloAlberoRiassunto` — che veli non sono: sono pezzi DENTRO un velo, e si
   *   chiamano così solo perché li ho battezzati io. Un controllo che accusa elementi inesistenti
   *   è rumore: si prendono i soli `.overlay-layer`, cioè la cosa che si apre davvero.
   */
  const testo = String(html || '');
  const trovati = [];
  for (const m of testo.matchAll(/<div[^>]*class="[^"]*overlay-layer[^"]*"[^>]*id="(velo[A-Za-z0-9]+)"/g)) trovati.push(m[1]);
  for (const m of testo.matchAll(/<div[^>]*id="(velo[A-Za-z0-9]+)"[^>]*class="[^"]*overlay-layer[^"]*"/g)) trovati.push(m[1]);
  return [...new Set(trovati)];
}

/**
 * Il verdetto su un velo, dai numeri raccolti nella pagina. Pura, così si prova senza aprire nulla.
 * @param {{id:string, aperto:boolean, nudi?:Array, sbordanti?:Array, fuoriFinestra?:boolean}} misura
 * @returns {{id:string, sano:boolean, motivi:string[]}}
 */
export function giudicaVelo(misura) {
  const motivi = [];
  if (!misura?.aperto) motivi.push('non si è aperto');
  for (const n of misura?.nudi || []) {
    motivi.push(`«${n.classe}» resta senza ${n.cosa}: la regola c'è, ma usa ${n.variabile}, che qui non è definita — definiscila sul contenitore, o dalle un fallback`);
  }
  for (const s of misura?.sbordanti || []) {
    motivi.push(`«${s.classe}» esce di ${s.oltre}px dal corpo, che non scorre: chi guarda non lo raggiunge`);
  }
  if (misura?.fuoriFinestra) motivi.push('il dialogo esce dalla finestra');
  return { id: misura?.id, sano: motivi.length === 0, motivi };
}

/**
 * Come si apre ogni velo, con il gesto che farebbe una persona.
 * ⛔⛔ 07/9, e questa è la scoperta che ha salvato il controllo: al primo giro aprivo i veli
 * togliendo l'attributo `hidden`, e diceva «22 veli, tutti sani». Erano tutti VUOTI: il contenuto
 * lo mette `preparaVeloDaFoglio` quando il velo si apre davvero, e saltandola guardavo scatole
 * vuote. Un controllo che promuove ventidue scatole vuote è peggio di nessun controllo.
 * ⇒ Ogni velo si apre come si apre nell'app: un comando della palette, una scorciatoia, o il
 *   bottone che lo dichiara nel markup (`data-apre-velo`). E un velo che NON ha nessuna via per
 *   essere aperto è un difetto in sé — sono i «veli irraggiungibili» che stiamo chiudendo uno a uno.
 */
export const VIE_PER_APRIRE = Object.freeze({
  veloPermessi: { comando: 'permissions' },
  veloAlbero: { comando: 'tree' },
  veloComandi: { tasti: 'Control+k' },
  veloModello: { tasti: 'Control+Shift+m' },
  veloScorciatoie: { tasti: 'Control+/' },
  veloRinomina: { comando: 'rename' },
  veloEsporta: { comando: 'export' },
  veloIntro: { innesco: '[data-apre-velo="veloIntro"]' },
  veloFornitori: { innesco: '[data-apre-velo="veloFornitori"]' },
  veloRinominaModello: { innesco: '[data-apre-velo="veloRinominaModello"]' },
  veloEliminaModello: { innesco: '[data-apre-velo="veloEliminaModello"]' },
  veloAnnullaDownload: { innesco: '[data-apre-velo="veloAnnullaDownload"]' },
  veloFileModello: { innesco: '[data-apre-velo="veloFileModello"]' },
});

/* ── la parte che ha bisogno del browser ─────────────────────────────────────────────────────── */

/*
 * Raccoglie i numeri di UN velo già aperto. Gira DENTRO la pagina, quindi non può leggere niente
 * da qui: tutto ciò che le serve arriva dall'argomento.
 * ⛔ 07/9 — prima era una stringa passata a `evaluate`: Playwright la valuta come espressione e
 *   l'argomento non arriva, così ogni velo risultava «non aperto». Il controllo accusava tutti e
 *   ventidue, cioè non accusava nessuno. Una funzione vera, e il difetto sparisce.
 */
function sonda(idVelo) {
  const velo = document.getElementById(idVelo);
  const esito = { id: idVelo, aperto: Boolean(velo && !velo.hidden), nudi: [], sbordanti: [], fuoriFinestra: false };
  if (!esito.aperto) return esito;
  const dialogo = velo.querySelector('.talos-dialog') || velo.firstElementChild;
  const corpo = velo.querySelector('.talos-dialog__body');

  const vuoto = (v) => !v || v === 'rgba(0, 0, 0, 0)' || v === 'transparent' || String(v).startsWith('0px none');
  for (const el of velo.querySelectorAll('*')) {
    if (esito.nudi.length > 10) break;
    if (!el.className || typeof el.className !== 'string') continue;
    const s = getComputedStyle(el);
    const bordoVuoto = vuoto(s.border) || s.borderStyle === 'none';
    const fondoVuoto = vuoto(s.backgroundColor);
    if (!bordoVuoto && !fondoVuoto) continue;
    for (const foglio of document.styleSheets) {
      let regole; try { regole = foglio.cssRules; } catch { continue; }
      for (const r of regole) {
        if (!r.selectorText || !r.style) continue;
        let combacia = false; try { combacia = el.matches(r.selectorText); } catch { continue; }
        if (!combacia) continue;
        const m = (r.style.cssText || '').match(/(border|background(?:-color)?)\s*:[^;]*var\((--[a-z0-9-]+)(\s*,)?/i);
        if (!m || m[3]) continue;   // niente var, oppure ha gia un fallback: se cade, cade per scelta
        const cosa = m[1].toLowerCase().startsWith('border') ? 'bordo' : 'fondo';
        if ((cosa === 'bordo' && bordoVuoto) || (cosa === 'fondo' && fondoVuoto)) {
          if (!s.getPropertyValue(m[2]).trim()) esito.nudi.push({ classe: el.className.slice(0, 40), cosa, variabile: m[2] });
        }
      }
    }
  }

  if (corpo && !/auto|scroll/.test(getComputedStyle(corpo).overflowY)) {
    const limite = corpo.getBoundingClientRect().bottom;
    /*
     * ⛔ i DISCENDENTI, non i figli: nel caso vero del 07/9 il figlio diretto stava dentro, e a
     *   sbordare era il cursore due livelli piu giu.
     * ⛔⛔ Ma «sborda dal corpo» NON basta a dire «non si raggiunge»: se un contenitore in mezzo
     *   scorre, il contenuto e li e ci si arriva. Il primo giro di questo controllo accusava la
     *   palette dei comandi — e la palette scorre benissimo (lista alta 579, contenuto 1006).
     *   Un allarme falso e peggio di nessun allarme: si smette di leggerlo, e il giorno che ne
     *   arriva uno vero passa inosservato. Quindi si risale la catena, e si accusa solo cio che
     *   nessuno puo raggiungere.
     */
    const qualcunoScorre = (el) => {
      for (let n = el.parentElement; n && n !== corpo; n = n.parentElement) {
        const s2 = getComputedStyle(n);
        if (/auto|scroll/.test(s2.overflowY) && n.scrollHeight > n.clientHeight + 1) return true;
      }
      return false;
    };
    for (const el of corpo.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.bottom > limite + 1 && !qualcunoScorre(el)) {
        esito.sbordanti.push({ classe: String(el.className || el.tagName).slice(0, 40), oltre: Math.round(r.bottom - limite) });
      }
    }
  }

  if (dialogo) {
    const r = dialogo.getBoundingClientRect();
    esito.fuoriFinestra = r.top < -1 || r.bottom > window.innerHeight + 1 || r.left < -1 || r.right > window.innerWidth + 1;
  }
  return esito;
}


async function principale() {
  const REQ = createRequire(RADICE + 'package.json');
  const { chromium } = REQ('playwright');
  const html = readFileSync(RADICE + 'index.template.html', 'utf8');
  const chiesti = process.argv.slice(2).filter((a) => a.startsWith('velo'));
  const veli = chiesti.length ? chiesti : veliDelTemplate(html);
  console.log(`veli da guardare: ${veli.length}${chiesti.length ? ' (scelti a mano)' : ''} · ${BASE}`);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', locale: 'it-IT' });
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('introSalta')?.click());
  await p.waitForTimeout(800);
  // ⛔ con una sessione aperta: molti veli parlano della sessione corrente, e vuoti direbbero poco
  await p.evaluate(() => document.querySelector('.real-session-item')?.click());
  await p.waitForTimeout(1500);

  const malati = [];
  const senzaVia = [];
  for (const id of veli) {
    // si chiude quello di prima, sempre col gesto di sempre
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(250);
    const via = VIE_PER_APRIRE[id];
    if (!via) { senzaVia.push(id); continue; }
    try {
      if (via.comando) await p.evaluate((c) => window.__talosHarnessUiRuntime?.executeCommand?.(c), via.comando);
      else if (via.tasti) await p.keyboard.press(via.tasti);
      else if (via.innesco) await p.locator(via.innesco).first().click({ timeout: 4000 });
    } catch { /* se il gesto non riesce, il velo risulterà «non aperto»: è la stessa notizia */ }
    await p.waitForTimeout(900);
    const misura = await p.evaluate(sonda, id).catch(() => ({ id, aperto: false }));
    const verdetto = giudicaVelo(misura);
    if (!verdetto.sano) {
      malati.push(verdetto);
      console.log(`⛔ ${id}`);
      for (const m of verdetto.motivi.slice(0, 4)) console.log(`     ${m}`);
    }
  }
  await browser.close();

  console.log();
  if (senzaVia.length) {
    console.log(`⚠ ${senzaVia.length} veli non hanno una via dichiarata per essere aperti, e non sono stati guardati:`);
    console.log(`   ${senzaVia.join(', ')}`);
    console.log('   (o si aggiunge la via in VIE_PER_APRIRE, o quel velo è irraggiungibile — che è un difetto suo)');
  }
  const guardati = veli.length - senzaVia.length;
  console.log(malati.length === 0
    ? `✓ ${guardati} veli guardati, tutti sani`
    : `⛔ ${malati.length} veli su ${guardati} hanno qualcosa che non si vede o non si raggiunge`);
  process.exit(malati.length === 0 ? 0 : 1);
}

if (process.argv[1]?.endsWith('veli-sani.mjs')) {
  principale().catch((e) => { console.error('il controllo non ha potuto girare:', e.message); process.exit(2); });
}
