import { expect, test } from '@playwright/test';

/*
 * ⭐⭐ BC-78.2 e BC-78.3 — due misure di GEOMETRIA sulle superfici che tagliano.
 *
 * ⛔ Tutte e due misurano RETTANGOLI e PIXEL, non la presenza di una classe: una regola CSS che
 *   esiste e non si vede è esattamente il difetto che queste due righe descrivono.
 */

test.use({ locale: 'it-IT' });

async function apri(page, { larghezza, altezza, tema }) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
}

/*
 * BC-78.2 — LA BARRA LATERALE TAGLIA UNA VOCE A METÀ.
 *
 * `max-height:50%` cade dove capita: a 900 px di finestra sono 450, e cadono in mezzo a una voce.
 * Il tetto resta (è la guardia che impedisce ai luoghi di mangiarsi le sessioni), ma il taglio deve
 * DIRE «continua» invece di sembrare un guasto — la stessa cosa che le linguette di BC-63 dicono
 * con la sfumatura sui bordi, qui in verticale e senza JavaScript (`background-attachment:local`,
 * Lea Verou, letto il 17/09/2026).
 *
 * ⛔ Si misurano i PIXEL, non la regola: si fotografa la striscia bassa dell'elenco a scorrimento
 *   zero e poi in fondo, e le due immagini devono essere DIVERSE — cioè l'ombra c'è quando c'è
 *   dell'altro e sparisce quando non c'è più niente. Una prova sul `background-image` direbbe solo
 *   che qualcuno ha scritto una riga di CSS.
 */
for (const [larghezza, altezza] of [[1024, 800], [1440, 900]]) {
  for (const tema of ['dark', 'light']) {
    test(`BC78-2 (${larghezza}x${altezza}, ${tema}) — dove la barra taglia, si vede che continua`, async ({ page }) => {
      await apri(page, { larghezza, altezza, tema });
      /* «Strumenti» chiuso è il default e il tetto non viene toccato: si apre, che è il gesto della
         persona che fa nascere il difetto. */
      await page.locator('#testataGruppoStrumenti').click();
      await page.waitForTimeout(250);
      /*
       * ⛔⛔ 18/09/2026 — QUESTA PROVA HA CAMBIATO SOGGETTO, E NON SI È ALLENTATA.
       * Fino a oggi misurava il NAV (`.td-sidebar-nav`) con il suo tetto del 50%: era lì che
       * l'elenco sbordava e il taglio doveva dire «continua». Quel tetto è stato TOLTO su ordine
       * dell'owner (la barra è UNA regione di scorrimento: `.talos-sidebar`), quindi il nav non
       * scorre più e la premessa di prima non può formarsi — misurato: `scorrevole: false`,
       * `quantoResta: 0`.
       * ⇒ Il soggetto adesso è la REGIONE VERA, e la sfumatura da provare è quella nuova: il
       *   plateau opaco + rampa sopra il piede appiccicato (`.talos-sidebar__foot::before`).
       *   La striscia da fotografare non è più a ridosso del bordo (lì il plateau è opaco per
       *   costruzione, quindi sarebbe identica nei due stati) ma DENTRO LA RAMPA: è lì che si vede
       *   se sotto c'è ancora una riga o il vuoto.
       */
      const misura = await page.evaluate(() => {
        const barra = document.querySelector('.talos-sidebar');
        const piede = barra.querySelector('.talos-sidebar__foot');
        const r = barra.getBoundingClientRect();
        const pr = piede?.getBoundingClientRect();
        const primaDelPiede = getComputedStyle(piede, '::before');
        return {
          scorrevole: barra.scrollHeight > barra.clientHeight + 1,
          quantoResta: Math.round(barra.scrollHeight - barra.clientHeight),
          rett: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
          strati: getComputedStyle(barra).backgroundAttachment,
          bordoPiede: pr ? Math.round(pr.top) : null,
          sfumatura: { altezza: primaDelPiede.height, top: primaDelPiede.top, immagine: primaDelPiede.backgroundImage.slice(0, 60) },
        };
      });
      console.log(`MISURA-BC78-2 ${larghezza}x${altezza} ${tema} = ${JSON.stringify(misura)}`);
      /*
       * ⛔ LA PREMESSA, NEI DUE VERSI. Con la barra a UNA regione ci sono due esiti possibili, e
       * pretendere sempre lo scorrimento condannerebbe una scena in cui non c'è niente da annunciare:
       *  · la regione SBORDA (1024×800: 65 px) → il taglio deve dire «continua» (le due foto
       *    differiscono);
       *  · la regione NON sborda (1440×900: 0 px nascosti) → non c'è nessun taglio, e ciò che si
       *    pretende è l'altra metà della promessa: l'ultima riga è INTERA sopra il piede.
       * ⛔ E il verso opposto si prova da sé: se a 1440 la barra tornasse a tagliare una riga a metà,
       *   l'asserzione «intera» diventerebbe rossa.
       */
      if (!misura.scorrevole) {
        const ultima = await page.evaluate(() => {
          const barra = document.querySelector('.talos-sidebar');
          const piede = barra.querySelector('.talos-sidebar__foot');
          const righe = [...document.querySelectorAll('#sessionList .talos-session-item, #sessionList .td-session-row')];
          const r = righe[righe.length - 1]?.getBoundingClientRect();
          const pr = piede?.getBoundingClientRect();
          return r && pr ? { intera: r.bottom <= pr.top + 0.5, sotto: Math.round(r.bottom), piede: Math.round(pr.top) } : null;
        });
        expect(ultima, 'la scena non si è formata: nessuna riga di sessione da misurare').not.toBeNull();
        expect(ultima.intera, `la barra non sborda ma l'ultima riga non è intera: finisce a ${ultima.sotto}, il piede inizia a ${ultima.piede}`).toBe(true);
        return;
      }

      /* La striscia sta DENTRO LA RAMPA sopra il piede (a 30 px dalla sua cima): lì il velo lascia
         ancora vedere cosa sta scorrendo sotto. */
      const striscia = { x: misura.rett.x, y: misura.bordoPiede - 34, width: misura.rett.w, height: 10 };
      const inCima = await page.screenshot({ clip: striscia });
      await page.evaluate(() => { const b = document.querySelector('.talos-sidebar'); b.scrollTop = b.scrollHeight; });
      await page.waitForTimeout(150);
      const inFondo = await page.screenshot({ clip: striscia });
      /* ⛔ Il verdetto: la striscia bassa CAMBIA quando non c'è più niente sotto. Se l'ombra non ci
         fosse (o fosse fissa) le due immagini sarebbero identiche — ed è esattamente ciò che accade
         togliendo i due gradienti `local`. */
      expect(Buffer.compare(inCima, inFondo), 'la striscia bassa non cambia fra «c’è dell’altro» e «sei in fondo»').not.toBe(0);
    });
  }
}

