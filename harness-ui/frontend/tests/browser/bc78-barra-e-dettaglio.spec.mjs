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

/*
 * ⭐⭐⭐ BC78-4 — IL PIEDE DELLA BARRA STA IN FONDO ANCHE QUANDO C'È POCO.
 *
 * Owner, 20/09/2026, primo bug del giro: «nella sidebar di sinistra il footer non sta in fondo».
 *
 * ⛔ La causa, misurata sul sorgente: il piede è un figlio DIRETTO della colonna flex
 *   (`index.template.html:373`, fratello di `.talos-sidebar__sessions` — non dentro), e l'unica
 *   cosa che lo teneva in fondo era `position:sticky; bottom:0` (`styles/mockup-sidebar.css:114`).
 *   Ma lo sticky è INERTE quando non c'è niente da scorrere: con poche sessioni il contenuto è più
 *   corto della barra, il piede resta appiccicato all'ultima riga e sotto di lui resta il vuoto.
 *   E l'altra metà della pinza è a `mockup-sidebar.css:150` — `flex:0 0 auto` sull'elenco sessioni
 *   ha neutralizzato il vecchio `flex:1 1 auto` di `index.css:310`, cioè l'unico elemento che
 *   assorbiva lo spazio libero ha smesso di farlo.
 *
 * Ricerca 20/09/2026 — due soluzioni native, e sono le sole due che la letteratura considera tali:
 *   **flex + `margin-top:auto`** sul piede, oppure **grid `auto 1fr auto`** sul contenitore. Il
 *   margine automatico, in un contenitore flex, assorbe TUTTO lo spazio libero positivo e vale ZERO
 *   quando lo spazio libero è negativo: cioè fa esattamente le due cose che servono qui — spinge in
 *   fondo quando c'è poco, e non tocca niente quando trabocca (dove comanda lo sticky).
 *   Fonti: CSS-Tricks «Flexbox and auto margins»; ModernCSS «Footer: Flexbox vs Grid»; MDN
 *   «Aligning items in a flex container — auto margins»; il pattern `grid-template-rows: auto 1fr
 *   auto` degli app-shell (Linear/Slack/Discord/VS Code, dev.to «I Cloned Linear's Sidebar»).
 *   ⛔ Scartata `absolute`/`fixed`: stacca dal flusso e copre il contenuto. Scartato il div spaziatore
 *   (`.push`): è il debito che la ricerca chiama esplicitamente fragile.
 *
 * ⛔ LE DUE CONDIZIONI, e la prova le pretende TUTTE E DUE — perché `margin-top:auto` è una cura che
 *   può fare danno nel ramo che non si sta guardando:
 *   · POCO CONTENUTO (non sborda) → il piede deve toccare il fondo della barra;
 *   · CONTENUTO CHE SBORDA → il piede resta al fondo lo stesso, e la sua altezza NON cambia:
 *     `flex-shrink` vale 1 su questo figlio (`index.css:360` non lo dichiara), quindi una cura
 *     distratta potrebbe schiacciarlo invece di spingerlo.
 * ⛔ Si misurano RETTANGOLI e PIXEL, mai la presenza di una regola: una `margin-top:auto` scritta e
 *   non applicata è esattamente il difetto che questa prova deve vedere.
 *
 * ⛔⛔ 20/09/2026 — QUESTA PROVA È STATA BOCCIATA DALLA REVIEW AVVERSARIA, e la bocciatura era
 *   giusta: guardava SOLO il bordo di fondo del piede, e una cura DIVERSA e SBAGLIATA la superava
 *   4/4. Misurato dal revisore: togliendo la riga dell'autore e mettendo `justify-content:
 *   space-between` sulla barra, il piede finisce in fondo lo stesso (lo spazio si spalma fra TUTTI
 *   i figli) e la ricerca, il nav e «Strumenti» scendono di 457 px al centro della barra. Verde su
 *   una sidebar visibilmente rotta.
 *
 * ⇒ La prova adesso misura **DOVE VA A FINIRE LO SPAZIO LIBERO**, che è la cosa che distingue la
 *   cura giusta da tutte le altre. In una colonna flex lo spazio libero può finire in un posto solo,
 *   e le forme sono separabili con due numeri. Misurati a 1440×1600 (barra 1600, 914,75 px liberi):
 *
 *     cura giusta (margin-top:auto sul piede)  primiInCima 0        spazi 0, 0, 0, 914.75
 *     senza cura                               primiInCima 0        spazi 0, 0, 0, 0      ← il piede galleggia
 *     justify-content: space-between           primiInCima 0        spazi 228.69 ×4       ← SBAGLIATA
 *     justify-content: flex-end                primiInCima 914.75   spazi 0, 0, 0, 0      ← SBAGLIATA
 *     margin-top:auto anche sulle .actions     primiInCima 0        spazi 914.75, 0, 0, 0 ← SBAGLIATA
 *
 * ⛔ E c'è un secondo motivo per cui la misura è questa: con `margin-top:auto` PRESENTE,
 *   `justify-content` è **inerte** (lo spazio libero va ai margini automatici, e l'allineamento
 *   principale non ha effetto). Un tentativo di misura che avesse tenuto la cura e aggiunto
 *   `space-between` avrebbe dato numeri identici in tutti i casi — è successo, ed è scritto qui
 *   perché non venga rifatto.
 *
 * ⛔⛔ CHE COSA QUESTA PROVA PRESIDIA, E CHE COSA NO — scritto dopo QUATTRO bocciature avversarie,
 *   perché è la sola formulazione che regge:
 *
 *   · **Presidia la GEOMETRIA** (dove stanno i rettangoli: il piede in fondo alla barra, la barra
 *     che arriva in fondo alla finestra, i figli impilati dall'alto) **e lo STATO CHE IL DOM
 *     DICHIARA** (un figlio c'è o non c'è, è `display:none`, è trasparente, il marchio ha i suoi
 *     pezzi).
 *   · **NON presidia il DISEGNO COMPOSTO.** `clip-path`, `mask`, l'opacità di un CONTENITORE, un
 *     velo fatto con uno pseudo-elemento: non hanno **testimone nel DOM**, e nessuna passeggiata
 *     sui discendenti li vedrà mai — un `::after` non sta in `querySelectorAll`. Misurato dal
 *     revisore: con la barra a `opacity: 0.15`, o col piede tagliato da
 *     `clip-path: inset(0 0 100% 0)`, **ogni campo di questa misura resta identico** e le otto
 *     prove restano verdi, mentre a schermo il piede non si disegna affatto.
 *   ⇒ Di quella metà è giudice **la FOTO**, che per regola dell'owner è obbligatoria su ogni
 *     consegna e si ispeziona a mano. **Non è un complemento: è l'unico giudice di quella metà.**
 *   ⇒ E **non si aggiungono altre proprietà a questo elenco**: ognuna ha un gemello (`filter` ha
 *     `opacity`, entrambe hanno `mask` e `clip-path`) e un velo pseudo-elemento le scavalca tutte.
 *     La riga su `filter` qui sotto si tiene **come campanello su un buco misurato**, NON come
 *     chiusura della classe.
 *   ⛔ Conseguenza per chi legge un esito verde di questa prova: **vuol dire «la geometria e lo
 *     stato dichiarato sono a posto», NON «la barra è certificata».** Detta «certificata» sarebbe
 *     falsa, e in questo progetto è già stata pagata due volte.
 */
