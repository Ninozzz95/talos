/*
 * D-10B dal vivo: l'uscita di un comando compare MENTRE esce, non tutta alla fine.
 *
 * ⛔ Nessun modello, nessun costo: si usa il `!` del composer, che esegue un comando e basta.
 * ⛔ Si misura ciò che il debito misurava: quanti millisecondi passano fra l'invio e il PRIMO
 *   carattere a schermo, e se il testo CRESCE mentre il comando gira.
 */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { resolve } from 'node:path';
const output = resolve('scratchpad/prove/d10b-uscita-viva');
const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(4000);
  /* ⛔ Deve essere una sessione CONCLUSA: su una ancora viva il `!` viene rifiutato con
     SESSION_NOT_READY — e' il debito D-10D, non un guasto di questa prova. La prima volta questa
     sonda ha aperto una sessione in errore e non ha misurato niente. */
  const conclusa = p.locator('.talos-session-item').filter({ hasText: /conclusa/ }).first();
  if (!await conclusa.count()) throw new Error('⛔ nessuna sessione conclusa nella barra: la prova non parte');
  await conclusa.click();
  await p.waitForTimeout(2500);

  /* Sei righe, una ogni 400 ms: un comando che dura ~2,4 s e parla tutto il tempo. */
  /* ⛔ Il comando gira in bash (WSL, misurato): niente template literal di JavaScript, che bash
     interpreta a modo suo — la prima versione mandava `${++i}` e otteneva «bad substitution».
     Sei righe, una ogni 400 ms: un comando che dura ~2,4 s e parla per tutto il tempo. */
  const comando = '!for i in 1 2 3 4 5 6; do echo "riga $i di 6"; sleep 0.4; done';
  const composer = p.locator('#composerInput');
  await composer.fill(comando);
  const t0 = Date.now();
  await composer.press('Enter');

  const campioni = [];
  for (let i = 0; i < 40; i += 1) {
    const r = await p.evaluate(() => {
      const viva = document.querySelector('.tool-out--viva code');
      const finale = [...document.querySelectorAll('.tool-detail pre:not(.tool-out--viva) code')].pop();
      /* ⛔ Se il comando non e' nemmeno partito, la prova deve DIRLO invece di riportare «fermo». */
      /* ⛔ Non il riassunto: il TESTO DEL SERVER, che sta in un <details> chiuso. Senza aprirlo si
         legge «Questa forma di errore non e' ancora tradotta» e si resta a indovinare. */
      for (const d of document.querySelectorAll('.real-error-note details, [data-c="ErrorNote"] details')) d.open = true;
      const nota = document.querySelector('.real-error-note, [data-c="ErrorNote"]');
      const errore = nota ? nota.textContent.replace(/\s+/g, ' ').trim().slice(0, 500) : null;
      return { viva: viva?.textContent ?? null, finale: finale?.textContent?.slice(-60) ?? null, errore };
    });
    campioni.push({ ms: Date.now() - t0, ...r });
    if (r.viva && campioni.filter((x) => x.viva).length === 2) await p.screenshot({ path: resolve(output, 'durante.png') });
    await p.waitForTimeout(120);
  }
  await p.screenshot({ path: resolve(output, 'fine.png') });

  const conVivo = campioni.filter((x) => x.viva);
  if (!conVivo.length) console.log('⛔ NESSUNA uscita viva: lo schermo è rimasto fermo, il difetto è ancora lì');
  else {
    console.log(`primo carattere a schermo: +${conVivo[0].ms} ms (il comando dura ~2.400 ms)`);
    const lunghezze = [...new Set(conVivo.map((x) => x.viva.length))];
    console.log(`  lunghezze distinte del testo vivo: ${lunghezze.length} → ${lunghezze.slice(0, 8).join(', ')}`);
    console.log(`  ultima uscita viva: ${JSON.stringify(conVivo.at(-1).viva.split('\n').filter(Boolean).at(-1))}`);
    console.log(`  visibile da +${conVivo[0].ms} a +${conVivo.at(-1).ms} ms`);
  }
  const conErrore = campioni.filter((x) => x.errore);
  if (conErrore.length) console.log(`⛔ la chat mostra un errore:
     ${conErrore.at(-1).errore}`);
  const conFinale = campioni.filter((x) => x.finale);
  console.log(`esito finale comparso a +${conFinale[0]?.ms ?? '(mai)'} ms`);
  const dopoEsito = campioni.filter((x) => x.finale && x.viva);
  console.log(`⛔ campioni con vivo E finale insieme: ${dopoEsito.length} (deve essere 0: l'uscita viva se ne va quando arriva quella vera)`);
} finally { await b.close(); }