/*
 * BC-78.3 — UN PANNELLO APPICCICATO SENZA SCORRIMENTO PROPRIO NASCONDE IL SUO PIEDE.
 *
 * `.talos-detail` è `position:sticky; top:0`: se è più alto dello spazio che ha, la parte bassa —
 * dove stanno i pulsanti, «Fida» compreso — non si raggiunge più, perché scorrendo il pannello
 * resta fermo. Misurato prima della cura, a 1024×800: il dettaglio degli attrezzi arrivava a
 * **1228** su una finestra di **800** (lì la colonna si impila e la pagina scorre, quindi il piede
 * era raggiungibile a fatica); il caso che MORDE è sopra i 1100 px, dove il pannello è appiccicato
 * davvero.
 *
 * ⛔ La misura non si prende solo alle due misure comode: si prende anche in una finestra BASSA e
 *   larga, che è dove la regola `sticky` fa il danno. Se si misurasse solo 1024 e 1440 il difetto
 *   resterebbe verde.
 */
const MISURA_DETTAGLIO = `(() => {
  const dettagli = [...document.querySelectorAll('.talos-detail')].filter((n) => n.offsetParent !== null);
  const scrollport = (() => {
    let p = dettagli[0]?.parentElement;
    while (p && p !== document.body) { if (/auto|scroll/.test(getComputedStyle(p).overflowY)) return Math.round(p.clientHeight); p = p.parentElement; }
    return null;
  })();
  return {
    quanti: dettagli.length,
    /* L'altezza dello spazio in cui il pannello si appiccica: è LEI il metro, non la finestra.
       Un pannello piu alto di questo, appiccicato, nasconde il proprio piede per sempre. */
    scrollport,
    pannelli: dettagli.map((n) => {
      const r = n.getBoundingClientRect();
      const s = getComputedStyle(n);
      return {
        id: n.id || n.dataset.c || n.className.slice(0, 24),
        top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
        position: s.position,
        /* Appiccicato e senza scorrimento proprio, il piede del pannello è IRRAGGIUNGIBILE: quello
           che esce sotto il bordo della finestra non torna indietro scorrendo.
           ⛔ Qui dentro niente apici inversi: chiuderebbero la stringa che porta questa sonda. */
        appiccicatoEFuori: s.position === 'sticky' && r.bottom > window.innerHeight,
        scorreDaSolo: n.scrollHeight > n.clientHeight + 1,
      };
    }),
    finestra: window.innerHeight,
  };
})()`;