const MISURA_PIEDE = `(() => {
  const barra = document.querySelector('.talos-sidebar');
  const piede = barra.querySelector('.talos-sidebar__foot');
  const rb = barra.getBoundingClientRect();
  const rp = piede.getBoundingClientRect();
  const sb = getComputedStyle(barra);
  const sp = getComputedStyle(piede);
  /* Lo sticky si appiccica al padding box dello scorritore: il bordo di fondo va tolto dal
     rettangolo, o una barra col bordo si accuserebbe da sola. Qui il bordo di fondo non c'e'
     (index.css:269 dichiara solo border-right), e la sottrazione lo rende vero comunque. */
  const fondo = rb.bottom - (parseFloat(sb.borderBottomWidth) || 0);
  const arrotonda = (v) => Math.round(v * 100) / 100;
  /*
   * ⛔ SI ELENCANO TUTTI I FIGLI, e si tiene da parte com'e' ciascuno: se ne sparisce uno — \`display:none\`
   *   o \`opacity:0\` — deve farsi vedere QUI. La prima versione filtrava via i figli spenti e poi
   *   misurava solo gli spazi fra i rimasti: togliere un pezzo rendeva la prova PIU' MUTA, non piu'
   *   rossa. Misurato dalla review: con \`.talos-brand{opacity:0}\` le otto prove restavano verdi e
   *   la barra perdeva il marchio.
   */
  const info = [...barra.children].map((n) => {
    const s = getComputedStyle(n);
    const b = n.getBoundingClientRect();
    return {
      id: n.id || n.dataset.c || n.className.split(' ')[0],
      display: s.display, visibilita: s.visibility, opacita: s.opacity, posizione: s.position,
      top: arrotonda(b.top - rb.top), bottom: arrotonda(b.bottom - rb.top), altezza: Math.round(b.height),
    };
  });
  /* I figli che il layout dispone davvero: fuori quelli spenti, e fuori il ridimensionatore, che
     e' \`position:absolute\` e vive fuori dal flusso (index.css:2027). */
  const figli = info.filter((f) => f.display !== 'none' && f.visibilita !== 'hidden' && f.posizione !== 'absolute' && f.posizione !== 'fixed');
  /*
   * ⛔ E SI GUARDA DENTRO, non solo il primo livello. La review ha bocciato la versione precedente
   *   mettendo a zero l'opacita' dei FIGLI del marchio (.talos-brand > *): il marchio resta
   *   integro, i suoi quattro pezzi spariscono, e la barra mostra una banda vuota — otto prove
   *   verdi. Il conteggio dei figli e la loro opacita' non potevano vederlo, perche' quei pezzi
   *   non sono figli DELLA BARRA.
   * ⛔ LA REGOLA E' «SE HA UN RIQUADRO, SI DEVE VEDERE»: si guardano i discendenti che il layout
   *   disegna (riquadro non nullo) e si pretende che si vedano. Non e' una regola inventata: e'
   *   l'unica che separa un guasto da uno stato voluto. Misurato in questo prodotto, i discendenti
   *   spenti LEGITTIMI sono due e sono entrambi display:none, cioe' SENZA riquadro — il pulsante
   *   della selezione multipla (#sessionSelectionToggle) e il gruppo «Strumenti» chiuso
   *   (#gruppoStrumenti, la scelta d'apertura del 18/09). Escluderli per riquadro nullo non
   *   allenta la prova: un pezzo che si vede ma e' trasparente ha un riquadro, e viene preso.
   * ⛔ Qui dentro niente apici inversi: chiuderebbero la stringa che porta questa sonda — e' la
   *   trappola gia' scritta a riga 149 di questo file, e l'ho ripetuta TRE volte lo stesso, la
   *   terza dentro il commento che dice di non farlo.
   */
  const spentiDentro = [];
  for (const n of [...barra.children]) {
    const s0 = getComputedStyle(n);
    if (s0.display === 'none' || s0.visibility === 'hidden' || parseFloat(s0.opacity) <= 0.5) continue;
    for (const d of n.querySelectorAll('*')) {
      const b = d.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) continue; /* non disegnato: e' uno stato voluto, non un guasto */
      const s = getComputedStyle(d);
      if (s.visibility === 'hidden' || parseFloat(s.opacity) <= 0.5 || (s.filter && s.filter !== 'none')) {
        spentiDentro.push({ chi: d.id || d.className.split(' ')[0] || d.tagName, opacita: s.opacity, visibilita: s.visibility, filtro: s.filter, testo: (d.textContent || '').trim().slice(0, 40) });
      }
    }
  }
  const spazi = [];
  for (let i = 1; i < figli.length; i++) spazi.push({ fra: figli[i - 1].id + ' -> ' + figli[i].id, spazio: arrotonda(figli[i].top - figli[i - 1].bottom) });
  return {
    scorrevole: barra.scrollHeight > barra.clientHeight + 1,
    quantoResta: Math.round(barra.scrollHeight - barra.clientHeight),
    barraFondo: Math.round(fondo),
    piedeFondo: Math.round(rp.bottom),
    scarto: Math.round(rp.bottom - fondo),
    piedeAltezza: Math.round(rp.height),
    posizione: sp.position,
    margine: sp.marginTop,
    scorrimento: Math.round(barra.scrollTop),
    /* ⛔ IL TERRENO DI PARAGONE E' LA FINESTRA, non solo la barra: una barra piu' alta dello schermo
       tiene il piede «in fondo alla barra» e FUORI dalla vista. Misurato dalla review: con la barra
       a \`min-height: calc(100vh + 200px)\` il piede finiva a 1739..1800 in una finestra da 1600, e
       le sei asserzioni che certificano la cura restavano VERDI. */
    finestra: window.innerHeight,
    barraSotto: Math.round(rb.bottom),
    barraSopra: Math.round(rb.top),
    paginaScorre: document.documentElement.scrollHeight > window.innerHeight + 1,
    /* ⛔ E LA BARRA DEVE ARRIVARE IN FONDO ALLA FINESTRA, non solo starci dentro: il tetto a una
       direzione lasciava passare una barra alta quanto la finestra MENO 200 px — piede «in fondo
       alla barra» e 200 px di vuoto sotto, cioe' il difetto dell'owner alla lettera, con sei prove
       verdi. (Niente apici inversi qui dentro: chiudono la stringa della sonda.) */
    filtro: sb.filter,
    spentiDentro,
    figli,
    quanti: figli.length,
    primiInCima: figli.length ? figli[0].top : null,
    spazi,
  };
})()`;

