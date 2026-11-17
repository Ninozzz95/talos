/*
 * La carta di un artefatto in chat (0.2.1-ART, D2 e D3: bozzetto approvato dall'owner il 09/11/2026 19:55, variante A).
 *
 * La carta è sola: icona, titolo UNA volta, una riga sotto, «⋯». Un clic la apre nella scheda «A lato» della colonna destra
 * (`pannello/artefatto-a-lato.js`), nella cornice blindata di sempre; in chat non c'è più un'anteprima. L'errore sta SOTTO la carta,
 * dice che cosa è successo e ha «Riprova». «⋯» e il tasto destro danno le stesse cinque voci, complete da sole.
 * Mentre il modello scrive, la carta nasce «in attesa» («Sto creando…») e la riempie l'evento (`artefatto-attesa.js`).
 *
 * ⛔ Sicurezza, invariata: l'HTML resta dietro la sandbox, la CSP del server e il lasciapassare di sessione. Qui non si conserva
 *   HTML, né un percorso del disco, né un lasciapassare: ogni apertura ne chiede uno nuovo, al clic e mai alla nascita.
 *   «Copia» e «Scarica» leggono il testo dal server con la stessa strada del lettore (`lettore/fonti.js`): nessun ponte verso la
 *   cornice, che resta senza `allow-same-origin`.
 * Concorrenti letti nel codice (cloni in TALOS-RICERCHE/concorrenti): Hermes `apps/desktop/src/components/assistant-ui/
 *   artifact-card.tsx:98-104` (la carta è un bottone solo, il clic apre il «right-hand preview rail»), LibreChat
 *   `client/src/components/Artifacts/ArtifactButton.tsx:54-67` (un clic apre, un secondo chiude), Lobe
 *   `src/features/Portal/Artifacts/Title.tsx:38-70` (titolo e comandi in testa al pannello).
 */
import { t } from './lingua.js';
import { creaArtefatto } from './conversazione.js';
import { fonteDaLibreria, indirizzoDellaPagina } from './lettore/fonti.js';
import { erroreDalRifiuto } from './rifiuti-dei-file.js';
import { sanificaNomeFile, scaricaFile } from './codice-esporta.js';
import { creaMenuContestuale, apriMenuContestuale } from './schede.js';