for (const [larghezza, altezza, perche] of [[1024, 800, 'la misura piccola del desktop'], [1440, 900, 'la misura grande'], [1200, 420, 'larga e BASSA: qui «sticky» morde']]) {
  test(`BC78-3 (${larghezza}x${altezza}) — ${perche}: il dettaglio non lascia il suo piede fuori dalla finestra`, async ({ page }) => {
    await apri(page, { larghezza, altezza, tema: 'dark' });
    await page.evaluate(() => { document.querySelector('[data-vaia="capability"]')?.click(); });
    await page.waitForTimeout(350);
    /*
     * ⛔ Si misura DOPO aver scorso fino in fondo, e non appena aperta la vista: prima di scorrere
     *   il pannello è ancora al suo posto naturale e può sporgere sotto la finestra senza che sia
     *   un difetto — scorrendo risale. Il difetto vero è quello che resta DOPO: quando il pannello
     *   si è APPICCICATO e la sua parte bassa non torna più indietro. Misurare a scorrimento zero
     *   avrebbe accusato anche un pannello sano.
     */
    await page.evaluate(() => {
      /* ⛔ Il pannello VISIBILE, non il primo del documento: `.talos-detail` ce l'hanno anche il
         Laboratorio modelli, il catalogo e l'Officina, tutti nascosti — e il primo che capita ha
         rettangolo zero, quindi la catena di scorrimento che se ne ricava è quella sbagliata.
         Trovato con una sonda, dopo che questo scorrimento non spostava niente. */
      let p = [...document.querySelectorAll('.talos-detail')].find((n) => n.offsetParent !== null)?.parentElement;
      while (p && p !== document.body) {
        if (p.scrollHeight > p.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(p).overflowY)) { p.scrollTop = p.scrollHeight; return; }
        p = p.parentElement;
      }
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(200);
    const m = await page.evaluate(MISURA_DETTAGLIO);
    console.log(`MISURA-BC78-3 ${larghezza}x${altezza} = ${JSON.stringify(m)}`);
    /* La PREMESSA: se nessun pannello è a schermo, questa prova non sta misurando niente. */
    expect(m.quanti, 'la scena non si è formata: nessun pannello di dettaglio a schermo').toBeGreaterThan(0);
    const guai = m.pannelli.filter((p) => p.appiccicatoEFuori);
    expect(guai, `un pannello appiccicato lascia il piede fuori dalla finestra: ${JSON.stringify(guai)}`).toEqual([]);
    /*
     * ⛔⛔ IL VERDETTO CHE MORDE, e ci sono volute due riscritture per trovarlo. Le prime due
     *   versioni («il piede sporge sotto la finestra») passavano ANCHE senza la cura: il blocco che
     *   contiene il pannello finisce prima della fine dello scorrimento, quindi a un certo punto il
     *   pannello si stacca e risale comunque. Una prova che passa nei due casi non sta misurando.
     * ⇒ Il metro giusto è lo SPAZIO in cui il pannello si appiccica: un pannello più alto di quello,
     *   appiccicato, tiene il proprio piede fuori per tutto il tempo in cui resta incollato — e lì
     *   «Fida» non si raggiunge. Misurato a 1200×420: senza tetto **456 px** di pannello contro uno
     *   spazio di **336**; col tetto il pannello sta dentro e ha il suo scorrimento.
     */
    for (const p of m.pannelli) {
      if (p.position !== 'sticky' || m.scrollport == null) continue;
      expect(p.h, `${p.id}: appiccicato e più alto dello spazio in cui si appiccica (${p.h} px contro ${m.scrollport}) — il suo piede resta fuori`).toBeLessThanOrEqual(m.scrollport);
    }
  });
}