/** Gli spazi fra i figli TRANNE quello immediatamente sopra il piede, che è l'ultimo. */
function spaziSopraIlPiede(m) {
  return m.spazi.slice(0, -1);
}

/*
 * LE CONDIZIONI CHE SEPARANO LA CURA GIUSTA DA TUTTE LE ALTRE.
 *
 * ⛔ Che cosa si pretende, e che cosa NON si pretende — perché la seconda metà è costata una
 *   seconda bocciatura:
 *   · il piede tocca il fondo della barra, E LA BARRA STA DENTRO LA FINESTRA;
 *   · i figli sono impilati a partire dall'alto: nessuno spazio fra loro, TRANNE al più quello
 *     sopra il piede;
 *   · ogni figlio che deve esserci c'è, e si vede.
 * ⛔ NON si pretende che lo spazio libero stia DENTRO il margine del piede. La prima versione lo
 *   pretendeva, e così rifiutava due soluzioni native e legittime — `flex:1 1 auto` sul blocco
 *   centrale (cioè il comportamento di `index.css:310`) e la griglia `auto 1fr auto` — che
 *   ottengono lo stesso risultato: misurato dalla review, con `flex:1` sul blocco sessioni gli
 *   ultimi 300 px della barra sono identici al pixel e la prova era ROSSA. Una prova che fissa il
 *   MECCANISMO invece della RICHIESTA boccia la cura di domani.
 */