const ID_LIBRERIA = /^lib-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* giro di sicurezza 5: nel guscio del PC la pagina sta sulla SUA origine (`lettore/fonti.js`, `indirizzoDellaPagina`); la forma si guarda sul percorso */
const SULLA_SUA_ORIGINE = /^http:\/\/[0-9a-f]{32}\.localhost:\d{1,5}(?=\/)/;
const assoluta = (indirizzo) => typeof indirizzo === 'string' && SULLA_SUA_ORIGINE.test(indirizzo);
function paginaValida(indirizzo) {
  if (assoluta(indirizzo)) return paginaValida(indirizzo.replace(SULLA_SUA_ORIGINE, ''));
  if (typeof indirizzo !== 'string' || !/^\/api\/v1\/pagine\/[A-Za-z0-9_-]{43}\/[^/?#]+$/.test(indirizzo)) return false;
  try {
    const nome = decodeURIComponent(indirizzo.split('/').at(-1));
    return nome !== '.' && nome !== '..' && !/[\\/:\x00-\x1f\x7f]/.test(nome);
  } catch { return false; }
}

/* 0.2.1-ART D1 (09/11/2026): il gettone che il guscio dell'app PC posa nella pagina a ogni caricamento (`desktop/finestra-artefatto.mjs`).
   Nel browser (remoto, 4174) non c'è e «Apri a parte» resta la scheda di sempre. */
const GETTONE_GUSCIO = /^[0-9a-f]{48}$/;
const gettoneDelGuscio = () => globalThis.__talosGuscioArtefatti?.gettone;

const MIME_HTML = 'text/html;charset=utf-8';
const ID_MENU = 'menuArtefatto';
/* un menu solo per tutte le carte della pagina: quello aperto adesso (come `blocchi/menu-del-blocco.js`) */
let menuAperto = null;

/** Una frase nostra, da mostrare com'è (come quelle di `erroreDalRifiuto`): le altre eccezioni non si leggono a schermo. */
const fraseNostra = (chiave) => Object.assign(new Error(t(chiave)), { frase: true });

/**
 * @param {object} o
 * @param {object|null} o.evento l'evento `ArtifactCreated` (`{id, titolo, voceLibreriaId?, versione?}`); `null` per una carta in attesa
 * @param {{tipo: 'creating'|'updating', titolo?: string}|null} [o.attesa] la carta nasce mentre il modello scrive; la riempie `riempi`
 * @param {object|null} [o.lato] il pannello «A lato» (`creaArtefattoALato`); senza, il clic apre a parte
 * @param {(testo: string) => unknown} [o.copia] scrive negli appunti
 * @param {(doc: Document, file: {nome: string, testo: string, mime: string}) => unknown} [o.scarica] salva il file
 * @param {(voceId: string) => void} [o.mostraInLibreria] apre la voce nella Libreria
 * @param {(testo: string) => void} [o.avvisa] la conferma di «Copia» e «Scarica» scelte dal menu
 */
export function creaCardArtefatto({ evento: eventoIniziale = null, sessionId, API = (p) => p,
  fetchFn = (...a) => globalThis.fetch(...a), apriFn = (...a) => globalThis.open(...a),
  ancoraValida = () => true, gettoneGuscio = gettoneDelGuscio, lato = null,
  copia = (testo) => globalThis.navigator.clipboard.writeText(testo), scarica = scaricaFile,
  mostraInLibreria = () => {}, avvisa = () => {}, attesa = null }, opzioni = {}) {
  const pezzi = creaArtefatto({ titolo: eventoIniziale?.titolo || attesa?.titolo || t('chat.artifact.badge') }, opzioni);
  const { card, box, carta, piu, titolo: nome, nota, errore, erroreForte, erroreDettaglio, riprova, scriviSotto } = pezzi;
  const doc = card.ownerDocument;
  const fin = doc.defaultView || globalThis;
  const viva = () => card.isConnected && ancoraValida();
  /* giro 5: la pagina per la cornice, sulla sua origine solo nel guscio del PC (il suo gettone, l app su 127.0.0.1) */
  const perLaCornice = (dati) => indirizzoDellaPagina(dati, fin, gettoneGuscio());

  let evento = null;
  /** La carta si può usare: ha il suo evento e il riferimento è buono. */
  let utilizzabile = false;
  /** Evento di prima della Libreria: la rotta viva `/api/v1/artifacts/<id>`, senza voce e senza lasciapassare. */
  let vecchia = false;
  let fonte = null;
  let occupata = false;
  let aperta = false;
  let apertura = Promise.resolve();
  let pronta = Promise.resolve();

  /* ---------------------------------------------------------------- l'errore, sotto la carta */
  let erroreDi = null;
  let ripeti = null;
  function mostraErrore(di, { forte, dettaglio = '', riprova: fai = null }) {
    erroreDi = di;
    ripeti = fai;
    erroreForte.textContent = forte;
    erroreDettaglio.textContent = dettaglio;
    riprova.hidden = !fai;
    errore.hidden = false;
  }
  /** Un gesto nuovo toglie l'errore di prima; quello di un riferimento non valido resta: riprovare non cambierebbe niente. */
  function nascondiErrore() {
    if (erroreDi === 'fisso') return;
    erroreDi = null;
    ripeti = null;
    errore.hidden = true;
  }
  function dettaglioDi(eccezione) {
    const grezzo = eccezione?.frase === true && typeof eccezione.message === 'string' && eccezione.message.trim()
      ? eccezione.message.trim() : t('chat.artifact.loadFailed');
    const frase = /[.!?…]$/u.test(grezzo) ? grezzo : `${grezzo}.`;
    return vecchia ? frase : t('chat.artifact.failedDetail', { messaggio: frase });
  }
  riprova.addEventListener('click', () => { const fai = ripeti; if (fai) void fai(); });

  /* ---------------------------------------------------------------- la riga sotto il titolo */
  let etichettaVersione = null;
  const segnoAperta = doc.createElement('span');
  segnoAperta.className = 'talos-artifact__aperta';
  segnoAperta.textContent = t('chat.artifact.asideOpen');
  function aggiornaSotto() {
    scriviSotto([t('chat.artifact.kindPage'), etichettaVersione, aperta ? segnoAperta : null]);
  }
  const sottoDelPannello = () => [t('chat.artifact.kindPage'), etichettaVersione?.textContent].filter(Boolean).join(' · ');

  /* ---------------------------------------------------------------- una richiesta alla volta */
  /** `fai` parte SUBITO, dentro il gesto (la finestra a parte si apre prima di ogni attesa); un secondo gesto mentre lavora non fa niente. */
  function lancia(fai) {
    if (occupata || !utilizzabile || !viva()) return apertura;
    occupata = true;
    nascondiErrore();
    apertura = (async () => { try { await fai(); } finally { occupata = false; } })();
    return apertura;
  }

  /** L'indirizzo da mettere nella cornice: un lasciapassare NUOVO a ogni apertura (la rotta viva per le carte vecchie). */
  async function risolvi(da = fonte) {
    if (vecchia) return API(`/api/v1/artifacts/${encodeURIComponent(evento.id)}`);
    const pagina = await da.creaPagina();
    if (!paginaValida(pagina)) throw fraseNostra('chat.artifact.pageReferenceInvalid');
    return assoluta(pagina) ? pagina : API(pagina);
  }

  /* ---------------------------------------------------------------- a lato */
  let totaleALato = null; // D-A2: quante versioni c'erano quando il pannello ha caricato «l'ultima»
  let giroALato = 0;
  function chiusaALato() {
    aperta = false;
    totaleALato = null;
    giroALato += 1;
    carta.setAttribute('aria-expanded', 'false');
    aggiornaSotto();
    /* «L'artefatto è aperto qui a lato» non è più vero */
    if (erroreDi === 'finestra' || erroreDi === 'caduta') nascondiErrore();
  }
  /* 0.2.2, giro di sicurezza 3 (N1): la pagina a lato è caduta di nuovo dopo la sua ricarica automatica (`anteprime-cadute.js`). Lo si dice
     sotto la carta, come ogni altro errore; «Riprova» è un gesto: chiede un lasciapassare nuovo e la rimette a lato, col conto a zero. */
  function cadutaALato() {
    if (viva()) mostraErrore('caduta', { forte: t('chat.artifact.pageNotLoaded'), riprova: () => lancia(mettiALato) });
  }
  function mostraNelPannello(indirizzo) {
    aperta = true;
    carta.setAttribute('aria-expanded', 'true');
    aggiornaSotto();
    totaleALato = mostraUltima && ultimeVersioni ? ultimeVersioni.length : null;
    /* giro di sicurezza 4 (C4): la ricarica automatica chiede un lasciapassare NUOVO per la stessa pagina (quello di prima può essere
       scaduto: 30 minuti dall'ultimo uso), dalla stessa fonte di adesso */
    const fonteQui = fonte;
    lato.apri({ origine: carta, titolo: nome.textContent, sotto: sottoDelPannello(), indirizzo,
      azioni: { apriAParte, copia: () => conIlTesto('copia', false), scarica: () => conIlTesto('scarica', false) }, chiusa: chiusaALato, caduta: cadutaALato,
      rinnova: () => risolvi(fonteQui) });
  }
  /** Chiede la pagina e la mette nel pannello. `true` se ora è aperta; un errore lo dice sotto la carta, con «Riprova». */
  async function mettiALato() {
    const mio = ++giroALato;
    try {
      const indirizzo = await risolvi();
      if (!viva() || mio !== giroALato) return false;
      mostraNelPannello(indirizzo);
      return true;
    } catch (eccezione) {
      if (viva()) mostraErrore('lato', { forte: t('chat.artifact.failedOpen'), dettaglio: dettaglioDi(eccezione), riprova: () => apriALato() });
      return false;
    }
  }
  /** «Apri a lato»: se è già aperta la porta davanti, non la richiude (quello lo fa il clic sulla carta). */
  function apriALato() {
    if (!lato) return apertura;
    if (aperta) { if (utilizzabile && viva()) lato.mostra(); return apertura; }
    return lancia(mettiALato);
  }

  /* ---------------------------------------------------------------- a parte */
  /** La finestra a parte non c'è: lo si dice sotto la carta e l'artefatto si apre qui a lato (se una colonna c'è). */
  async function finestraNonAperta(fai) {
    if (lato) {
      if (aperta) lato.mostra();
      else if (!(await mettiALato())) return;
    }
    if (!viva()) return;
    mostraErrore('finestra', { forte: t('chat.artifact.openFailed'), dettaglio: lato ? t('chat.artifact.openedAsideInstead') : '', riprova: fai });
  }
  const erroreAParte = (eccezione) => {
    if (viva()) mostraErrore('parte', { forte: t('chat.artifact.failedOpen'), dettaglio: dettaglioDi(eccezione), riprova: () => apriAParte() });
  };
  /* Nel browser la scheda si apre DENTRO il gesto, vuota e senza `opener`, e solo dopo riceve la pagina col lasciapassare nuovo:
     aprirla dopo l'attesa la farebbe bloccare. */
  async function aParteNelBrowser() {
    let scheda;
    const chiudiScheda = () => { try { scheda?.close(); } catch { /* la persona può averla già chiusa */ } };
    try {
      scheda = apriFn('about:blank', '_blank');
      if (!scheda) { await finestraNonAperta(() => apriAParte()); return; }
      scheda.opener = null; // prima di ogni attesa e di ogni documento non nostro
      const pagina = await fonte.creaPagina();
      if (!paginaValida(pagina)) throw fraseNostra('chat.artifact.pageReferenceInvalid');
      if (!viva() || scheda.closed) { chiudiScheda(); return; }
      scheda.location.replace(assoluta(pagina) ? pagina : API(pagina));
    } catch (eccezione) {
      chiudiScheda();
      erroreAParte(eccezione);
    }
  }
  /* 0.2.1-ART D1 (09/11/2026): nell'app PC il guscio nega ogni finestra nuova, `about:blank` compresa (main.mjs, `setWindowOpenHandler`).
     La carta rinnova il lasciapassare e chiede la finestra al guscio con la forma degli aggiornamenti (`talos-desktop://aggiornamenti`):
     il guscio nega l'indirizzo, controlla gettone e pagina, e apre lui una finestra chiusa (sandbox). */
  async function aParteNelGuscio(gettone) {
    try {
      const pagina = await fonte.creaPagina();
      if (!paginaValida(pagina)) throw fraseNostra('chat.artifact.pageReferenceInvalid');
      if (!viva()) return;
      apriFn(`talos-desktop://artefatto?gettone=${gettone}&pagina=${encodeURIComponent(pagina)}`, '_blank');
    } catch (eccezione) {
      erroreAParte(eccezione);
    }
  }
  function apriAParte() {
    return lancia(() => {
      const gettone = gettoneGuscio();
      const nelGuscio = typeof gettone === 'string' && GETTONE_GUSCIO.test(gettone);
      /* una carta vecchia vive sulla rotta col cookie: nel browser è una scheda qualunque; il guscio apre solo pagine col
         lasciapassare, quindi lì la finestra non c'è e riprovare non cambierebbe niente */
      if (vecchia) return nelGuscio ? finestraNonAperta(null) : void apriFn(API(`/api/v1/artifacts/${encodeURIComponent(evento.id)}`), '_blank', 'noopener');
      return nelGuscio ? aParteNelGuscio(gettone) : aParteNelBrowser();
    });
  }

  /* ---------------------------------------------------------------- copia e scarica */
  async function leggiTesto() {
    if (!vecchia) return new TextDecoder().decode(await fonte.leggiByte());
    const risposta = await fetchFn(API(`/api/v1/artifacts/${encodeURIComponent(evento.id)}`), { credentials: 'same-origin' });
    if (!risposta.ok) throw await erroreDalRifiuto(risposta);
    return risposta.text();
  }
  function nomeDelFile() {
    const base = sanificaNomeFile(nome.textContent) ?? t('chat.artifact.badge');
    return /\.html?$/iu.test(base) ? base : `${base}.html`;
  }
  const USI = {
    copia: { fai: (testo) => copia(testo), fallita: 'chat.artifact.failedCopy', fatto: 'chat.common.copied' },
    scarica: { fai: (testo) => scarica(doc, { nome: nomeDelFile(), testo, mime: MIME_HTML }), fallita: 'chat.artifact.failedDownload', fatto: 'chat.artifact.downloaded' },
  };
  /** «Copia» o «Scarica». `true` se è riuscita. Dal menu la conferma è un avviso; dal pannello la scrive il pulsante. */
  async function conIlTesto(quale, dalMenu) {
    if (!utilizzabile || !viva()) return false;
    const uso = USI[quale];
    const ancora = () => conIlTesto(quale, dalMenu);
    nascondiErrore();
    let testo;
    try { testo = await leggiTesto(); } catch (eccezione) {
      if (viva()) mostraErrore(quale, { forte: t(uso.fallita), dettaglio: dettaglioDi(eccezione), riprova: ancora });
      return false;
    }
    if (!viva()) return false;
    /* qui il testo c'è: se non parte è il sistema (appunti negati, salvataggio rifiutato), e la Libreria non c'entra */
    try { await uso.fai(testo); } catch {
      if (viva()) mostraErrore(quale, { forte: t(uso.fallita), riprova: ancora });
      return false;
    }
    if (dalMenu) avvisa(t(uso.fatto));
    return true;
  }

  /* ---------------------------------------------------------------- il menu «⋯» (e il tasto destro) */
  const io = { piu, chiudi: chiudiMenu };
  function apriMenu(punto, dove = 'prima') {
    if (!utilizzabile || !viva() || !doc.body) return;
    if (menuAperto && menuAperto !== io) menuAperto.chiudi(false);
    const menu = creaMenuContestuale(doc.body, { id: ID_MENU, etichetta: t('chat.artifact.menuLabel') });
    menu.setAttribute('aria-label', t('chat.artifact.menuLabel'));
    preparaUnaVolta(menu, fin);
    menuAperto = io;
    piu.setAttribute('aria-expanded', 'true');
    const r = piu.getBoundingClientRect?.() ?? { right: 0, bottom: 0, top: 0 };
    const misure = { innerWidth: Number.isFinite(fin.innerWidth) ? fin.innerWidth : Infinity, innerHeight: Number.isFinite(fin.innerHeight) ? fin.innerHeight : Infinity };
    apriMenuContestuale(menu, {
      voci: [
        [t('chat.artifact.openAside'), () => { void apriALato(); }, Boolean(lato), '', { icona: 'i-panel-right' }],
        [t('chat.artifact.openSeparately'), () => { void apriAParte(); }, true, '', { icona: 'i-external-link' }],
        [t('chat.common.copy'), () => { void conIlTesto('copia', true); }, true, '', { icona: 'i-copy' }],
        [t('chat.artifact.download'), () => { void conIlTesto('scarica', true); }, true, '', { icona: 'i-download' }],
        [t('chat.artifact.showInLibrary'), () => { if (viva()) mostraInLibreria(evento.voceLibreriaId); }, !vecchia, '', { icona: 'i-library' }],
      ],
      x: 0, y: 0, finestra: misure,
      /* scelta una voce il fuoco torna su «⋯» PRIMA dell'azione: la voce sparisce col menu e il fuoco non resta nel vuoto */
      chiudi: () => chiudiMenu(true),
    });
    /* un array, non la NodeList: nel browser vero `querySelectorAll` non ha `at`, e l'eccezione lasciava il menu nell'angolo, senza separatore */
    const tasti = [...menu.querySelectorAll('[role="menuitem"]')];
    const separatore = doc.createElement('div');
    separatore.className = 'talos-context-menu__sep';
    separatore.setAttribute('role', 'separator');
    tasti.at(-1)?.before(separatore);
    /* si misura DOPO aver riempito; sotto «⋯» se c'è posto, altrimenti sopra; col tasto destro l'angolo è il puntatore; mai fuori */
    const w = menu.offsetWidth || 240;
    const h = menu.offsetHeight || 200;
    const px = Number.isFinite(punto?.x) ? punto.x : r.right - w;
    let py = Number.isFinite(punto?.y) ? punto.y : r.bottom + 6;
    if (py + h + 8 > misure.innerHeight) py = (Number.isFinite(punto?.y) ? punto.y : (r.top ?? 0) - 6) - h;
    menu.style.left = `${Math.max(8, Math.min(px, misure.innerWidth - w - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(py, misure.innerHeight - h - 8))}px`;
    if (dove === 'ultima') [...tasti].reverse().find((b) => !b.disabled)?.focus({ preventScroll: true });
  }
  function chiudiMenu(rifocalizza = false) {
    if (menuAperto !== io) return;
    menuAperto = null;
    piu.setAttribute('aria-expanded', 'false');
    const menu = doc.body?.querySelector(`#${ID_MENU}`);
    if (menu) { menu.hidden = true; menu.replaceChildren(); }
    if (rifocalizza && piu.isConnected) piu.focus({ preventScroll: true });
  }
  piu.addEventListener('click', () => { if (menuAperto === io) chiudiMenu(true); else apriMenu(); });
  piu.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    ev.preventDefault();
    apriMenu(undefined, ev.key === 'ArrowUp' ? 'ultima' : 'prima');
  });
  box.addEventListener('contextmenu', (ev) => {
    if (!utilizzabile || !viva()) return;
    ev.preventDefault();
    /* senza fermarlo il tasto destro saliva fino alla risposta che tiene la carta e apriva ANCHE il suo menu («Riprova» / «Elimina la
       risposta»): due menu insieme (foto del 09/11/2026). Come le righe dei file della chat (`app.js`, cura del 25/10). */
    ev.stopPropagation();
    apriMenu({ x: ev.clientX, y: ev.clientY });
  });

  /* ---------------------------------------------------------------- il clic sulla carta */
  carta.addEventListener('click', () => {
    if (!utilizzabile || !viva()) return;
    if (!lato) { void apriAParte(); return; }
    if (aperta) { lato.chiudi(); return; }
    void apriALato();
  });

  /*
   * ⭐ 24/10/2026 — ARTEFATTI CON VERSIONI (owner: «la carta di ogni giro resta sulla sua versione», bozzetto approvato).
   *   `evento.versione` è la versione che QUESTO giro ha fatto: la carta la mostra sempre, con «vN di M» nella riga sotto il titolo.
   *   Se poi ne è nata una più nuova, un riquadro sotto la carta lo dice («Aggiornato poi in …») e «Mostra l'ultima» cambia ciò che
   *   il pannello, «Copia» e «Scarica» usano (e riporta indietro). Quante versioni ci sono lo dice la Libreria; quando un'altra carta
   *   della stessa voce nasce in questa pagina, le sorelle rileggono il conto (`talos:artefatto-versione`).
   */
  let versioneDelGiro = null;
  let avviso = null;
  let mostraUltima = false;
  let fonteUltima = null;
  let fonteDelGiro = null;
  /* ⛔ Revisione a blocco 4 (24/10/2026, REV4-ART-1, S3): il gestore di «Mostra l'ultima» nasce UNA volta, alla prima `disegnaVersioni`,
     e chiudeva sull'elenco di allora: con una versione nata prima del clic ridisegnava «v5 di 5 · ultima» mentre la pagina era la v6.
     Il clic legge l'elenco dell'ULTIMO disegno, come il selettore di LibreChat (`Artifacts.tsx:598-606`) legge `orderedArtifactIds`
     del disegno corrente. */
  let ultimeVersioni = null;
  function disegnaVersioni(versioni) {
    if (!versioneDelGiro || !Array.isArray(versioni) || !versioni.length) return;
    ultimeVersioni = versioni;
    const totale = versioni.length;
    const ultima = versioni[totale - 1];
    const vista = mostraUltima ? totale : versioneDelGiro;
    if (!etichettaVersione) {
      etichettaVersione = doc.createElement('span');
      etichettaVersione.className = 'talos-artifact__versione';
    }
    etichettaVersione.textContent = vista === totale ? t('chat.artifact.versionLatest', { n: vista, total: totale }) : t('chat.artifact.version', { n: vista, total: totale });
    if (vista === totale) etichettaVersione.setAttribute('data-ultima', ''); else etichettaVersione.removeAttribute('data-ultima');
    aggiornaSotto();
    if (aperta) lato.sottotitolo(carta, sottoDelPannello());
    /* ⛔ Revisione a blocco 3 (24/10/2026, D-A2, S3): su «Mostra l'ultima», quando una sorella annunciava una versione più nuova,
       l'etichetta diceva «v4» e la pagina mostrata era ancora la v3. Se l'ultima è cambiata da quando il pannello l'ha caricata, si
       ricarica; col pannello chiuso non c'è niente da ricaricare (alla prossima apertura il lasciapassare è nuovo). */
    if (mostraUltima && aperta && totaleALato !== totale) void mettiALato();
    if (versioneDelGiro >= totale) { avviso?.remove(); avviso = null; return; }
    if (!avviso) {
      avviso = doc.createElement('div');
      avviso.className = 'talos-artifact__avviso';
      avviso.setAttribute('role', 'status');
      const testo = doc.createElement('span');
      testo.className = 'talos-grow';
      const azione = doc.createElement('button');
      azione.type = 'button';
      azione.className = 'talos-button talos-button--ghost talos-button--sm';
      azione.dataset.artefattoUltima = '';
      azione.addEventListener('click', () => {
        if (!utilizzabile || !viva()) return;
        mostraUltima = !mostraUltima;
        fonteUltima ??= fonteDaLibreria({ sessionId, voce: { id: evento.voceLibreriaId }, fetchFn: (percorso, init) => fetchFn(API(percorso), init), perLaCornice });
        fonte = mostraUltima ? fonteUltima : fonteDelGiro;
        /* l'ultima la ricarica `disegnaVersioni` (un posto solo, così ricarica anche quando ne nasce una nuova); la sua si ricarica qui */
        totaleALato = null;
        if (!mostraUltima && aperta) void mettiALato();
        disegnaVersioni(ultimeVersioni); // REV4-ART-1: l'elenco dell'ultimo disegno, non quello della prima chiamata
      });
      avviso.append(testo, azione);
      nota.before(avviso);
    }
    const [testo, azione] = avviso.children;
    testo.textContent = mostraUltima
      ? t('chat.artifact.showingLatest', { total: totale, n: versioneDelGiro })
      : (ultima?.sessionNome ? t('chat.artifact.updatedLaterIn', { chat: ultima.sessionNome, total: totale }) : t('chat.artifact.updatedLater', { total: totale }));
    azione.textContent = mostraUltima ? t('chat.artifact.backToVersion', { n: versioneDelGiro }) : t('chat.artifact.showLatest');
  }
  async function rileggiVersioni() {
    if (!versioneDelGiro) return;
    try {
      const r = await fetchFn(API(`/api/v1/sessions/${encodeURIComponent(sessionId)}/library/${encodeURIComponent(evento.voceLibreriaId)}/versions`), { credentials: 'same-origin' });
      if (!r.ok || !viva()) return;
      const dati = await r.json();
      if (viva()) disegnaVersioni(dati?.data?.versioni);
    } catch { /* l'etichetta è un di più: senza, la carta resta sulla sua versione */ }
  }
  const sorella = (e) => {
    if (!card.isConnected) { doc.removeEventListener('talos:artefatto-versione', sorella); return; }
    if (e?.detail?.voceLibreriaId === evento.voceLibreriaId && e.detail.versione !== versioneDelGiro) void rileggiVersioni();
  };

  /* ---------------------------------------------------------------- la carta prende il suo artefatto */
  /** Il riferimento non è buono: lo si dice e la carta resta spenta. Niente ripiego: mostrerebbe una copia che non c'entra. */
  function spegni(chiave) {
    carta.setAttribute('aria-disabled', 'true');
    piu.hidden = true;
    mostraErrore('fisso', { forte: t('chat.artifact.failedOpen'), dettaglio: `${t(chiave)}.` });
  }
  function riempi(nuovo) {
    if (evento || !nuovo || typeof nuovo !== 'object') return;
    evento = nuovo;
    nome.textContent = evento.titolo || t('chat.artifact.badge');
    carta.removeAttribute('aria-busy');
    aggiornaSotto();
    if (Object.hasOwn(evento, 'voceLibreriaId')) {
      if (typeof evento.voceLibreriaId !== 'string' || !ID_LIBRERIA.test(evento.voceLibreriaId) || typeof sessionId !== 'string' || !sessionId) {
        spegni('chat.artifact.savedReferenceInvalid');
        return;
      }
      versioneDelGiro = Number.isSafeInteger(evento.versione) && evento.versione >= 1 ? evento.versione : null;
      fonteDelGiro = fonteDaLibreria({ sessionId, voce: { id: evento.voceLibreriaId }, ...(versioneDelGiro ? { versione: versioneDelGiro } : {}),
        fetchFn: (percorso, init) => fetchFn(API(percorso), init), perLaCornice });
      fonte = fonteDelGiro;
    } else {
      if (typeof evento.id !== 'string' || !evento.id) { spegni('chat.artifact.previewReferenceInvalid'); return; }
      /* i diari vecchi non hanno un legame esatto con la Libreria: non si indovina dal titolo, e lo si dice */
      vecchia = true;
      nota.textContent = t('chat.artifact.temporary');
      nota.hidden = false;
    }
    piu.hidden = false;
    utilizzabile = true;
    if (!versioneDelGiro) return;
    doc.addEventListener('talos:artefatto-versione', sorella);
    pronta = (async () => {
      /* chi crea la carta la mette nella pagina subito dopo: le versioni si chiedono a carta inserita */
      await Promise.resolve();
      if (!viva()) return;
      void rileggiVersioni();
      doc.dispatchEvent(new (doc.defaultView?.CustomEvent ?? CustomEvent)('talos:artefatto-versione', { detail: { voceLibreriaId: evento.voceLibreriaId, versione: versioneDelGiro } }));
    })();
  }

  if (eventoIniziale) riempi(eventoIniziale);
  else {
    /* in attesa: lo stato dell'attrezzo vive qui, non in una riga sopra la carta */
    carta.setAttribute('aria-busy', 'true');
    piu.hidden = true;
    scriviSotto([t(attesa?.tipo === 'updating' ? 'chat.artifact.updating' : 'chat.artifact.creating')], { ruota: true });
  }

  return {
    card, carta, piu, stato: errore,
    get pronta() { return pronta; },
    get apertura() { return apertura; },
    azioni: { apriALato, apriAParte, copia: () => conIlTesto('copia', true), scarica: () => conIlTesto('scarica', true),
      mostraInLibreria: () => { if (utilizzabile && !vecchia && viva()) mostraInLibreria(evento.voceLibreriaId); } },
    riempi,
    /** Il titolo che arriva mentre il modello scrive (`artefatto-attesa.js`); a carta riempita vale quello dell'evento. */
    titolo(testo) { if (!evento && typeof testo === 'string' && testo.trim()) nome.textContent = testo.trim(); },
  };
}