function pretendiBarraInColonna(m, dove, quantiAttesi) {
  /* 1. Il piede in fondo, e la barra che ARRIVA in fondo alla finestra — non solo che ci stia
        dentro. Il tetto a una direzione lasciava passare una barra alta quanto la finestra meno
        200 px: piede «in fondo alla barra» e 200 px di vuoto sotto, cioe' il difetto dell'owner
        alla lettera, con sei prove verdi. */
  expect(Math.abs(m.scarto), `${dove}: il piede non sta in fondo alla barra: finisce a ${m.piedeFondo} su una barra che finisce a ${m.barraFondo} — ${Math.abs(m.scarto)} px di vuoto sotto`).toBeLessThanOrEqual(1);
  expect(Math.abs(m.barraSotto - m.finestra), `${dove}: la barra non arriva in fondo alla finestra — finisce a ${m.barraSotto} su una finestra di ${m.finestra}: il piede è «in fondo alla barra» e resta del vuoto sotto`).toBeLessThanOrEqual(1);
  expect(m.barraSopra, `${dove}: la barra comincia sopra la finestra (${m.barraSopra})`).toBeGreaterThanOrEqual(-1);
  expect(m.paginaScorre, `${dove}: la pagina scorre — il guscio non dovrebbe avere uno scorrimento proprio`).toBe(false);
  /* 2. Impilati dall'alto: nessuno spazio fra i figli, tranne al più quello sopra il piede. */
  expect(m.primiInCima, `${dove}: il primo figlio della barra non sta in cima — è a ${m.primiInCima} px, quindi lo spazio libero è finito sopra di lui`).toBeLessThanOrEqual(1);
  const sparsi = spaziSopraIlPiede(m).filter((s) => Math.abs(s.spazio) > 1);
  expect(sparsi, `${dove}: i figli della barra non sono impilati — c'è spazio fra loro: ${JSON.stringify(sparsi)}`).toEqual([]);
  /* 3. I pezzi ci sono e si vedono: togliere un figlio lo rende ASSENTE, non invisibile alla prova. */
  expect(m.quanti, `${dove}: la barra non ha i ${quantiAttesi} figli che deve mostrare — ne ha ${m.quanti}: ${JSON.stringify(m.figli.map((f) => f.id))}`).toBe(quantiAttesi);
  const spenti = m.figli.filter((f) => parseFloat(f.opacita) <= 0.5 || f.altezza === 0);
  expect(spenti, `${dove}: dei figli della barra non si vedono: ${JSON.stringify(spenti)}`).toEqual([]);
  /* 4. E nemmeno DENTRO: un pezzo che ha un riquadro deve vedersi. Con `opacity: 0` sui figli del
        marchio la barra restava geometricamente perfetta e mostrava una banda vuota. */
  expect(m.spentiDentro, `${dove}: dentro la barra c'è roba che non si vede: ${JSON.stringify(m.spentiDentro)}`).toEqual([]);
  /* 5. E niente velo su tutta la barra. ⛔ QUESTA RIGA È UN CAMPANELLO, NON UNA CHIUSURA: chiude
        il buco MISURATO (`filter: blur(4px)` passava le otto prove) e non la classe — il gemello
        `opacity: 0.15` sulla barra le sfugge, `mask` e `clip-path` pure, e un velo fatto con uno
        pseudo-elemento le scavalca tutte. Il disegno composto non ha testimone nel DOM: è della
        foto. Vedi il blocco sopra, «CHE COSA QUESTA PROVA PRESIDIA, E CHE COSA NO». */
  expect(m.filtro, `${dove}: la barra ha un filtro addosso (${m.filtro}) — non muove il layout e non si vede dalle misure`).toBe('none');
}

const FIGLI_NORMALI = 5;   // Brand · actions · NavGroups · sessionList · WorkspaceFooter
const FIGLI_ICONE = 3;     // Brand · NavGroups · WorkspaceFooter (le actions e la lista spariscono)

for (const [larghezza, altezza] of [[1440, 1600], [3840, 2060]]) {
  for (const tema of ['dark', 'light']) {
    /* ── IL RAMO CHE L'OWNER HA VISTO: poca roba in barra, e il piede che se ne sta a metà.
          3840×2060 è la SUA finestra (la foto in `Downloads/bug/download.png` è 3840×2160): il
          caso che morde è quello, e a 1440×1600 si riproduce identico perché lo store della suite
          è vuoto. Si provano tutte e due. ── */
    test(`BC78-4a (${larghezza}x${altezza}, ${tema}) — con poche sessioni il piede tocca il fondo della barra`, async ({ page }) => {
      await apri(page, { larghezza, altezza, tema });
      const m = await page.evaluate(MISURA_PIEDE);
      console.log(`MISURA-BC78-4a ${larghezza}x${altezza} ${tema} = ${JSON.stringify(m)}`);
      /* ⛔ LA PREMESSA, o questa prova non misura la cosa che dice di misurare: se la barra sbordasse,
         starebbe misurando lo sticky (che c'è già) e non il caso corto (che è quello rotto). */
      expect(m.scorrevole, `la scena non si è formata: la barra sborda di ${m.quantoResta} px, quindi il piede lo tiene su lo sticky e non si sta provando il caso corto`).toBe(false);
      /* ⛔ La tolleranza è di UN pixel, e in salita non si allarga: i due numeri sono arrotondati, e
         mezzo pixel di arrotondamento non è una riga di interfaccia. */
      pretendiBarraInColonna(m, `${larghezza}x${altezza} ${tema}`, FIGLI_NORMALI);
    });
  }
}