/* gli ascoltatori del menu condiviso, una volta per documento: valgono per la carta che l'ha aperto adesso (`menuAperto`) */
const preparati = new WeakSet();
function preparaUnaVolta(menu, fin) {
  const doc = menu.ownerDocument;
  if (!preparati.has(doc)) {
    preparati.add(doc);
    const attuale = () => doc.body?.querySelector?.(`#${ID_MENU}`) ?? null;
    doc.addEventListener?.('pointerdown', (ev) => {
      if (!menuAperto) return;
      /* la carta non è più nella pagina (chat ridisegnata, conversazione cambiata): il suo menu non resta a galla */
      if (!menuAperto.piu.isConnected) { menuAperto.chiudi(false); return; }
      const dove = ev.target;
      if (attuale()?.contains(dove) || menuAperto.piu.contains(dove)) return;
      menuAperto.chiudi(false);
    }, true);
    /* Esc chiude il menu e basta: in cattura, e non risale, così sotto non si chiude anche la colonna o una vista */
    doc.addEventListener?.('keydown', (ev) => {
      if (!menuAperto || ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      menuAperto.chiudi(true);
    }, true);
    /* uno scorrimento qualunque (in cattura: anche la chat, che scorre da sé) stacca «⋯» dal menu ⇒ si chiude; dentro il menu no */
    doc.addEventListener?.('scroll', (ev) => {
      if (menuAperto && !attuale()?.contains(ev.target)) menuAperto.chiudi(false);
    }, true);
  }
  if (fin && !preparati.has(fin)) {
    preparati.add(fin);
    fin.addEventListener?.('resize', () => { menuAperto?.chiudi(false); });
  }
  if (menu.dataset.artefattoPronto) return;
  menu.dataset.artefattoPronto = '1';
  /* tastiera del WAI-ARIA APG «Menu and Menubar Pattern» (letto il 05/11/2026 per `menu-del-blocco.js`): le frecce girano, Home e
     Fine vanno agli estremi, Tab chiude e rimette il fuoco su «⋯» */
  menu.addEventListener('keydown', (ev) => {
    if (!menuAperto) return;
    const elenco = [...menu.querySelectorAll('[role="menuitem"]')].filter((b) => !b.disabled);
    if (!elenco.length) return;
    const i = elenco.indexOf(doc.activeElement);
    const vai = (j) => { ev.preventDefault(); elenco[(j + elenco.length) % elenco.length].focus({ preventScroll: true }); };
    if (ev.key === 'ArrowDown') vai(i + 1);
    else if (ev.key === 'ArrowUp') vai(i < 0 ? elenco.length - 1 : i - 1);
    else if (ev.key === 'Home') vai(0);
    else if (ev.key === 'End') vai(elenco.length - 1);
    else if (ev.key === 'Tab') menuAperto.chiudi(true);
  });
}