for (const tema of ['dark', 'light']) {
  /* ── IL RAMO OPPOSTO: quando la barra sborda, la cura non deve spostare NIENTE. ── */
  test(`BC78-4b (1024x800, ${tema}) — quando la barra sborda il piede resta al fondo e non si schiaccia`, async ({ page }) => {
    await apri(page, { larghezza: 1024, altezza: 800, tema });
    /* «Strumenti» chiuso è il default: aperto, le voci in più fanno sbordare la regione — è il gesto
       della persona che cerca una voce e non la trova. */
    await page.locator('#testataGruppoStrumenti').click();
    await page.waitForTimeout(250);
    const inCima = await page.evaluate(MISURA_PIEDE);
    await page.evaluate(() => { const b = document.querySelector('.talos-sidebar'); b.scrollTop = b.scrollHeight; });
    await page.waitForTimeout(150);
    const inFondo = await page.evaluate(MISURA_PIEDE);
    console.log(`MISURA-BC78-4b 1024x800 ${tema} = ${JSON.stringify({ inCima, inFondo })}`);
    /* ⛔ La premessa ha 65 px di margine, misurati: a 1024×800 con «Strumenti» aperto la barra
       sborda di 65 px, e il confine è a **735 px di altezza** (a 735 resta 0, a 730 torna vero).
       Se un giorno cade — voci di navigazione tolte, o questo viewport cambiato — il rosso che
       esce NON vuol dire «la cura è rotta»: vuol dire che la scena non si è formata e che questo
       ramo non sta provando niente. Per riformarla basta ABBASSARE la finestra, non allentare
       l'asserzione. */
    expect(inCima.scorrevole, `la scena non si è formata: la barra non sborda (${inCima.quantoResta} px nascosti) — NON è la cura che è rotta, è questa scena che non c'è: abbassa la finestra`).toBe(true);
    /* Lo sticky appiccica il piede al fondo dello scorritore in ENTRAMBE le posizioni: se una cura
       lo spostasse, sarebbe la cura sbagliata. */
    expect(inCima.scarto, `a scorrimento zero il piede non è al fondo: ${inCima.scarto} px`).toBe(0);
    expect(inFondo.scarto, `a fine corsa il piede non è al fondo: ${inFondo.scarto} px`).toBe(0);
    /* ⛔ E l'altezza: `flex-shrink` vale 1 qui, quindi il ramo che sborda è quello in cui il piede
       potrebbe venire schiacciato invece che spinto. Il confronto col ramo corto lo dice. */
    expect(inFondo.piedeAltezza, 'il piede si è schiacciato nel ramo che sborda').toBe(inCima.piedeAltezza);
    /*
     * ⛔ E QUI LO SPAZIO LIBERO NON C'È: la barra sborda, quindi il margine automatico deve valere
     *   ZERO — è il «no-op dimostrabile» che la review pretendeva. In TUTTE E DUE le posizioni si
     *   legge il margine calcolato; gli SPAZI fra i figli si leggono **solo a fine corsa**, e il
     *   perché vale una nota: a scorrimento zero il piede è APPICCIATO, quindi il suo rettangolo è
     *   traslato rispetto alla sua posizione nel flusso e lo «spazio» misurato è −65, cioè
     *   l'overflow, non un margine. Misurato: leggendo i rettangoli a scorrimento zero questa
     *   asserzione accusa un difetto che non c'è. A fine corsa il contenuto finisce esattamente al
     *   bordo, il piede non è più appiccato, e il rettangolo torna a dire la verità.
     */
    /* ⛔ E il terreno di paragone è la FINESTRA anche qui: la barra deve stare dentro lo schermo. La
       stessa mutazione che ha bocciato la versione precedente (`min-height: calc(100vh + 200px)`)
       manderebbe il piede fuori dalla vista dichiarandolo «in fondo alla barra». */
    for (const [dove, m] of [['a scorrimento zero', inCima], ['a fine corsa', inFondo]]) {
      expect(m.barraSotto, `${dove}: la barra esce dalla finestra (${m.barraSotto} su ${m.finestra})`).toBeLessThanOrEqual(m.finestra + 1);
      expect(m.paginaScorre, `${dove}: la pagina scorre — il guscio non dovrebbe avere uno scorrimento proprio`).toBe(false);
      expect(m.quanti, `${dove}: la barra non ha i ${FIGLI_NORMALI} figli che deve mostrare — ne ha ${m.quanti}`).toBe(FIGLI_NORMALI);
    }
    expect(inCima.margine, `a scorrimento zero il margine automatico non è zero in una barra che sborda (${inCima.margine})`).toBe('0px');
    expect(inFondo.margine, `a fine corsa il margine automatico non è zero in una barra che sborda (${inFondo.margine})`).toBe('0px');
    const sparsi = inFondo.spazi.filter((s) => Math.abs(s.spazio) > 1);
    expect(sparsi, `a fine corsa i figli della barra non sono appiccicati fra loro: ${JSON.stringify(sparsi)}`).toEqual([]);
  });
}

for (const tema of ['dark', 'light']) {
  /*
   * ── LA MODALITÀ A ICONE. La review ha misurato che il difetto c'era ANCHE qui (-853 → 0 a
   *    1440×1600), e nessun caso lo toccava: `:root[data-sidebar="icone"]` nasconde i figli del
   *    piede tranne l'avatar (`index.css:372`), quindi il piede cambia altezza e la geometria è
   *    un'altra. La si accende dalla porta vera: la preferenza che `syncSessionsToggle`
   *    (`app.js:1839-1843`) legge all'avvio, non l'attributo messo a mano dopo il montaggio.
   */
  test(`BC78-4c (1440x1600, ${tema}) — anche a barra compressa a icone il piede tocca il fondo`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1600 });
    await page.addInitScript(({ colorMode, larghezze }) => {
      if (window.top !== window) return;
      try {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
        localStorage.setItem('talos-harness-panel-widths', JSON.stringify(larghezze));
      } catch { /* storage negato: la app parte lo stesso */ }
    }, { colorMode: tema, larghezze: { sessionsCollapsed: true } });
    await page.goto('/');
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.waitForTimeout(250);
    /* La premessa: la barra deve essere DAVVERO a icone, o questa prova è una copia di 4a. */
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-sidebar')), 'la barra non si è compressa: la preferenza non è stata applicata, e la prova sarebbe una copia di BC78-4a').toBe('icone');
    const m = await page.evaluate(MISURA_PIEDE);
    console.log(`MISURA-BC78-4c icone 1440x1600 ${tema} = ${JSON.stringify(m)}`);
    expect(m.scorrevole, `la scena non si è formata: a icone la barra sborda di ${m.quantoResta} px`).toBe(false);
    pretendiBarraInColonna(m, `icone 1440x1600 ${tema}`, FIGLI_ICONE);
  });
}
