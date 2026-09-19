/*
 * scheda-modello.js — LA PAGINA DEL MODELLO (corsia 4, 18/09/2026).
 *
 * La pagina a schermo intero di un modello locale: tre schede — la scheda di Hugging Face col
 * README, i FILE del modello con la verifica dell'impronta, la COMPATIBILITÀ con la memoria di
 * questa macchina. Nasce dal disegno del prototipo `prototypes/calm-lab/src/model-page.mjs:1-92`,
 * ADATTATO al design system che il prodotto ha già: la struttura è quella del prototipo, il
 * linguaggio visivo è `talos-*`. Nessun foglio nuovo, nessuna classe nuova, nessun `<style>`
 * iniettato (il cancello statico `scripts/cancello/statico.mjs` legge solo `index.css` e
 * `foglio-monolite.css`: ogni classe nuova comparirebbe come sospetta, e non c'è precedente di
 * componenti che si portano dietro il proprio CSS).
 *
 * ⛔ NON È UN SECONDO MOTORE DI NIENTE — qui si RIUSA quello che il progetto ha già:
 *   · le linguette: `creaSchede` di `./schede.js` (roving tabindex, frecce che ciclano, Home/End,
 *     `aria-selected`, `aria-controls` + `role=tabpanel`). BC-63/BC-68 hanno unificato TRE
 *     implementazioni di schede in una: scriverne una quarta sarebbe la stessa malattia.
 *   · il Markdown: `renderizzaMarkdown` di `./markdown.js` (BC-29);
 *   · i recinti di codice: `creaBloccoCodice` di `./conversazione.js` (barra del linguaggio,
 *     «Copia», evidenziazione se Prism c'è — e senza Prism degrada da solo: `globalThis.Prism?.`);
 *   · le icone: `icona` di `./sezione-elenco-dettaglio.js`;
 *   · i numeri: `gb`/`contestoK`/`STATI_INSTALLATO`/`datiModelloInstallato` di
 *     `./modelli-installati.js` — le stesse parole e le stesse cifre della lista «Installati»;   · la misura della macchina: `datiMemoria` di `./misura-memoria.js` (la card della memoria del
 *     Model Lab legge gli stessi campi: una sola lettura di `/api/v1/model-lab/capacity`). ⛔ Le sue
 *     righe NON ripetono quelle del verdetto: nella stessa schermata due righe con lo stesso nome e
 *     due numeri diversi sono la trappola delle «due misure che non tornano». E i byte si scrivono
 *     sempre con `gb` — un secondo formattatore in GB sarebbe una seconda unità di misura. Per la
 *     stessa ragione i conteggi di token dei FATTI passano da `contestoK`: `32768` accanto a
 *     `32k token` nella stessa card è la stessa grandezza scritta in due modi.
 *   · i fatti dell'ispezione si mostrano con la loro PROVENIENZA (`osservato` dal runtime,
 *     `dichiarato` dal file): un fatto che il runtime non ha visto resta «Sconosciuto», non diventa
 *     un «No». Se ne occupano `testoFatto` e `provenienzaFatto` di questo file.
 *
 * ⛔ DA DOVE VENGONO I DATI (misurati il 18/09/2026, non dedotti):
 *   · `GET /api/v1/local-models` → `{items:[manifest]}`; il manifest porta
 *     `id/repo/revision/files[]/bytes/sha256/license/path/state` (+`name` se rinominato) e
 *     `files:[{path,bytes,sha256}]`. È la verità LOCALE (cosa c'è sul disco).
 *   · `GET /api/v1/local-models/:id/fit?profile=agent[&contextTokens=N]` → verdetto + misure.
 *     Accetta SOLO `profile` e `contextTokens`: qualunque altro parametro è `QUERY_INVALID`.
 *     Contesto 65536 di serie per `profile='agent'` (`local-runtime-probe.mjs:239`).
 *     `state ∈ unknown|blocked|chat-only|compatible|tight`, `reason ∈ measurement|storage|memory|
 *     context|capabilities|template|fits`. Attorno al verdetto c'è `inspection` — i fatti osservati
 *     (contesto, template, capacità, backend) con la loro provenienza `declared|observed|unknown`.
 *   · `GET /api/v1/huggingface/repo?repo=…&revision=…` → README, licenza, revisione, immagini e
 *     `files:[{path,sizeBytes,sha256}]`. È la verità del REPOSITORY. ⛔ `files[]` arriva solo se si
 *     passa `revision` (`app.js:3800` fa esattamente così): senza, la verifica dei file sarebbe
 *     «non confrontabile» per colpa nostra.
 *   · `GET /api/v1/model-lab/capacity` → RAM e disco della macchina.
 *
 * ⛔ LE DUE GRANDEZZE CHE SI CHIAMANO UGUALI E NON LO SONO (trappola documentata del progetto):
 *   `fit.memory.availableBytes` è la **RAM libera** (`machine.memory.freeBytes`), mentre
 *   `fit.storage.availableBytes` è lo **spazio allocabile sul disco**
 *   (`machine.storage.allocatableBytes` — `local-runtime-probe.mjs:251-252`). In pagina le due
 *   righe si chiamano «RAM libera» e «Spazio allocabile sul disco», e c'è una nota che lo dice:
 *   un verdetto di memoria non si legge col disco.
 *
 * Ricerca fatta PRIMA di scrivere (regola zero), 18/09/2026:
 *   · `developer.mozilla.org` + W3C APG «Meter Pattern» — `<meter>` per una grandezza dentro un
 *     intervallo noto (RAM, disco), `<progress>` per il completamento di un compito: scambiarli è
 *     l'errore più comune di questo pattern, e sugli screen reader si sente. ⇒ si usa `<meter>`,
 *     come fa già `misura-memoria.js:18`; **non** si ridichiara `aria-valuenow` su un `<meter>`
 *     nativo (seconda fonte di verità), ma l'`aria-label` è obbligatorio, e il valore deve esistere
 *     anche come TESTO visibile (in modalità a contrasto forzato il disegno della barra sparisce).
 *   · in-page TOC: `scroll-margin-top` sui bersagli, `scroll-behavior: smooth` solo sotto
 *     `@media (prefers-reduced-motion: no-preference)`, e fuoco sul titolo di destinazione per chi
 *     naviga da tastiera — è la pratica chiesta da MDN e ripresa dalle guide di accessibilità
 *     (letto 18/09/2026).
 *   · impronta troncata: si mostrano TESTA e CODA (`abcdef12…34567890`) e il valore intero resta
 *     nel `title` e dietro il pulsante di copia; una troncatura a una sola estremità è la forma che
 *     le librerie di componenti hanno abbandonato (Dataverse #5210 / PR #7312, Firefox bug
 *     1340265, Spectrum Web Components `<sp-truncated>` — letti il 18/09/2026).
 *   · verdetto di memoria: la barra richiesto/disponibile con la soglia d'allarme al 90% è la forma
 *     con cui il banco di misura confronta pesi e cache KV con la memoria della macchina (Unsloth
 *     PR #7880; KolosalAI model-memory-calculator; letti il 18/09/2026). Qui NON si stima niente:
 *     i numeri arrivano dal server, la barra li rende leggibili.
 *
 * ⛔ QUELLO CHE QUESTA PAGINA NON FA, E PERCHÉ (elenco secco, referto alla mano):
 *   · il pulsante «preferito» del prototipo, «Banco prova», «Usa per le nuove chat»: nel prodotto
 *     non esiste né un archivio dei preferiti, né una rotta che imposti il modello delle nuove
 *     chat, né un banco di prova legato a un modello ⇒ NON disegnati, elencati (FASE 5, corsia E);
 *   · `parametersB`/`family`/`architecture`/`activities` del prototipo (`MODEL_SOURCES` è una
 *     fixture) ⇒ non esistono in nessuna risposta del server;
 *   · la GPU/VRAM: `/api/v1/model-lab/capacity` non ha un campo GPU (verificato
 *     `machine-capacity.mjs:57-65`) ⇒ il pannello «Compatibilità» non la nomina.
 *
 * ⭐ 19/09/2026 — IL DISEGNO DEL MOCKUP (`TALOS-Calm-Lab-04.html`, pagina
 *   `#/impostazioni/modelli/scheda/local%3Aqwen8/<card|files|compatibility>`), misurato dal suo DOM
 *   VIVO il 19/09/2026. Quello che il mockup ha, e che questa pagina ora porta:
 *   · **toolbar** (`.model-page-toolbar`, 1122×67): «← Tutti i modelli» | il NOME + la parola
 *     dell'origine | due azioni a destra;
 *   · **hero** (`.model-hero`, 1122×193, `grid-template-columns:1fr auto`): riquadro del glifo
 *     **70×70** arrotondato 18px, soprattitolo «NEL TUO LABORATORIO», titolo **40px / peso 550 /
 *     lettere −1,8px**, riga del repository, e la frase «Conosci il modello. Scegli come usarlo.»;
 *   · **striscia di contesto** (`.model-context-strip`, 1122×75): **quattro** blocchi separati da
 *     filetti, ognuno `small` + `strong`;
 *   · **linguette** con la nota a destra (`.model-page-tab-note`) e la chiusura di pagina.
 *   ⛔ Le due frasi del mockup («Nel tuo laboratorio», «Conosci il modello. Scegli come usarlo.»)
 *     sono COPY del mockup, portate parola per parola: non sono dati e non vengono da una risposta
 *     del server.
 *   ⛔ E IL VESTITO NON C'È ANCORA, E LO DICO: le classi del mockup (`.model-*`) non hanno regole in
 *     `src/styles/` (misurato il 19/09/2026: **zero** occorrenze di `.model-page`, `.model-hero`,
 *     `.model-context-strip`, `.model-glyph` nei fogli di prodotto). La misura e le regole da
 *     aggiungere stanno nel referto della corsia E, che è la richiesta; qui ogni elemento del mockup
 *     porta la SUA classe **e**, accanto, la classe di prodotto che oggi gli dà una forma
 *     (`talos-toolbar`, `talos-page__head`, `talos-badge`…): il giorno in cui il foglio arriva, la
 *     classe del mockup comanda e la seconda si toglie.
 *
 * ⭐ 19/09/2026 — UN REPOSITORY CHE NON È INSTALLATO (richiesta dell'orchestratore: la lista
 *   Hugging Face apre una PAGINA, e non ogni riga ha un modello sul disco). La forma accettata è
 *   **`hf:<repo>`**, con la revisione facoltativa (`hf:<repo>@<revisione>`), passata come `id`:
 *   la rotta `#/impostazioni/modelli/scheda/<id>/<scheda>` porta **un id solo**, e un collegamento
 *   incollato o una ricarica devono riaprire la stessa pagina senza altro stato. La seconda forma è
 *   l'opzione di montaggio `repo` (`{repo, revision}`), per chi ha già l'oggetto in mano.
 *   In quello stato: la scheda Hugging Face è quella VERA (il README arriva dal repository), i file
 *   sono quelli del repository — **non scaricati**, e lo dicono — e la compatibilità **non finge
 *   una verifica**: la stima di memoria vuole il file sul disco.
 *
 * ⭐ 19/09/2026 — LE IMMAGINI DELLA SCHEDA, E IL CONSENSO (owner, 19/09/2026: «1 a ma con switch»).
 *   ⛔ MISURATO PRIMA DI SCRIVERE, e la misura sposta il punto di applicazione: il server
 *     (`hf-hub-client.mjs:14-37`) **toglie già** dal README ogni `<img>` e ogni `![](…)`, e li
 *     restituisce a parte in `images[]` (`resolve()` accetta solo `https:` e riscrive i percorsi
 *     relativi su `huggingface.co`). Misurato il 19/09/2026 su `unsloth/GLM-4.7-Flash-GGUF`:
 *     README di 8.146 byte con **0** `<img>` e **0** `![`, e **3** immagini in `images[]`
 *     (`github.com`, `raw.githubusercontent.com`). ⇒ Non è il TESTO a poter chiamare casa: è il
 *     momento in cui QUESTA pagina disegna quelle immagini. Quindi il consenso sta qui.
 *   ⇒ Di serie **non si disegna nessuna immagine**: si dice quante sono e da quali host arrivano,
 *     con un comando per mostrarle ADESSO e una preferenza che resta (`CAMPO_IMMAGINI_REMOTE`).
 *     Le due vie si provano contando le richieste (zero a interruttore spento).
 *   ⛔⛔ E LE IMMAGINI NON SI CHIEDONO AL SITO ESTERNO, SI CHIEDONO AL NOSTRO SERVER — misurato il
 *     19/09/2026, e sono due fatti che insieme decidono il disegno:
 *       1. **la CSP del prodotto NON lo permetterebbe**: `img-src 'self' data:` (`http-app.mjs:572`).
 *          Un `<img src="https://github.com/…">` non parte nemmeno — quindi un interruttore che
 *          promette «accendilo e le immagini arrivano» sarebbe una bugia;
 *       2. **la rotta che serve le immagini c'è già**: `GET /api/v1/huggingface/image?url=…`
 *          (`http-app.mjs:5533`), che le passa da `fetchAllowedHfImage` (`src/hf-image-proxy.mjs`):
 *          solo `https:`, solo host `huggingface.co`/`hf.co` (e i loro sottodomini), risoluzione DNS
 *          con rifiuto degli indirizzi privati (SSRF), i salti rivalidati uno per uno, solo
 *          `png/jpeg/webp/gif/avif`, tetto a 4 MiB e 15 s. E `app.js:3678` la usa già così:
 *          `element.src = API('/api/v1/huggingface/image?url=…')`.
 *     ⇒ Questa pagina fa **la stessa cosa**: chiede le immagini al PROPRIO server, che è l'unico che
 *       parla col sito esterno — e l'indirizzo di chi legge non arriva a terzi. L'interruttore
 *       decide se la richiesta parte, non da chi.
 *   ⛔ CONSEGUENZA DICHIARATA, misurata sulla scheda vera di `unsloth/GLM-4.7-Flash-GGUF`: le sue
 *     **tre** immagini stanno su `github.com` e `raw.githubusercontent.com`, e il proxy quei due
 *     host li RIFIUTA (`HF_IMAGE_HOST_REJECTED`) — quindi quelle tre non si vedranno mai, e la
 *     pagina lo dice con la frase che il prodotto usa già («Immagine della scheda non
 *     disponibile.»). Non è un difetto di questa pagina: è il perimetro del proxy, ed è la ragione
 *     per cui si CONTA quello che si può mostrare invece di promettere che si vedrà tutto.
 *   ⛔ `referrerpolicy="no-referrer"` resta lo stesso, in minuscolo, anche se con il proxy la
 *     richiesta è verso il nostro server e il referrer non arriverebbe a terzi: è la cintura per il
 *     giorno in cui qualcuno tornasse a puntare un `<img>` a un indirizzo esterno, e costa un
 *     attributo (letto il 19/09/2026: <https://www.php.cn/faq/2971847.html> ·
 *     <https://zeriflow.com/blog/referrer-policy-explained-control-data-leakage>).
 *     Le fonti del brief: il Markdown con le immagini è una richiesta di rete, non un asset
 *     incorporato (<https://dev.to/mdfold/markdown-images-are-network-requests-not-embedded-assets-5580>),
 *     lista di schemi e host ammessi, `data:`/`src=""` trattati con sospetto
 *     (<https://tanstack.com/markdown/latest/docs/core-concepts/security> ·
 *      <https://deepwiki.com/vercel/streamdown/3.10-security-and-sanitization>).
 *   ⛔ IL MODELLO È QUELLO DELLE APP DI POSTA, cercato il 19/09/2026 — blocco di serie, un comando
 *     per il caso singolo, una scelta che resta per chi vuole sempre: Thunderbird e Gmail
 *     («Load images» + «always from this sender»), Postbox, le tre opzioni di Fastmail, e la
 *     variante che passa da un proxy per non rivelare nemmeno l'indirizzo
 *     (<https://support.postbox-inc.com/hc/en-us/articles/202198030-Displaying-Remote-Image-Content> ·
 *      <https://www.fastmail.help/hc/en-us/articles/1500000278102-Blocking-remote-images> ·
 *      <https://mailtester.com/blog/email-clients-block-images-by-default/>).
 *   ⛔ Come si contano le richieste in una prova: `page.route(…)` per INTERCETTARE e `route.abort()`
 *     per non lasciarle uscire, più `page.on('request')` per osservarle (Playwright,
 *     `docs/src/network.md` e `docs/src/mock.md`, letti con ctx7 il 19/09/2026).
 */

import { creaSchede } from './schede.js';
import { creaBloccoCodice } from './conversazione.js';
import { renderizzaMarkdown } from './markdown.js';
import { urlAmmesso } from './html-fidato.js';
import { icona } from './sezione-elenco-dettaglio.js';
import { contestoK, datiModelloInstallato, gb, STATI_INSTALLATO } from './modelli-installati.js';
import { datiMemoria } from './misura-memoria.js';
/*
 * ⛔ LA SCELTA DEL FILE E IL DOWNLOAD NON SI RISCRIVONO QUI: sono di `hf-catalogo.js`, che li ha
 *   ESTRATTI dal pannello stretto il 19/09/2026 proprio perché questa pagina li ospitasse
 *   (`montaSceltaFileHf`, `hf-catalogo.js:955`). Montarli con `prefissoId: 'paginaModello'` dà id
 *   propri (`paginaModelloFileChoices`, `…Stima`, `…Scarica`, `…Accesso`) e lascia intatti gli id
 *   del pannello (`hfFileChoices`, `hfStima`, `hfScarica`), che `app.js` legge e pilota: due nodi
 *   con lo stesso id renderebbero `querySelector('#x')` una domanda senza risposta unica.
 */
import { montaSceltaFileHf, gruppiVarianti } from './hf-catalogo.js';

/** Le tre schede del prototipo (`DETAIL_TABS`), nell'ordine in cui le disegna. */
export const SCHEDE = Object.freeze(['card', 'files', 'compatibility']);

/** Le parole a schermo delle tre schede. Mai il nome tecnico (`NIENTE NOMI TECNICI NELLA UI`). */
export const ETICHETTE_SCHEDE = Object.freeze({
  card: 'Scheda Hugging Face',
  files: 'File del modello',
  compatibility: 'Compatibilità',
});

/*
 * ⛔ Il prototipo chiedeva l'icona `cpu` per la compatibilità: nel foglio delle icone di TALOS
 *   `cpu` NON esiste (misurato il 18/09/2026 sullo sprite). Si usa `robot`, che c'è.
 */
const ICONE_SCHEDE = Object.freeze({ card: 'doc', files: 'folder', compatibility: 'robot' });

/** Il `repo` che `hf-direct-transfer.mjs:139` scrive per un file importato dal computer. */
export const REPO_IMPORTATO = 'local-upload';

/** Quanti file dell'impronta si mostrano per lato (`abcdef12…34567890`). */
export const CARATTERI_IMPRONTA = 8;

/**
 * Quanti caratteri di un titolo del README entrano nell'etichetta dell'indice.
 *
 * ⛔ Misurato il 19/09/2026 sul README vero di `unsloth/GLM-4.7-Flash-GGUF`: il titolo più lungo è
 *   di **145** caratteri, e in una fila di pulsanti diventa un paragrafo. Nel mockup le voci
 *   dell'indice sono quattro parole (`Panoramica`, `Contesto e limiti`): 44 è la misura che tiene
 *   quelle intere e accorcia le frasi.
 */
export const CARATTERI_INDICE = 44;

/*
 * ⛔ IL PREFISSO DI UN REPOSITORY NON INSTALLATO. `hf:Qwen/Qwen3-8B-GGUF`, con la revisione
 *   facoltativa dopo una `@`. La `@` è il separatore giusto perché il nome di un repository
 *   (`[A-Za-z0-9._-]`, `hf-hub-client.mjs:2`) non la può contenere, e la revisione che il prodotto
 *   usa è una sha di 40-64 cifre esadecimali (`REVISION`, stesso file) o un ramo.
 */
export const PREFISSO_REPO = 'hf:';

/** La parola dell'origine nella toolbar: «Locale» per un file sul disco, «Repository» per l'altro. */
export const ORIGINI = Object.freeze({ locale: 'Locale', repo: 'Repository', importato: 'Dal computer' });

/**
 * Lo stato di un repository che non è sul disco. Non si può dedurre da `STATI_INSTALLATO`, che
 * parla di file: «Non installato» è la parola che il laboratorio usa già per questa condizione
 * (`hf-catalogo.js`, colonna dello stato).
 */
export const STATO_NON_INSTALLATO = Object.freeze({ etichetta: 'Non installato', tono: 'warning' });

/*
 * ⛔ LA PREFERENZA CHE RESTA — le immagini remote delle schede.
 *
 *   Il campo è dichiarato nella forma esatta di `CAMPI_IMPOSTAZIONI` (`impostazioni-campi.js`), e
 *   col valore nella forma esatta del documento delle preferenze (`app.js:14465`,
 *   `talos.harness.desktop.settings.v1` → `chat.<chiave>`). ⇒ Non è un terzo sistema di preferenze:
 *   è lo stesso documento, la stessa sezione e lo stesso vocabolario. Perché `chat` e non `models`:
 *   perché `normalizzaPreferenzeChatDesktop` (`app.js:14647`) è il posto dove il valore vive, e le
 *   due sezioni in cui i campi dichiarati si distribuiscono oggi sono `appearance` e `chat`.
 *   ⛔ QUELLO CHE MANCA, E CHE NON POSSO FARE IO (i file non sono di questa corsia): la riga
 *     `readmeRemoteImages: boolValue(record.readmeRemoteImages, false)` dentro
 *     `normalizzaPreferenzeChatDesktop`, la voce in `CAMPI_IMPOSTAZIONI` (l'oggetto qui sotto) e il
 *     campo in `FIELD_HELP`. Finché non ci sono, la preferenza **si legge e si scrive lo stesso**
 *     (il documento si legge e si riscrive intero, quindi la chiave sopravvive), ma non compare
 *     fra i campi delle Impostazioni; e se un giorno il normalizzatore la scartasse, il verso del
 *     guasto è quello giusto: si torna a **non caricare** le immagini, mai il contrario.
 */
export const CHIAVE_IMMAGINI_REMOTE = 'readmeRemoteImages';
export const CHIAVE_DOCUMENTO_IMPOSTAZIONI = 'talos.harness.desktop.settings.v1';
export const CAMPO_IMMAGINI_REMOTE = Object.freeze({
  id: 'readmeRemoteImagesToggle',
  chiave: CHIAVE_IMMAGINI_REMOTE,
  tipo: 'checkbox',
  titolo: 'Immagini remote nelle schede',
  sezione: 'chat',
  gruppo: 'chat',
});
/**
 * La frase che spiega il campo, nella forma di `FIELD_HELP` (`features/settings/schema.ts`): è il
 * pezzo che manca perché la voce compaia anche in Impostazioni, accanto alle altre.
 */
export const AIUTO_IMMAGINI_REMOTE = 'Carica le immagini che le schede dei modelli portano da server esterni. Spento, nessuna richiesta parte: si vede il testo e l’elenco delle figure.';

/**
 * La porta delle preferenze di serie: lo STESSO documento dell'app.
 *
 * ⛔ Si legge e si scrive a mano, e ogni passo è dentro un `try`: `localStorage` può mancare o
 *   lanciare (finestra privata, dati di sito bloccati), e in quel caso si risponde `false` — cioè
 *   **bloccato**. Un guasto non deve mai trasformarsi in un consenso che nessuno ha dato.
 */
export function portaPreferenzeDiSerie(archivio = () => globalThis.localStorage) {
  const leggiDocumento = () => {
    try {
      const letto = JSON.parse(String(archivio()?.getItem(CHIAVE_DOCUMENTO_IMPOSTAZIONI) || '{}'));
      return letto && typeof letto === 'object' && !Array.isArray(letto) ? letto : {};
    } catch { return {}; }
  };
  return {
    leggi() {
      const documento = leggiDocumento();
      return documento?.chat?.[CHIAVE_IMMAGINI_REMOTE] === true;
    },
    scrivi(valore) {
      try {
        const documento = leggiDocumento();
        // ⛔ Si riscrive il documento INTERO con dentro il resto: sovrascrivere `chat` con il solo
        //   nostro campo cancelleresti le preferenze della persona.
        const chat = documento.chat && typeof documento.chat === 'object' && !Array.isArray(documento.chat) ? documento.chat : {};
        archivio()?.setItem(CHIAVE_DOCUMENTO_IMPOSTAZIONI, JSON.stringify({ version: 1, ...documento, chat: { ...chat, [CHIAVE_IMMAGINI_REMOTE]: valore === true } }));
        return true;
      } catch { return false; }
    },
  };
}

/**
 * Che cosa vuole mostrare questa pagina: un modello SUL DISCO o un repository.
 *
 * ⛔ Le due forme, e perché la prima è quella che conta: `hf:<repo>[@<revisione>]` viaggia
 *   nell'`id`, e l'`id` è l'unica cosa che la rotta porta (`app.js:4142`). `repo` è la seconda
 *   forma, per chi ha già l'oggetto. Se non c'è né l'una né l'altra, è un modello locale.
 */
export function bersaglioDi(id, repo = null) {
  const esplicito = typeof repo === 'string' ? repo.trim() : String(repo?.repo ?? '').trim();
  if (esplicito) {
    const revisione = typeof repo === 'object' && repo ? String(repo.revision ?? '').trim() : '';
    return { tipo: 'repo', id: `${PREFISSO_REPO}${esplicito}`, repo: esplicito, revisione, chiave: esplicito };
  }
  const testo = String(id ?? '').trim();
  if (testo.toLowerCase().startsWith(PREFISSO_REPO)) {
    const resto = testo.slice(PREFISSO_REPO.length);
    const taglio = resto.lastIndexOf('@');
    const nome = (taglio > 0 ? resto.slice(0, taglio) : resto).trim();
    const revisione = taglio > 0 ? resto.slice(taglio + 1).trim() : '';
    if (nome) return { tipo: 'repo', id: testo, repo: nome, revisione, chiave: nome };
  }
  return { tipo: 'locale', id: testo, repo: '', revisione: '', chiave: testo };
}

/**
 * Il NOME UMANO di un modello: quello che va nel titolo, mai l'id grezzo.
 *
 * ⛔ L'ordine è una regola, non un ripiego: (1) `name` se qualcuno l'ha rinominato — è la volontà
 *   della persona (la rinomina esiste: `POST /api/v1/local-models/<id>/rename`); (2) il nome del
 *   repository, che è come il modello si chiama DAVVERO sul suo sito; (3) l'id, solo se non c'è
 *   altro. Misurato il 19/09/2026 sul 4174: il modello installato ha
 *   `id: 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf'` — che è l'id del
 *   FILE, non il nome di niente — e `repo: 'unsloth/GLM-4.7-Flash-GGUF'`, cioè «GLM-4.7-Flash-GGUF».
 */
export function nomeUmano(modello = null, repo = null) {
  const rinominato = String(modello?.name ?? '').trim();
  if (rinominato) return rinominato;
  /*
   * ⛔ `||` E NON `??`: per un modello LOCALE il bersaglio ha `repo` a stringa VUOTA, e la stringa
   *   vuota non è `null`/`undefined` — con `??` il ripiego sul manifest non scatterebbe mai e il
   *   titolo tornerebbe a essere l'id grezzo, cioè esattamente il difetto da curare. Misurato
   *   scrivendo questa funzione: `'' ?? 'x'` è `''`.
   */
  const daRepo = String(repo?.repo || modello?.repo || '').split('/').filter(Boolean).pop() || '';
  if (daRepo && daRepo !== REPO_IMPORTATO) return daRepo;
  return String(modello?.id ?? '').trim() || 'Modello';
}

/** La parola dell'origine per la toolbar: un file importato non è «locale» come uno scaricato. */
export function origineDi(modello = null, bersaglio = null) {
  // ⛔ Anche `modello.remoto`: dopo la lettura il repository HA un manifest (fabbricato), e
  //   guardando solo il bersaglio la parola tornerebbe «Locale» su un modello che non è installato.
  if (bersaglio?.tipo === 'repo' || modello?.remoto === true) return ORIGINI.repo;
  return String(modello?.repo ?? '') === REPO_IMPORTATO ? ORIGINI.importato : ORIGINI.locale;
}

/**
 * Le immagini che una scheda porta da fuori, ripulite e contate.
 *
 * ⛔ Il server le ha già separate dal README (`hf-hub-client.mjs:14-37`) e ha già accettato solo
 *   `https:`; qui si rifà il controllo **lo stesso**, perché una seconda porta sullo stesso
 *   pericolo è la regola di casa e non un sospetto: `urlAmmesso(url, {soloImmagine: true})` accetta
 *   i soli schemi `https:` e `http:`, e scarta `data:` e i vuoti. Gli host si contano per dirli a
 *   schermo: è l'equivalente del «da chi» delle app di posta.
 */
export function immaginiDellaScheda(images = []) {
  const viste = new Set();
  const fuori = [];
  for (const voce of Array.isArray(images) ? images : []) {
    const url = String(voce?.url ?? '').trim();
    if (!url || !urlAmmesso(url, { soloImmagine: true }) || viste.has(url)) continue;
    viste.add(url);
    let host = '';
    try { host = new URL(url).host; } catch { host = ''; }
    fuori.push({ url, alt: String(voce?.alt ?? '').trim(), host });
  }
  const host = [...new Set(fuori.map((i) => i.host).filter(Boolean))].sort();
  return { immagini: fuori, host, quante: fuori.length };
}

/**
 * L'indirizzo da cui il BROWSER prende un'immagine: il nostro server, mai quello esterno.
 *
 * ⛔ È la stessa forma che il prodotto usa da sempre (`app.js:3678`), e non è un giro a vuoto:
 *   la CSP del prodotto (`img-src 'self' data:`, `http-app.mjs:572`) un indirizzo esterno non lo
 *   lascerebbe nemmeno partire, e il proxy è l'unico punto in cui si parla col sito di terzi — con
 *   la sua lista di host e la sua difesa SSRF (`src/hf-image-proxy.mjs`).
 */
export function percorsoImmagine(url) {
  return `/api/v1/huggingface/image?url=${encodeURIComponent(String(url ?? ''))}`;
}

/** La stima di memoria di una variante: la rotta vuole SOLO `bytes` (e `contextTokens`). */
export function percorsoStima(bytes, { contextTokens = null } = {}) {
  const parametri = new URLSearchParams({ bytes: String(bytes) });
  if (Number.isInteger(contextTokens) && contextTokens > 0) parametri.set('contextTokens', String(contextTokens));
  return `/api/v1/local-models/fit-estimate?${parametri.toString()}`;
}

/**
 * Il corpo del download di una variante — la STESSA forma che il pannello stretto manda oggi.
 *
 * ⛔ Copiata parola per parola da `app.js:3824-3826` (`avviaDownloadHf`), e non inventata: il server
 *   la valida a mano (`requireHuggingFaceDownloadBody`, `http-app.mjs:1546-1566`) e pretende
 *   `{id, repo, revision (40-64 esa), files:[{path, bytes, sha256}], bytes, path, license}`.
 *   Tre vincoli che si sbagliano facilmente:
 *   · `license` NON può essere vuota — il negozio dei modelli rifiuta il manifesto DOPO aver
 *     accettato la richiesta, e la risposta era un 500 (R-08, 13/09). Il pannello manda `'unknown'`
 *     quando il repository non la dichiara, e così si fa qui;
 *   · ogni file vuole `sha256` di 64 cifre — il blocco della scelta disabilita il pulsante quando
 *     l'impronta manca (`senzaHash`), quindi a questa funzione non arriva;
 *   · `bytes` è il peso del GRUPPO (un set `-00001-of-00003` pesa quanto i suoi pezzi).
 * ⭐ L'`id` e il `path` sono la stessa stringa: è l'identità del download, e nasce dal repository e
 *   dal primo file del gruppo (ripuliti), non da altro.
 */
export function corpoDownloadHf(detail = {}, gruppo = null) {
  const file = Array.isArray(gruppo?.file) ? gruppo.file : [];
  const primo = file[0];
  if (!primo?.path) return null;
  const id = `${String(detail.repo ?? '').replace(/[^a-z0-9_-]/giu, '-')}-${String(detail.revision || 'main').slice(0, 12)}-${String(primo.path).replace(/[^a-z0-9]/giu, '-')}`.slice(0, 120);
  return {
    id,
    repo: String(detail.repo ?? ''),
    revision: String(detail.revision ?? ''),
    files: file.map((f) => ({ path: String(f.path), bytes: Number(f.sizeBytes), sha256: String(f.sha256 ?? '') })),
    bytes: Number(gruppo.bytes),
    sha256: String(primo.sha256 ?? ''),
    license: detail.license || 'unknown',
    path: id,
  };
}

/** Sotto questa quota di memoria libera il verdetto «entra» è stretto (Unsloth #7880, 18/09/2026). */
const QUOTA_STRETTA = 0.9;

let contatore = 0; // id unici per montaggio: due pagine nella stessa schermata non devono collidere

const numero = new Intl.NumberFormat('it-IT');

/* ═══════════════════════════ le funzioni pure (provate dai test) ═══════════════════════════ */

/**
 * Toglie la testata YAML del README di Hugging Face.
 *
 * ⛔ Senza questo, i model card si aprono con `license: apache-2.0` e `base_model: …` a schermo,
 *   come se fossero prosa. La testata è riconosciuta solo se è DAVVERO una testata: primo rigo
 *   `---`, una riga di chiusura `---` da sola, e almeno una chiave `qualcosa: valore` in mezzo —
 *   così un README che comincia con un separatore orizzontale resta intatto.
 */
export function senzaFrontMatter(testo) {
  const grezzo = String(testo ?? '').replace(/\r\n?/g, '\n');
  if (!grezzo.startsWith('---\n')) return grezzo;
  const righe = grezzo.split('\n');
  let chiusura = -1;
  for (let i = 1; i < righe.length; i += 1) {
    if (righe[i].trim() === '---') { chiusura = i; break; }
    if (righe[i].trim() === '') continue; // una testata può avere righe vuote, non le chiude
  }
  if (chiusura < 2) return grezzo; // nessuna chiave prima della chiusura: non è una testata
  const dentro = righe.slice(1, chiusura);
  if (!dentro.some((r) => /^[A-Za-z0-9_.-]+\s*:/.test(r))) return grezzo;
  return righe.slice(chiusura + 1).join('\n').replace(/^\n+/, '');
}

/**
 * L'impronta come si legge a schermo: testa e coda, puntini in mezzo, e NIENTE puntini quando non
 * si sta accorciando niente.
 */
export function improntaBreve(valore, { primi = CARATTERI_IMPRONTA, ultimi = CARATTERI_IMPRONTA } = {}) {
  const testo = String(valore ?? '').trim();
  if (!testo) return '';
  if (testo.length <= primi + ultimi + 1) return testo;
  return `${testo.slice(0, primi)}…${testo.slice(-ultimi)}`;
}

/** Gli esiti del confronto fra il file sul disco e quello dichiarato dal repository. */
export const ESITI_FILE = Object.freeze({
  coincide: { etichetta: 'Coincide col repository', tono: 'success' },
  diverso: { etichetta: 'Diverso dal repository', tono: 'danger' },
  'non-confrontabile': { etichetta: 'Non confrontabile', tono: 'warning' },
  'solo-locale': { etichetta: 'Il repository non lo elenca', tono: 'warning' },
});

/**
 * Confronta i file del disco (manifest) con quelli del repository, PER PERCORSO.
 *
 * ⛔ I due lati si chiamano diversamente — `bytes`/`sha256` sul disco, `sizeBytes`/`sha256` nel
 *   repository — quindi il confronto è sul solo `sha256`, che è l'unica cosa che i due lati
 *   dichiarano con lo stesso nome e lo stesso significato. Un lato che non dichiara l'impronta
 *   rende il file «non confrontabile»: dirlo è più onesto che darlo per buono.
 * ⛔ Un modello scaricato contiene di norma UNA quantizzazione: i file che il repository elenca e
 *   il disco non ha NON sono un difetto, e il chiamante li mostra a parte.
 */
export function confrontaFile(locali = [], remoti = []) {
  const perPercorso = new Map();
  for (const file of Array.isArray(remoti) ? remoti : []) {
    const percorso = String(file?.path ?? '');
    if (percorso) perPercorso.set(percorso, file);
  }
  const impronta = (valore) => String(valore ?? '').trim().toLowerCase();
  const file = (Array.isArray(locali) ? locali : []).map((locale) => {
    const percorso = String(locale?.path ?? '');
    const remoto = perPercorso.get(percorso) || null;
    if (remoto) perPercorso.delete(percorso);
    let esito = 'solo-locale';
    if (remoto) {
      const a = impronta(locale?.sha256);
      const b = impronta(remoto?.sha256);
      esito = !a || !b ? 'non-confrontabile' : a === b ? 'coincide' : 'diverso';
    }
    return { percorso, locale, remoto, esito };
  });
  return { file, soloRepository: [...perPercorso.values()] };
}

const MOTIVI = Object.freeze({
  measurement: 'Il server non ha potuto misurare la macchina.',
  capabilities: 'Il runtime non ha osservato le capacità di questo modello (attrezzi, chiamate di attrezzo, ruolo di sistema).',
  template: 'Il modello non dichiara il supporto agli attrezzi: la chat sì, l’agente no.',
  fits: '',
});

/** Il contesto efficace contro quello chiesto: le due cifre che spiegano un rifiuto per contesto. */
function motivoContesto(fit) {
  const efficace = contestoK(fit?.inspection?.context?.effectiveTokens?.value);
  const chiesto = contestoK(fit?.context?.requestedTokens);
  if (!efficace || !chiesto) return 'Il contesto del modello è più corto di quello richiesto.';
  return `Il contesto efficace è ${efficace}, ne servono ${chiesto}.`;
}

/**
 * Il verdetto di compatibilità, con le parole che il prodotto usa già (`verdettoEntra`,
 * `modelli-installati.js:39`) e i due stati che quello non conosce.
 *
 * ⛔ Non si riusa `verdettoEntra` per due ragioni misurate: vuole la forma del monolite
 *   (`fit.esito`, non la risposta di `/fit`), manda ogni stato diverso da `compatible` in
 *   «Non entra» — e quindi non sa dire `chat-only` — e quando `memory.availableBytes` manca ripiega
 *   su `runtime.allocabiliBytes`, che è **RAM** (`app.js:3386`) mescolando le due grandezze.
 *   La pagina non fa quel ripiego: se un numero manca, dice «—».
 */
export function verdettoMemoria(fit) {
  if (!fit || typeof fit !== 'object') return null;
  const stato = String(fit.state || 'unknown');
  const richiesti = fit.memory?.requiredBytes;
  const liberi = fit.memory?.availableBytes;
  const stretto = stato === 'tight'
    || (Number.isFinite(richiesti) && Number.isFinite(liberi) && liberi > 0 && richiesti / liberi >= QUOTA_STRETTA);
  if (stato === 'compatible' || stato === 'tight') {
    const cifre = Number.isFinite(richiesti) && Number.isFinite(liberi)
      ? `${byte(richiesti)} richiesti su ${byte(liberi)} liberi`
      : 'Misure incomplete.';
    return stretto
      ? { chiave: 'stretto', etichetta: 'Entra stretto', tono: 'warning', dettaglio: cifre }
      : { chiave: 'entra', etichetta: 'Entra', tono: 'success', dettaglio: cifre };
  }
  if (stato === 'chat-only') {
    const perContesto = String(fit.reason || '') === 'context';
    return {
      chiave: 'solo-chat',
      etichetta: 'Entra solo senza l’agente',
      tono: 'warning',
      dettaglio: perContesto ? motivoContesto(fit) : MOTIVI.template,
    };
  }
  if (stato === 'blocked') {
    const motivo = String(fit.reason || '');
    if (motivo === 'storage') {
      return { chiave: 'non-entra', etichetta: 'Non entra', tono: 'danger', dettaglio: `Sul disco servono ${byte(fit.storage?.requiredBytes)}, restano ${byte(fit.storage?.availableBytes)}.` };
    }
    if (motivo === 'memory') {
      return { chiave: 'non-entra', etichetta: 'Non entra', tono: 'danger', dettaglio: `In memoria servono ${byte(fit.memory?.requiredBytes)}, liberi ${byte(fit.memory?.availableBytes)}.` };
    }
    if (motivo === 'context') {
      return { chiave: 'non-entra', etichetta: 'Non entra', tono: 'danger', dettaglio: motivoContesto(fit) };
    }
    return { chiave: 'non-entra', etichetta: 'Non entra', tono: 'danger', dettaglio: MOTIVI[motivo] || '' };
  }
  return { chiave: 'ignoto', etichetta: 'Non verificato', tono: '', dettaglio: MOTIVI[String(fit.reason || '')] || '' };
}

/**
 * Un fatto dell'ispezione (`{state:'observed'|'declared'|'unknown', value}`) come testo leggibile.
 *
 * ⛔ `numeri` è il formattatore della grandezza, e serve: un conteggio di token scritto `32768` in
 *   una riga e `32k token` in quella accanto è la stessa malattia delle due unità di misura — nella
 *   stessa card due numeri della stessa specie non si scrivono in due modi. I valori `NaN`/`Infinity`
 *   restano «Sconosciuto»: un numero che non c'è non diventa uno zero.
 */
export function testoFatto(fatto, { numeri = null } = {}) {
  if (fatto === null || fatto === undefined) return 'Sconosciuto';
  if (typeof fatto === 'object') {
    if (String(fatto.state || '') === 'unknown') return 'Sconosciuto';
    const valore = fatto.value;
    if (valore === null || valore === undefined) return 'Sconosciuto';
    if (typeof valore === 'boolean') return valore ? 'Sì' : 'No';
    if (typeof valore === 'number') {
      if (!Number.isFinite(valore)) return 'Sconosciuto';
      return (numeri ? numeri(valore) : null) || String(valore);
    }
    return String(valore);
  }
  return typeof fatto === 'boolean' ? (fatto ? 'Sì' : 'No') : String(fatto);
}

/** Da dove viene un fatto: `osservato` dal runtime, `dichiarato` dal file, niente se non si sa. */
export function provenienzaFatto(fatto) {
  const stato = typeof fatto === 'object' && fatto ? String(fatto.state || '') : '';
  return stato === 'observed' ? 'osservato' : stato === 'declared' ? 'dichiarato' : '';
}

function slug(testo) {
  return String(testo ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Dà un `id` ai titoli del README reso e torna l'indice della scheda.
 *
 * ⛔ Il Markdown non genera ancore: senza questo, «Salta a…» non ha dove saltare. Ogni titolo
 *   riceve `id` (prefissato col montaggio, così due pagine non si rubano l'ancora), `tabindex="-1"`
 *   per poter ricevere il fuoco dopo il salto, e `scroll-margin-top` — la distanza dal bordo che
 *   l'ancora deve lasciare, misurata in pixel perché il contenitore di scorrimento non è nostro.
 */
export function indiceDelReadme(frammento, doc, { prefisso = 'readme', margine = 12, caratteri = CARATTERI_INDICE } = {}) {
  const titoli = [...(frammento?.querySelectorAll?.('h2, h3, h4') || [])];
  return titoli.map((titolo, i) => {
    const testo = String(titolo.textContent || '').trim();
    const id = `${prefisso}-${slug(testo) || 'sezione'}-${i}`;
    titolo.id = id;
    titolo.tabIndex = -1;
    titolo.style.scrollMarginTop = `${margine}px`;
    /*
     * ⛔ L'ETICHETTA DELL'INDICE SI ACCORCIA, IL TESTO NO. Difetto trovato GUARDANDO la foto del
     *   19/09/2026 sui dati veri del 4174: i titoli di un README vero non sono «Contesto e limiti»,
     *   sono frasi intere — `## Jan 21 update: llama.cpp fixed a bug that caused looping and poor
     *   outputs. We updated the GGUFs - please re-download the model for much better outputs.` — e
     *   quell'etichetta da **145 caratteri** sfondava la riga dell'indice, che nel mockup è una
     *   fila di quattro parole. L'indice è un aiuto a SALTARE, non un secondo sommario: si accorcia
     *   a `CARATTERI_INDICE`, col testo intero nel `title` (e quindi per chi legge con uno screen
     *   reader), e il titolo nel documento resta intero, perché è lui il bersaglio.
     */
    const breve = testo.length > caratteri ? `${testo.slice(0, caratteri).trimEnd()}…` : testo;
    return { id, testo, breve, livello: Number(String(titolo.tagName).slice(1)) || 2 };
  });
}

/* ---------------------------------- i percorsi delle richieste ---------------------------------- */

export function percorsoModelli() { return '/api/v1/local-models'; }

export function percorsoFit(id, { profilo = 'agent', contextTokens = null } = {}) {
  const parametri = new URLSearchParams({ profile: String(profilo) });
  // ⛔ Solo `profile` e `contextTokens`: qualsiasi altro parametro fa rispondere `QUERY_INVALID`.
  if (Number.isInteger(contextTokens) && contextTokens > 0) parametri.set('contextTokens', String(contextTokens));
  return `/api/v1/local-models/${encodeURIComponent(String(id ?? ''))}/fit?${parametri.toString()}`;
}

/** `null` quando il modello non ha un repository vero (importato dal computer). */
export function percorsoRepo(modello) {
  const repo = String(modello?.repo ?? '').trim();
  if (!repo || repo === REPO_IMPORTATO) return null;
  const revisione = String(modello?.revision ?? '').trim() || 'main';
  return `/api/v1/huggingface/repo?repo=${encodeURIComponent(repo)}&revision=${encodeURIComponent(revisione)}`;
}

/* ----------------------------------- aiuti di disegno ----------------------------------- */

function nodo(doc, tag, classe, testo) {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined && testo !== null) n.textContent = String(testo);
  return n;
}

/**
 * I byte a schermo — SEMPRE da qui, mai `gb` diretta.
 *
 * ⛔ `gb(null)` non dice «—»: `Number(null)` è **0**, quindi un campo che il server non manda
 *   diventerebbe «0 GB», cioè una cifra inventata da un valore assente. La pagina promette il
 *   contrario («se un numero manca, dice —»), e senza questa guardia la promessa sarebbe falsa per
 *   `null` — che in JSON è la forma più comune di «non c'è». Restituisce la stessa stringa di `gb`
 *   quando il numero c'è davvero: non è un secondo formattatore, è il cancello davanti a quello.
 */
function byte(valore) {
  if (valore === null || valore === undefined || valore === '' || typeof valore === 'boolean') return '—';
  const n = Number(valore);
  return Number.isFinite(n) ? gb(n) : '—';
}

function paragrafo(doc, classe, testo) { return nodo(doc, 'p', classe, testo); }

function badge(doc, testo, tono) {
  const b = nodo(doc, 'span', `talos-badge talos-badge--sm${tono ? ` talos-badge--${tono}` : ''}`, testo);
  b.dataset.c = 'Badge';
  return b;
}

function riga(doc, etichetta, valore, { chiave = '', tono = '' } = {}) {
  const riga = nodo(doc, 'div', 'talos-kv');
  const val = nodo(doc, 'span', `talos-kv__v${tono === 'accent' ? ' talos-kv__v--accent' : ''}`, valore);
  if (chiave) val.dataset.modelloValore = chiave;
  riga.append(nodo(doc, 'span', 'talos-kv__k', etichetta), val);
  return riga;
}

/**
 * Una riga di FATTO osservato: il valore, e da dove viene.
 *
 * ⛔ La provenienza va a schermo, non buttata via: `osservato` dal runtime e `dichiarato` dal file
 *   non sono la stessa cosa, e un fatto che il runtime non ha visto resta `Sconosciuto` invece di
 *   diventare un «No» (è la lezione di P-13: una risposta sbagliata SICURA non è una «non lo so»).
 *   Se ne occupa `testoFatto`; qui si dice anche CHI lo dice.
 */
function rigaFatto(doc, etichetta, fatto, opzioni) {
  const r = riga(doc, etichetta, testoFatto(fatto, opzioni));
  const daDove = provenienzaFatto(fatto);
  if (daDove) {
    /*
     * ⛔ IL VALORE RESTA L'ULTIMO FIGLIO DELLA RIGA, e il badge va PRIMA di lui.
     *   `.talos-kv` e' `display:flex; justify-content:space-between` (`index.css:1563`): lo spazio
     *   libero si divide fra i figli, quindi conta CHI sta per ultimo. Appendendo il badge dopo il
     *   valore, il valore finiva a META' riga — misurato in foto il 18/09/2026 nella card «Contesto e
     *   capacita'»: «32k token» a x≈730 contro «64k token» a x≈1360, nella stessa card.
     *   ⛔ E raggruppare valore+badge NON basta, misurato con la guardia di SCHEDA-06: le righe con
     *   la provenienza si allineavano fra loro (bordo destro 1160/1161 su sei righe) ma quella SENZA
     *   finiva a 1237 — **77 px** di scarto, cioe' la larghezza del badge. La colonna si tiene solo
     *   col valore per ultimo: cosi' il suo bordo destro e' il bordo destro della riga, sempre.
     *   ⇒ Non c'era un precedente da seguire, ed e' misurato: i tre costruttori `kv()` del prodotto
     *   (`automazioni.js:21`, `catalogo-modelli.js:38`, `inspector.js:696`) fanno tutti e tre DUE
     *   figli, e nessun componente appende un badge a una riga `talos-kv`.
     */
    r.insertBefore(badge(doc, daDove, ''), r.querySelector('.talos-kv__v'));
  }
  return r;
}

/** Un pulsante di copia con esito a schermo — l'idioma del progetto (`app.js:3853`, `conversazione.js:637`). */
function copia(doc, valore, { etichetta = 'Copia', suggerimento = '' } = {}) {
  const b = nodo(doc, 'button', 'talos-button talos-button--ghost talos-button--sm');
  b.type = 'button';
  b.dataset.modelloCopia = '';
  const scritta = nodo(doc, 'span', '', etichetta);
  b.append(icona(doc, 'copy', 'i i--sm'), scritta);
  if (suggerimento) { b.title = suggerimento; b.setAttribute('aria-label', suggerimento); }
  b.addEventListener('click', async () => {
    let esito = 'Copiato';
    try {
      const appunti = globalThis.navigator?.clipboard;
      if (typeof appunti?.writeText !== 'function') throw new Error('appunti non disponibili');
      await appunti.writeText(String(valore));
    } catch { esito = 'Copia non riuscita'; }
    scritta.textContent = esito;
    globalThis.setTimeout?.(() => {
      // ⛔ Il pulsante può essere già stato buttato da un ridisegno: si riporta l'etichetta solo se è ancora vivo.
      if (b.isConnected) scritta.textContent = etichetta;
    }, 1500)?.unref?.();
  });
  return b;
}

function accorciaMovimento() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/* ═══════════════════════════════ il componente ═══════════════════════════════ */

/**
 * Monta la pagina del modello dentro `contenitore`. Non decide NIENTE del contenitore: non ci mette
 * padding né scorrimento, non assume di stare in Impostazioni, non tocca la rotta.
 *
 * @param {HTMLElement} contenitore dove disegnare (il contenitore scorrevole lo mette chi chiama)
 * @param {object} opzioni
 * @param {(percorso:string)=>Promise<any>} opzioni.apiGet la lettura: torna i dati già srotolati
 *   (`envelope.data`) e lancia con un `.message` leggibile quando la richiesta fallisce
 * @param {(percorso:string, corpo:object)=>Promise<any>} [opzioni.apiPost] la scrittura, con lo
 *   stesso contratto di `apiGet` (`app.js` la usa: `apiPost('/api/v1/huggingface/download', …)`).
 *   Serve al solo download di un repository non installato: senza, il pulsante «Scarica» è spento e
 *   la pagina dice perché, invece di promettere un download che non può partire.
 * @param {string} opzioni.id l'id del modello locale
 * @param {object} [opzioni.modello] il manifest, se chi chiama ce l'ha già (risparmia la lista)
 * @param {'card'|'files'|'compatibility'} [opzioni.scheda] la scheda aperta all'avvio
 * @param {number} [opzioni.contextTokens] il contesto per cui stimare la memoria (di serie 65536)
 * @param {'agent'|'chat'} [opzioni.profilo] il profilo della verifica
 * @param {Function} [opzioni.indietro] se c'è, compare «Tutti i modelli»
 * @param {(scheda:string)=>void} [opzioni.onScheda] che cosa fare quando cambia scheda (la rotta)
 * @param {Object} [opzioni.runtime] il motore locale (`{caricato}`) per lo stato della riga
 * @param {string|{repo:string, revision?:string}} [opzioni.repo] la seconda forma del repository
 *   non installato (la prima è `hf:<repo>` dentro `id`): chi ha già `{repo, revision}` in mano non
 *   deve comporre una stringa.
 * @param {{leggi:()=>boolean, scrivi:(v:boolean)=>boolean}} [opzioni.preferenze] dove vive il
 *   consenso che resta (di serie `portaPreferenzeDiSerie()`: lo stesso documento delle Impostazioni)
 * @param {Document} [opzioni.document] il documento su cui creare i nodi (per le prove)
 * @returns {{vaiA:Function, ricarica:Function, distruggi:Function, elemento:HTMLElement, stato:object}}
 */
export function montaSchedaModello(contenitore, {
  apiGet,
  apiPost = null,
  id,
  modello = null,
  repo = null,
  preferenze = null,
  scheda = 'card',
  contextTokens = null,
  profilo = 'agent',
  indietro = null,
  onScheda = null,
  onScelta = null,
  apriDownload = null,
  onLiberaMemoria = null,
  runtime = {},
  inizio = null,
  document: documento = null,
} = {}) {
  const doc = documento || contenitore?.ownerDocument || globalThis.document;
  if (!contenitore || !doc) throw new Error('La pagina del modello vuole un contenitore.');
  if (typeof apiGet !== 'function') throw new Error('La pagina del modello vuole un lettore (`apiGet`).');
  const bersaglio = bersaglioDi(id, repo);
  if (!bersaglio.id && bersaglio.tipo !== 'repo') throw new Error('La pagina del modello vuole un id.');

  const suffisso = `sm${(contatore += 1)}`;
  const idPannello = `${suffisso}-pannello`;
  const porta = preferenze && typeof preferenze.leggi === 'function' && typeof preferenze.scrivi === 'function'
    ? preferenze
    : portaPreferenzeDiSerie();
  /*
   * ⛔ IL CONSENSO SI LEGGE UNA VOLTA, E SUA NONNA SI TORNA MAI: se la lettura fallisce (finestra
   *   privata, dati di sito bloccati) il valore è `false` — bloccato. `stato.consenso` è il
   *   consenso DI QUESTA SCHERMATA (il comando «mostra adesso»), `stato.consensoPersistente` è la
   *   preferenza che resta: sono due cose diverse e si vedono diverse, perché chi mostra le
   *   immagini una volta non ha detto di volerlo per sempre.
   */
  const consensoSalvato = (() => { try { return porta.leggi() === true; } catch { return false; } })();
  const stato = {
    id: bersaglio.id,
    bersaglio,
    scheda: SCHEDE.includes(scheda) ? scheda : 'card',
    modello: modello && typeof modello === 'object' ? modello : null,
    fit: null,
    capacita: null,
    repo: null,
    consenso: consensoSalvato,
    consensoPersistente: consensoSalvato,
    /*
     * ⛔ LO STATO DELLA SCELTA DEL FILE — vive QUI e non dentro il blocco di `hf-catalogo.js`,
     *   perché il blocco si ridisegna a ogni cambio di scheda (e a ogni azione) mentre la scelta,
     *   la stima e l'esito del download devono sopravvivere al ridisegno. `stima` è la stessa
     *   `Map` che il pannello stretto passa (`state.modelLab.hfStima.perVariante`): chiave della
     *   variante → esito di `/fit-estimate` (o `{inCorso:true}`).
     */
    hf: { stima: new Map(), scelta: null, inMisura: false, scarica: { inCorso: false, esito: '', errore: '' } },
    caricamento: { modello: false, fit: false, capacita: false, repo: false },
    errori: { modello: '', fit: '', capacita: '', repo: '' },
    distrutto: false,
  };

  /* ------------------------------- lo scheletro ------------------------------- */

  const radice = nodo(doc, 'div', 'model-page talos-stack');
  radice.dataset.schedaModello = '';
  radice.dataset.modelloId = String(bersaglio.id);

  /*
   * ⛔ Le classi sono DUE, e non è una svista: la prima è quella del mockup (`.model-*`, misurata
   *   dal suo DOM vivo) e la seconda è la classe di prodotto che oggi dà una forma a quell'elemento
   *   (`talos-toolbar`, `talos-cluster`, `talos-page__note`). Il foglio del mockup non esiste ancora
   *   in `src/styles/` — è chiesto nel referto — e senza il ponte la pagina uscirebbe spoglia; con
   *   il ponte, quando il foglio arriva le due regole convivono e la seconda si toglie.
   */
  const barra = nodo(doc, 'div', 'model-page-toolbar talos-toolbar');
  const testata = nodo(doc, 'header', 'model-hero');
  testata.dataset.modelloTestata = '';
  const rigaSchede = nodo(doc, 'div', 'model-page-tabs talos-cluster');
  const listaSchede = nodo(doc, 'div', 'talos-tabs__list');
  listaSchede.setAttribute('role', 'tablist');
  listaSchede.setAttribute('aria-label', 'Sezioni della pagina del modello');
  // La nota del mockup (`.model-page-tab-note`): uno scudo e la frase, a destra delle linguette.
  const notaSchede = nodo(doc, 'span', 'model-page-tab-note');
  notaSchede.append(icona(doc, 'shield', 'i i--xs'), doc.createTextNode('Nessun avvio automatico'));
  rigaSchede.append(listaSchede, notaSchede);
  const pannello = nodo(doc, 'section', 'talos-tabs__panel');
  pannello.id = idPannello;
  pannello.dataset.modelloPannello = stato.scheda;
  /*
   * ⛔ La chiusura di pagina del mockup porta un glifo «informazione» (un cerchio con la `i`): nel
   *   foglio di TALOS quel glifo non c'è (`i-ignoto` è un quadrato tratteggiato col punto
   *   interrogativo, che vuol dire un'altra cosa). ⇒ La frase resta, il glifo no: un'icona che dice
   *   «non lo so» su una nota che spiega una regola sarebbe un secondo messaggio, e sbagliato.
   */
  const chiusura = paragrafo(doc, 'model-page-end talos-page__note', 'Leggere questa pagina non scarica file, non carica il modello e non cambia le nuove chat.');

  const gruppoPannello = nodo(doc, 'div', 'talos-tabs__panels');
  gruppoPannello.append(pannello);
  radice.append(barra, testata, rigaSchede, gruppoPannello, chiusura);
  contenitore.replaceChildren(radice);

  const schede = creaSchede(listaSchede, {
    idMenu: `${suffisso}-scheda`,
    classe: 'talos-tabs__tab',
    identifica: (voce) => voce.id,
    etichetta: (voce) => voce.etichetta,
    // ⛔ Nessun `title`: ripeterebbe parola per parola ciò che la linguetta già dice a schermo.
    suggerimento: () => '',
    contenuto: (bottone, voce) => {
      bottone.append(icona(doc, voce.icona, 'i i--sm'), doc.createTextNode(voce.etichetta));
    },
    controlla: () => idPannello,
    azioni: { seleziona: (scelta) => vaiA(scelta) },
  });
  const VOCI = SCHEDE.map((chiave) => ({
    id: chiave,
    etichetta: ETICHETTE_SCHEDE[chiave],
    icona: ICONE_SCHEDE[chiave],
    suggerimento: ETICHETTE_SCHEDE[chiave],
  }));
  schede.aggiorna(VOCI, stato.scheda);

  /** Vero quando questa pagina parla di un REPOSITORY, non di un file sul disco. */
  function remoto() { return bersaglio.tipo === 'repo' || stato.modello?.remoto === true; }

  /* ------------------------------- i dati ------------------------------- */

  let generazioneLettura = 0;
  let ricaricaInCorso = null;

  async function leggi(chiave, percorso, applica) {
    if (stato.distrutto) return;
    const generazione = generazioneLettura;
    stato.caricamento[chiave] = true;
    stato.errori[chiave] = '';
    try {
      const dati = await apiGet(percorso);
      if (stato.distrutto || generazione !== generazioneLettura) return;
      applica(dati);
    } catch (errore) {
      if (stato.distrutto || generazione !== generazioneLettura) return;
      stato.errori[chiave] = String(errore?.message || errore || 'Richiesta non riuscita');
    } finally {
      if (!stato.distrutto && generazione === generazioneLettura) {
        stato.caricamento[chiave] = false;
        disegna();
      }
    }
  }

  /**
   * Il manifest di un repository che non è sul disco: si COSTRUISCE dalla risposta vera, e si
   * dichiara `remoto`.
   *
   * ⛔ Perché fabbricarlo invece di trattare il repository a parte in ogni disegno: metà di questa
   *   pagina (`nomeUmano`, `percorsoRepo`, la scheda dei file) parla la lingua del manifest. Dargli
   *   un manifest con `repo`, `license`, `files[]` **veri** evita un secondo ramo in ogni funzione —
   *   che è il modo in cui nascono le due verità. Ciò che NON si fabbrica: `bytes` e `sha256` del
   *   modello intero (non esistono prima del download) e `state`, che resta `'remote'` per non
   *   diventare «Sul disco».
   * ⛔ `byteTotali` è la somma dei file del repository, ed è un numero vero SOLO come «quanto pesa
   *   il repository»: non è «la dimensione del modello» — un repository porta più quantizzazioni, e
   *   chi ne scarica una non scarica le altre. Per questo la striscia non lo chiama «dimensione».
   */
  function manifestDaRepo(dati) {
    const file = (Array.isArray(dati?.files) ? dati.files : [])
      .map((voce) => ({ path: String(voce?.path ?? ''), bytes: voce?.sizeBytes, sha256: String(voce?.sha256 ?? '') }))
      .filter((voce) => voce.path);
    const somma = file.reduce((tot, f) => (Number.isFinite(f.bytes) ? tot + Number(f.bytes) : tot), 0);
    return {
      id: bersaglio.id,
      repo: bersaglio.repo,
      revision: String(dati?.revision || bersaglio.revisione || '').trim(),
      license: dati?.license || null,
      files: file,
      bytes: null,
      sha256: null,
      path: '',
      state: 'remote',
      remoto: true,
      byteTotali: somma > 0 ? somma : null,
    };
  }

  function caricaModello() {
    if (stato.modello) { disegna(); return Promise.resolve(); }
    // ⛔ In modalità repository non c'è NIENTE da cercare fra gli installati: il repository è la
    //   fonte, e chiedere la lista dei modelli locali per un id che non è un modello locale sarebbe
    //   una richiesta che non può che fallire.
    if (bersaglio.tipo === 'repo') return Promise.resolve();
    return leggi('modello', percorsoModelli(), (dati) => {
      const elenco = Array.isArray(dati?.items) ? dati.items : [];
      stato.modello = elenco.find((voce) => String(voce?.id) === String(stato.id)) || null;
      if (!stato.modello) stato.errori.modello = 'Questo modello non è fra quelli installati.';
    });
  }

  function caricaRepo() {
    const revisioneSalvata = !/^[a-f0-9]{40,64}$/iu.test(bersaglio.revisione)
      && inizio?.id === bersaglio.id && /^[a-f0-9]{40,64}$/iu.test(inizio.revision)
      ? inizio.revision : bersaglio.revisione;
    const percorso = bersaglio.tipo === 'repo'
      ? percorsoRepo({ repo: bersaglio.repo, revision: revisioneSalvata })
      : percorsoRepo(stato.modello);
    if (!percorso) { disegna(); return Promise.resolve(); }
    return leggi('repo', percorso, (dati) => {
      stato.repo = dati && typeof dati === 'object' ? dati : null;
      // Il manifest nasce QUI, e solo qui: prima della risposta i file del repository non esistono.
      if (bersaglio.tipo === 'repo') stato.modello = manifestDaRepo(stato.repo);
      const scelta = stato.hf.scelta || (inizio?.id === bersaglio.id && inizio.revision === stato.repo?.revision ? inizio.scelta : null);
      stato.hf.scelta = gruppiVarianti(stato.repo?.files).some(g => g.chiave === scelta) ? scelta : null;
      onScelta?.({ revision: stato.repo?.revision, scelta: stato.hf.scelta });
    });
  }

  function caricaFit() {
    /*
     * ⛔ La verifica di memoria NON si chiede per un repository: `/fit` vuole l'id di un modello
     *   sul disco, e senza il file sul disco non c'è niente da pesare. Chiederla lo stesso
     *   significherebbe far rispondere il server su un modello che non ha — e mostrare all'utente
     *   un verdetto su una cosa che non è stata misurata.
     */
    if (bersaglio.tipo === 'repo') return Promise.resolve();
    return leggi('fit', percorsoFit(stato.id, { profilo, contextTokens }), (dati) => {
      stato.fit = dati && typeof dati === 'object' ? dati : null;
    });
  }

  function caricaCapacita() {
    return leggi('capacita', '/api/v1/model-lab/capacity', (dati) => {
      stato.capacita = dati && typeof dati === 'object' ? dati : null;
    });
  }

  /* ------------------------------- il disegno ------------------------------- */

  function bottoneIndietro() {
    const b = nodo(doc, 'button', 'talos-button talos-button--ghost talos-button--sm');
    b.type = 'button';
    b.dataset.modelloIndietro = '';
    b.append(icona(doc, 'arrow-left', 'i i--sm'), doc.createTextNode('Tutti i modelli'));
    b.addEventListener('click', () => indietro?.());
    return b;
  }

  function azioniDellaTestata() {
    const gruppo = nodo(doc, 'div', 'model-page-actions talos-cluster');
    gruppo.dataset.modelloAzioni = '';
    /*
     * ⛔ L'indirizzo si compone dal REPOSITORY, che in modalità repository c'è già prima che la
     *   risposta arrivi (`bersaglio.repo`): aspettare il manifest lascerebbe il pulsante spento
     *   per tutta la lettura, su una pagina che il repository lo conosce dalla prima riga.
     */
    const repoDelModello = String(stato.modello?.repo || bersaglio.repo || '');
    const hu = !repoDelModello || repoDelModello === REPO_IMPORTATO ? null : `https://huggingface.co/${repoDelModello}`;
    if (hu) {
      const link = nodo(doc, 'a', 'talos-button talos-button--secondary talos-button--sm');
      link.href = hu;
      link.target = '_blank';
      link.rel = 'noopener noreferrer'; // `app.js:3850` usa esattamente questa forma
      link.append(icona(doc, 'link', 'i i--sm'), doc.createTextNode('Apri su Hugging Face'));
      gruppo.append(link);
      gruppo.append(copia(doc, hu, { etichetta: 'Copia link', suggerimento: 'Copia il link del repository' }));
    }
    return gruppo;
  }

  function disegnaBarra() {
    barra.replaceChildren();
    if (typeof indietro === 'function') barra.append(bottoneIndietro());
    /*
     * ⛔ L'IDENTITÀ DELLA TOOLBAR: il nome, e una parola per dire da dove viene. È il pezzo che il
     *   mockup ha e questa pagina non aveva — prima la toolbar portava solo il pulsante indietro e
     *   le azioni, e il NOME si vedeva solo scorrendo fino al titolo.
     * ⛔ `nomeUmano` e non l'id: l'id di un modello installato è l'id del FILE
     *   (`unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-...-gguf`), e in una toolbar è illeggibile.
     */
    // ⛔ `talos-cluster` per la stessa ragione di `talos-stack` nella striscia: senza, il nome e la
    //    parola dell'origine escono incollati («GLM-4.7-Flash-GGUF**Locale**», misurato in foto il
    //    19/09/2026). Il mockup fa la stessa cosa (`.toolbar-identity{display:flex;gap:10px}`).
    const identita = nodo(doc, 'span', 'toolbar-identity talos-cluster');
    identita.dataset.modelloIdentita = '';
    const origine = origineDi(stato.modello, bersaglio);
    identita.append(doc.createTextNode(nomeUmano(stato.modello, bersaglio)), nodo(doc, 'span', '', origine));
    identita.dataset.modelloOrigine = origine;
    barra.append(identita);
    /*
     * ⛔ `talos-grow` è un PONTE, e si toglie quando arriva il foglio del mockup: là le azioni si
     *   spingono a destra da sole (`margin-left:auto`, `.model-page-actions`), quindi lo spaziatore
     *   diventa inutile — ma finché quel foglio non c'è, senza di lui le due azioni restano
     *   incollate al nome invece di stare a destra.
     */
    barra.append(nodo(doc, 'span', 'talos-grow'));
    barra.append(azioniDellaTestata());
  }

  /**
   * L'hero del mockup: glifo, soprattitolo, NOME, riga del repository, frase di chiusura.
   *
   * ⛔ La riga del percorso (`modello.path`) NON si mostra più qui: il mockup non ha un posto per
   *   una cartella in un hero, e il percorso resta nella scheda dei file, che è dove serve. Al suo
   *   posto sta il repository, che è l'identità pubblica del modello.
   */
  function disegnaTestata() {
    testata.replaceChildren();
    const dati = stato.modello ? datiModelloInstallato(stato.modello, { runtime, fit: null }) : null;
    const identita = nodo(doc, 'div', 'model-hero-identity');

    const glifo = nodo(doc, 'span', 'model-glyph model-glyph--large talos-lab__banda-glifo');
    glifo.setAttribute('aria-hidden', 'true');
    // ⛔ `robot` e non un glifo per famiglia: nel foglio di TALOS `cpu` non esiste (misurato il
    //    18/09/2026 sullo sprite) e i glifi `glyph-qwen`/`glyph-gemma` del mockup non hanno né un
    //    asset né una mappa nel prodotto.
    glifo.append(icona(doc, 'robot', 'i'));

    const testo = nodo(doc, 'div', '');
    testo.append(nodo(doc, 'div', 'eyebrow talos-eyebrow', 'Nel tuo laboratorio'));
    const nome = nodo(doc, 'h1', '', nomeUmano(stato.modello, bersaglio));
    nome.dataset.modelloNome = '';
    nome.id = `${suffisso}-titolo`;
    nome.tabIndex = -1; // il mockup lo mette raggiungibile dal salto all'ancora, non dal Tab
    testo.append(nome);

    /* La riga del repository: repo, revisione, licenza, accesso, e i due conti pubblici. */
    const rigaRepo = nodo(doc, 'p', 'model-repository talos-muted');
    rigaRepo.dataset.modelloRepo = '';
    const repo = stato.repo;
    const pezzi = [];
    const repoDelModello = String(stato.modello?.repo || bersaglio.repo || '');
    if (repoDelModello && repoDelModello !== REPO_IMPORTATO) pezzi.push(repoDelModello);
    else pezzi.push('Importato dal computer: non ha un repository');
    if (repo?.revision || bersaglio.revisione) pezzi.push(`revisione ${String(repo?.revision || bersaglio.revisione).slice(0, 12)}`);
    if (dati?.licenza) pezzi.push(dati.licenza);
    if (repo?.gated) pezzi.push('accesso limitato');
    if (repo?.pipelineTag) pezzi.push(repo.pipelineTag);
    if (Number.isFinite(repo?.downloads)) pezzi.push(`${numero.format(repo.downloads)} download`);
    if (Number.isFinite(repo?.likes)) pezzi.push(`${numero.format(repo.likes)} like`);
    rigaRepo.append(icona(doc, 'doc', 'i i--xs'), nodo(doc, 'span', 'talos-mono', pezzi.join(' · ')));
    testo.append(rigaRepo);
    identita.append(glifo, testo);
    testata.append(identita);

    // La frase del mockup, parola per parola: è copy del mockup, non un dato (vedi la testata).
    testata.append(paragrafo(doc, 'model-hero-caption', 'Conosci il modello. Scegli come usarlo.'));
    if (!remoto() && stato.modello && typeof onLiberaMemoria === 'function') {
      const comandi = nodo(doc, 'div', 'talos-cluster');
      const libera = nodo(doc, 'button', 'talos-button talos-button--secondary talos-button--sm',
        runtime.unloading ? 'Liberazione…' : 'Libera memoria');
      libera.type = 'button';
      libera.dataset.modelloLiberaMemoria = '';
      libera.disabled = !dati?.caricato || Boolean(runtime.unloading || runtime.loading || runtime.error);
      libera.addEventListener('click', () => { void onLiberaMemoria(stato.modello.id); });
      const statoMemoria = runtime.loading ? 'Verifica memoria…' : runtime.error ? 'Stato memoria non disponibile'
        : dati?.caricato ? 'Caricato in memoria' : 'Non caricato in memoria';
      comandi.append(libera, paragrafo(doc, 'talos-muted', statoMemoria + ' · Il file resta sul disco.'));
      testata.append(comandi);
    }


    /*
     * ⛔ Il modello che NON c'è si dice in testata, e non solo nella scheda «File»: la corsia ha
     *   trovato che senza questa riga una pagina montata su un id inesistente mostrava, nella
     *   scheda «card», la spiegazione dell'importazione dal computer — cioè una spiegazione
     *   INVENTATA al posto dell'errore vero («questo modello non è fra quelli installati»), che
     *   in quella scheda non aveva nessun altro posto dove comparire. La testata è l'unica
     *   superficie che si vede da tutte e tre le schede.
     */
    if (stato.errori.modello) {
      const avviso = paragrafo(doc, 'talos-muted', stato.errori.modello);
      avviso.dataset.modelloErrore = 'modello';
      avviso.setAttribute('role', 'alert');
      testata.append(avviso);
    }

    testata.append(disegnaStriscia(dati));
  }

  /**
   * La striscia del mockup (`model-context-strip`): QUATTRO caselle, ognuna `small` + `strong`.
   *
   * ⛔ Le quattro del mockup sono `DESTINAZIONE · PROFILO · STATO · NUOVE CHAT`. Le prime tre hanno
   *   un dato vero e sono queste; la quarta — «Modello predefinito» — **non ha una sorgente in
   *   questa pagina**: il modello delle nuove chat vive nel laboratorio (`#modelLabActiveModel`,
   *   scritto da `app.js`), non arriva a un componente montato in una rotta, e non esiste una rotta
   *   che lo imposti. ⇒ Al suo posto sta `VERIFICA`, che è un dato VERO (il verdetto di `/fit`), ed
   *   è elencata come non collegata nel referto della corsia. Se il chiamante passerà il modello
   *   attivo fra le opzioni di montaggio, la quarta casella può tornare a essere quella del mockup.
   * ⛔ E le caselle non si moltiplicano: erano sei (`Origine · Stato · File sul disco · Formato ·
   *   Verifica · Contesto richiesto`) e il mockup ne ha quattro. La dimensione è passata dentro
   *   «Profilo» (dove il mockup mette `GGUF · Q4_K_M`), il contesto richiesto sta nella scheda
   *   «Compatibilità», dove il numero serve davvero.
   */
  function disegnaStriscia(dati) {
    const striscia = nodo(doc, 'section', 'model-context-strip');
    striscia.dataset.modelloStriscia = '';
    striscia.setAttribute('aria-label', 'Stato del modello e del suo repository');
    const cella = (etichetta, contenuto, { icona: nomeIcona = '' } = {}) => {
      const c = nodo(doc, 'div', '');
      if (nomeIcona) c.append(icona(doc, nomeIcona, 'i i--sm'));
      /*
       * ⛔ `talos-stack` NON È DECORAZIONE: senza, l'etichetta e il valore si incollano
       *   («DestinazioneSul dispositivo», «ProfiloGGUF · Q4_K_M», misurato in foto il 19/09/2026 a
       *   1024 e a 1440) perché `small` e `strong` sono inline. Il mockup li impila
       *   (`.model-context-strip small{display:block}` + `strong{display:block}`), e `talos-stack` è
       *   la stessa cosa con il vocabolario che c'è già (`display:flex; flex-direction:column`):
       *   con il foglio del mockup le due regole dicono la stessa cosa, senza, la casella si legge
       *   lo stesso. È l'unica aggiunta «di ponte» che serve anche a foglio arrivato.
       */
      const dentro = nodo(doc, 'span', 'talos-stack');
      /*
       * ⛔ E `align-items:flex-start`, o la pastiglia si ALLARGA a tutta la casella: in una colonna
       *   flex il valore di serie è `stretch`, e una pastiglia stirata è una barra colorata che
       *   sembra un altro controllo. Misurato in foto il 19/09/2026 a 1024 (le due pastiglie
       *   «Sul disco» e «Non entra» occupavano tutta la larghezza). Con il foglio del mockup le due
       *   pastiglie tornano inline da sole (`padding:0; background:none`), e questo non dà fastidio.
       */
      dentro.style.alignItems = 'flex-start';
      dentro.append(nodo(doc, 'small', '', etichetta));
      if (typeof contenuto === 'string') dentro.append(nodo(doc, 'strong', '', contenuto));
      else dentro.append(contenuto);
      c.append(dentro);
      return c;
    };
    const eRemoto = remoto();
    // ⛔ `state: 'remote'` non è uno stato del manifest, e `datiModelloInstallato` non lo conosce:
    //    senza questo ramo un repository non installato si leggerebbe «Sul disco».
    const statoInstallato = eRemoto ? STATO_NON_INSTALLATO : (STATI_INSTALLATO[dati?.stato] || STATI_INSTALLATO.disco);

    /*
     * ⛔ LA CASELLA DELLA DESTINAZIONE NON HA IL SUO GLIFO, E LO DICO: il mockup ci mette un
     *   monitor, e nel foglio di TALOS quell'icona NON c'è (misurato il 19/09/2026 sullo sprite
     *   di `index.template.html`: `image sun ignoto camera download trash robot edit sparkles
     *   chevron-right arrow-left chevron file folder-open git link web search plus list grid files
     *   brain check-sq check more settings terminal eye code globe chev stop send bell branch
     *   shield clock play folder doc bolt user x command layout copy history mic menu diff` — e
     *   `monitor` non è fra questi, come `cpu` non lo era il 18/09). Un'icona sbagliata al posto di
     *   quella giusta è peggio di nessuna icona: `index.template.html` non è un file di questa
     *   corsia, quindi la si chiede.
     */
    striscia.append(cella('Destinazione', eRemoto ? 'Solo nel repository' : 'Sul dispositivo'));
    striscia.append(cella('Profilo', eRemoto ? profiloDelRepository() : profiloLocale(dati)));
    const pastigliaStato = badge(doc, statoInstallato.etichetta, statoInstallato.tono);
    pastigliaStato.dataset.modelloStato = eRemoto ? 'non-installato' : dati?.stato || 'disco';
    striscia.append(cella('Stato', pastigliaStato));

    if (eRemoto) {
      /*
       * ⛔ NIENTE BADGE QUI: la casella «Stato» qui sopra dice già «Non installato», e ripetere la
       *   stessa parola due volte in due caselle di fila è la trappola che questa pagina ha già
       *   pagato una volta («Sconosciuto · Sconosciuto», 18/09/2026): due parole uguali non sono
       *   una misura, sono un guasto che sembra un guasto del disegno.
       */
      striscia.append(cella('Verifica', 'Dopo l’installazione'));
      return striscia;
    }
    if (stato.fit) {
      const verdetto = verdettoMemoria(stato.fit);
      const contenuto = badge(doc, verdetto.etichetta, verdetto.tono);
      contenuto.dataset.modelloVerdetto = verdetto.chiave;
      striscia.append(cella('Verifica', contenuto));
    } else if (stato.caricamento.fit) {
      striscia.append(cella('Verifica', 'In corso…'));
    } else {
      striscia.append(cella('Verifica', 'Non ancora richiesta'));
    }
    return striscia;
  }

  /** Il profilo di un modello sul disco: il formato con la sua quantizzazione, e quanto pesa. */
  function profiloLocale(dati) {
    const formato = String(dati?.formato || 'GGUF');
    const peso = stato.modello?.bytes ? byte(stato.modello.bytes) : '';
    return peso && peso !== '—' ? `${formato} · ${peso}` : formato;
  }

  /**
   * Il profilo di un repository: quanti file porta e quanto pesa INTERO.
   *
   * ⛔ Non si dice la quantizzazione: un repository ne porta molte, e la prima (`files[0]`) non è
   *   «la» quantizzazione del modello — sarebbe un numero vero che dice una cosa falsa. La somma dei
   *   file è invece esattamente «quanto pesa il repository», e la casella non la chiama dimensione
   *   del modello.
   */
  function profiloDelRepository() {
    const quanti = Array.isArray(stato.modello?.files) ? stato.modello.files.length : null;
    if (quanti === null) return 'Repository non ancora letto';
    const peso = byte(stato.modello?.byteTotali);
    return peso === '—' ? `${quanti} file` : `${quanti} file · ${peso}`;
  }

  /* ---- scheda «card»: il README ---- */

  function disegnaCard() {
    // `readme-surface` è la classe del mockup (`.readme-surface` avvolge chrome, indice e corpo).
    const scatola = nodo(doc, 'section', 'talos-card readme-surface');
    scatola.dataset.modelloCard = '';
    const testa = nodo(doc, 'div', 'readme-chrome talos-cluster');
    /*
     * ⛔ «ANTEPRIMA EDITORIALE» E NON «MARKDOWN»: è la parola del mockup, e dice cosa si sta
     *   guardando (un'anteprima) invece di come è scritto (un formato). È anche la regola di casa
     *   «niente nomi tecnici nella UI» — `Markdown` era un nome di formato a schermo.
     */
    testa.append(icona(doc, 'doc', 'i i--sm'), nodo(doc, 'span', 'talos-mono', 'README.md'), nodo(doc, 'span', 'talos-label', 'Anteprima editoriale'));
    if (stato.repo?.revision) testa.append(badge(doc, String(stato.repo.revision).slice(0, 12), ''));
    scatola.append(testa);

    if (stato.caricamento.repo) return conTesta(scatola, paragrafo(doc, 'talos-muted', 'Lettura della scheda…'));
    if (stato.errori.repo) {
      const errore = paragrafo(doc, 'talos-muted', `La scheda non è stata letta: ${stato.errori.repo}`);
      errore.dataset.modelloErrore = 'repo';
      errore.setAttribute('role', 'alert');
      // ⛔ Col «Riprova» anche qui: senza, la scheda che non si è letta non aveva NESSUNA via
      //    d'uscita dentro la sua linguetta — il pulsante viveva solo nelle altre due schede.
      return conTesta(scatola, errore, pulsanteRicarica());
    }
    if (stato.errori.modello) {
      return conTesta(scatola,
        nodo(doc, 'h3', '', 'Il modello non è fra quelli installati'),
        paragrafo(doc, 'talos-muted', stato.errori.modello));
    }
    if (!percorsoRepo(stato.modello)) {
      /*
       * ⛔ UN REPOSITORY SENZA RISPOSTA ANCORA NON È «UN MODELLO SENZA SCHEDA»: in modalità
       *   repository il manifest nasce dalla risposta, quindi fra il montaggio e l'arrivo dei dati
       *   `stato.modello` è `null` e questa riga direbbe una cosa falsa (che non c'è nessuna scheda)
       *   su una scheda che sta arrivando. Un istante, ma è l'istante in cui si guarda la pagina.
       */
      if (remoto()) return conTesta(scatola, paragrafo(doc, 'talos-muted', 'Lettura della scheda…'));
      return conTesta(scatola,
        nodo(doc, 'h3', '', 'Questo modello non ha una scheda Hugging Face'),
        paragrafo(doc, 'talos-muted', 'Il file è stato importato dal computer: non c’è un repository da cui leggere README, revisione e impronte. I file e la compatibilità qui accanto restano quelli veri, letti dal disco e dal motore locale.'));
    }
    const readme = senzaFrontMatter(stato.repo?.readme);
    if (!readme.trim()) {
      return conTesta(scatola,
        nodo(doc, 'h3', '', 'Il repository non ha un README'),
        paragrafo(doc, 'talos-muted', `Il repository ${stato.modello.repo} non dichiara una scheda: restano la revisione, i file e la compatibilità.`));
    }

    const frammento = renderizzaMarkdown(readme, {
      document: doc,
      // ⛔ Il recinto di codice è quello della chat: barra del linguaggio, «Copia», evidenziazione.
      //   La firma del renderer è `(testo, linguaggio, chiuso)` (`markdown.js:137`).
      bloccoCodice: (testo, linguaggio, chiuso) => creaBloccoCodice({ testo, linguaggio, chiuso }, { document: doc }),
      /*
       * ⛔ QUESTE DUE RIGHE SONO LA CURA, e si accendono SOLO QUI — owner, 18/09/2026: «la scheda
       *   del modello di Hugging Face deve essere formattata in HTML».
       *   Misurato in foto (`pagina-modello-card_1080p_real.png`, 18/09): il README di
       *   `unsloth/GLM-4.7-Flash-GGUF` usciva col SORGENTE a schermo — `<div>`, `<p style=…>`,
       *   `<em><a href=…>` — e i link restavano `[Unsloth Dynamic 2.0](https://…)`, cioè sintassi.
       * ⛔ Il renderer resta quello di sempre e la CHAT NON CAMBIA: sono due opzioni spente per
       *   default, e questa scheda è l'unica che le accende. La lista di ciò che è ammesso, e il
       *   perché, stanno in `html-fidato.js`.
       */
      htmlFidato: true,
      linkMarkdown: true,
    });
    const indice = indiceDelReadme(frammento, doc, { prefisso: `${suffisso}-readme` });
    if (indice.length) {
      const rigaIndice = nodo(doc, 'nav', 'readme-index talos-cluster');
      rigaIndice.dataset.modelloIndice = '';
      rigaIndice.setAttribute('aria-label', 'Indice della scheda');
      rigaIndice.append(nodo(doc, 'span', 'talos-label', 'In questa scheda'));
      for (const voce of indice) {
        const b = nodo(doc, 'button', 'talos-button talos-button--ghost talos-button--sm', voce.breve);
        b.type = 'button';
        b.dataset.modelloIndiceVoce = voce.id;
        // Il testo intero resta raggiungibile: sull'etichetta quando è stata accorciata.
        if (voce.breve !== voce.testo) b.title = voce.testo;
        b.addEventListener('click', () => {
          const bersaglio = pannello.querySelector(`#${voce.id}`);
          if (!bersaglio) return;
          bersaglio.scrollIntoView?.({ block: 'start', behavior: accorciaMovimento() ? 'auto' : 'smooth' });
          // Il fuoco segue il salto: chi naviga da tastiera deve ripartire da lì, non dal pulsante.
          bersaglio.focus?.({ preventScroll: true });
        });
        rigaIndice.append(b);
      }
      scatola.append(rigaIndice);
    }
    // `.td-prosa-rapporto` è la superficie di prosa condivisa: il README non si veste da solo.
    const prosa = nodo(doc, 'div', 'td-prosa-rapporto readme-body');
    prosa.append(frammento);
    scatola.append(prosa);
    const immagini = disegnaImmagini();
    if (immagini) scatola.append(immagini);
    return scatola;
  }

  /**
   * LE IMMAGINI DELLA SCHEDA — e il consenso, che è la cosa importante.
   *
   * ⛔ PERCHÉ UN BLOCCO E NON UN `<img>` E BASTA. Un `<img src>` di terzi è una RICHIESTA DI RETE:
   *   parte da sola appena il nodo entra nel DOM e porta con sé `Referer` e indirizzo IP. In un
   *   README di terzi quelle immagini sono, di fatto, un pixel di tracciamento che qualcuno può
   *   aver messo lì. Le fonti del brief lo dicono con queste parole — «Markdown images are network
   *   requests, not embedded assets» — e tutti i client di posta seri hanno risolto così: blocco di
   *   serie, un comando per il caso singolo, una scelta che resta per chi vuole sempre (Gmail,
   *   Thunderbird, Postbox, Fastmail: lette il 19/09/2026, vedi la testata).
   * ⛔ E DOVE STA IL PERICOLO, QUI, MISURATO: non nel TESTO del README — il server lo ripulisce
   *   già (`hf-hub-client.mjs:14-37`, 0 `<img>` e 0 `![` sul README vero di GLM-4.7-Flash) — ma
   *   nelle `images[]` che il server restituisce a parte. Senza questo blocco, mostrarle sarebbe
   *   stato l'unico punto della pagina da cui parte una richiesta verso un terzo.
   * ⛔ NIENTE `loading="lazy"`: le fonti di questa fase coprono la richiesta di rete, non il
   *   caricamento pigro (il brief lo dice esplicitamente), e un'immagine pigra che non parte
   *   renderebbe la prova delle richieste **instabile** — cioè una prova che a volte dice zero e a
   *   volte no. Se servirà, si cercherà a parte e si citerà.
   */
  function disegnaImmagini() {
    const fuori = immaginiDellaScheda(stato.repo?.images);
    if (!fuori.quante) return null;
    const scatola = nodo(doc, 'section', 'talos-card talos-card--pad');
    scatola.dataset.modelloImmagini = String(fuori.quante);
    scatola.dataset.modelloImmaginiConsenso = stato.consenso ? 'dato' : 'negato';
    const testa = nodo(doc, 'div', 'talos-cluster');
    testa.append(
      icona(doc, 'image', 'i i--sm'),
      nodo(doc, 'h3', 'talos-lab__heading talos-grow', 'Immagini della scheda'),
      badge(doc, String(fuori.quante), ''),
    );
    scatola.append(testa);

    if (!stato.consenso) {
      const host = fuori.host.length ? fuori.host.join(', ') : 'un server esterno';
      scatola.append(paragrafo(doc, 'talos-muted',
        `Questa scheda porta ${fuori.quante} immagini da ${host}: non le carichiamo senza il tuo consenso.`));
      const comandi = nodo(doc, 'div', 'talos-cluster');
      const mostra = nodo(doc, 'button', 'talos-button talos-button--secondary talos-button--sm', 'Mostra le immagini');
      mostra.type = 'button';
      mostra.dataset.modelloImmaginiMostra = '';
      mostra.addEventListener('click', () => { stato.consenso = true; disegnaPannello(); });
      /*
       * ⛔ LA PREFERENZA CHE RESTA, e la sua forma: una casella, non un secondo pulsante. Chi vuole
       *   le immagini «adesso» e chi le vuole «sempre» sono due persone diverse, e il modello è
       *   quello delle app di posta. La casella scrive nel documento delle preferenze
       *   dell'app (`CAMPO_IMMAGINI_REMOTE`), mai in un archivio nostro.
       */
      const etichetta = nodo(doc, 'label', 'talos-cluster');
      const casella = doc.createElement('input');
      casella.type = 'checkbox';
      casella.checked = stato.consensoPersistente;
      casella.dataset.modelloImmaginiSempre = '';
      casella.addEventListener('change', () => {
        stato.consensoPersistente = casella.checked === true;
        try { porta.scrivi(stato.consensoPersistente); } catch { /* la preferenza non si scrive: resta bloccato */ }
        if (stato.consensoPersistente) { stato.consenso = true; disegnaPannello(); }
      });
      etichetta.append(casella, doc.createTextNode('Ricordalo per tutte le schede'));
      comandi.append(mostra, etichetta);
      scatola.append(comandi);
      return scatola;
    }

    const griglia = nodo(doc, 'div', 'talos-cluster');
    griglia.dataset.modelloImmaginiGriglia = '';
    for (const voce of fuori.immagini) {
      const figura = nodo(doc, 'figure', '');
      figura.dataset.modelloImmagine = voce.host;
      const img = doc.createElement('img');
      img.alt = voce.alt;
      img.decoding = 'async';
      // ⛔ `referrerpolicy` in minuscolo, scritto come attributo: la proprietà non eredita né il
      //   `<meta name="referrer">` né la testata della risposta. Con il proxy la richiesta è verso
      //   il nostro server e il referrer a terzi non arriverebbe comunque: è la cintura per il
      //   giorno in cui qualcuno tornasse a puntare un `<img>` a un indirizzo esterno.
      img.setAttribute('referrerpolicy', 'no-referrer');
      // ⛔ IL NOSTRO SERVER, NON IL SITO ESTERNO (vedi `percorsoImmagine`). E nessun
      //   `loading="lazy"` — il prodotto altrove lo usa (`app.js:3678`), qui no, e la ragione è
      //   che questa pagina DICHIARA quante richieste fa: un'immagine pigra che non parte
      //   renderebbe il conteggio una prova che a volte dice una cosa e a volte un'altra.
      img.src = percorsoImmagine(voce.url); // ← da qui in poi la richiesta parte: sopra nessun `<img>`
      /*
       * ⛔ E SE NON ARRIVA, SI DICE — con la frase che il prodotto usa già in `app.js:3683`. Il
       *   caso è vero e misurato: il proxy accetta solo `huggingface.co`/`hf.co`, e le tre immagini
       *   del README di GLM-4.7-Flash stanno su `github.com`. Un `<img>` rotto lascerebbe un buco
       *   muto; così si legge PERCHÉ non c'è.
       */
      img.addEventListener('error', () => {
        const avviso = nodo(doc, 'figcaption', 'talos-label', 'Immagine della scheda non disponibile.');
        avviso.setAttribute('role', 'status');
        figura.replaceChildren(avviso);
      });
      figura.append(img);
      if (voce.alt) figura.append(nodo(doc, 'figcaption', 'talos-label', voce.alt));
      griglia.append(figura);
    }
    scatola.append(griglia);
    const nascondi = nodo(doc, 'button', 'talos-button talos-button--ghost talos-button--sm', 'Nascondi le immagini');
    nascondi.type = 'button';
    nascondi.dataset.modelloImmaginiNascondi = '';
    nascondi.addEventListener('click', () => { stato.consenso = false; disegnaPannello(); });
    scatola.append(nascondi);
    if (stato.consensoPersistente) {
      scatola.append(paragrafo(doc, 'talos-label', 'Le immagini di ogni scheda si caricano da sole: è la preferenza «Immagini remote nelle schede», nelle Impostazioni.'));
    }
    return scatola;
  }

  function conTesta(scatola, ...figli) {
    const corpo = nodo(doc, 'div', 'talos-stack');
    corpo.style.padding = '12px 14px';
    corpo.append(...figli);
    scatola.append(corpo);
    return scatola;
  }

  /* ---- scheda «files»: i file e la verifica ---- */

  /*
   * ⛔ LA NOTA SULLA STIMA, e la sua parola è «stima», non «misura» — la stessa disciplina delle
   *   «due misure che non tornano». `/fit-estimate` NON carica il modello: confronta il peso del
   *   file con la memoria e il disco liberi **adesso** e dichiara la sua base
   *   (`basis: 'weights-only'` — misurato sul 4174 il 19/09/2026:
   *   `{bytes:18312339808, basis:'weights-only', memory:{requiredBytes:18312339808,…}, state:'blocked',
   *   reason:'memory'}`). Quello che NON stima è la cache del contesto, che si somma dopo lo
   *   scaricamento. Ricerca del 19/09/2026 su come si scrivono le stime senza farle leggere come
   *   misure: si qualifica il numero come stima, si nomina la grandezza, si dice la base e che il
   *   valore vero varia (mold, badge «est. 8.2 GB» + «Advisory — actual use varies»; osaurus PR
   *   #2512, «swap increased by N GB — growth, not onset», che separa la grandezza misurata dalla
   *   condizione dedotta; TruePPM `HeaderEstimateChip`, che sostituisce un «· estimated» criptico
   *   con «2.5 pts · Estimated» a parole intere).
   */
  const NOTA_STIMA = 'Le varianti si stimano dal peso del file (base dichiarata dal server: i soli pesi) contro la memoria e il disco liberi adesso. Non è l’esito di un caricamento: la cache del contesto si somma dopo lo scaricamento, e il valore vero varia.';

  /* --------------- la scelta del file e il download (repository non installato) --------------- */

  /**
   * IL BLOCCO DELLA SCELTA DEL FILE — quello del pannello stretto, montato qui.
   *
   * ⛔ PERCHÉ QUI E NON RISCRITTO: la scheda «File del modello» è il posto naturale della scelta
   *   della variante, della stima e dello scaricamento (è dove il mockup mette i file, ed è dove
   *   arriva il clic sulla riga della lista Hugging Face). Il blocco è di `hf-catalogo.js`
   *   (`montaSceltaFileHf`), montato con `prefissoId: 'paginaModello'`: id PROPRI, e gli id del
   *   pannello (`hfFileChoices`, `hfStima`, `hfScarica`, `hfAccesso`) restano suoi — `app.js`
   *   continua a trovarli dov'erano, e nessun id esiste due volte nel documento.
   */
  function disegnaSceltaFile() {
    const sezione = nodo(doc, 'section', 'talos-card talos-card--pad');
    sezione.dataset.modelloSceltaFile = '';
    const testa = nodo(doc, 'div', 'talos-cluster');
    testa.append(icona(doc, 'download', 'i i--sm'), nodo(doc, 'h3', 'talos-lab__heading talos-grow', 'Scegli il file da scaricare'));
    sezione.append(testa, paragrafo(doc, 'talos-label', NOTA_STIMA));

    const dove = nodo(doc, 'div', 'talos-stack');
    sezione.append(dove);
    const scelto = montaSceltaFileHf(dove, stato.repo, {
      stima: stato.hf.stima,
      scelta: stato.hf.scelta,
      prefissoId: 'paginaModello',
      document: doc,
      azioni: { scegli: scegliVariante, misura: misuraVarianti, scarica: avviaDownload },
    });
    /* La preselezione del blocco (la variante consigliata) si annota: è quella che «Scarica» prende. */
    if (scelto && !stato.hf.scelta) stato.hf.scelta = scelto.chiave;

    /*
     * ⛔ SENZA UNO SCRITTORE IL PULSANTE NON SI LASCIA ACCESO. `apiPost` è facoltativo, ma il
     *   blocco disegna il suo «Scarica» comunque: senza `azioni.scarica` (che è la stessa cosa)
     *   il pulsante non farebbe NIENTE — un controllo che promette e non mantiene, il difetto che
     *   questa casa chiama «un avviso che non può fermare è un commento a schermo». ⇒ Si spegne e
     *   si dice perché.
     */
    if (typeof apiPost !== 'function') {
      const pulsante = dove.querySelector('#paginaModelloScarica');
      if (pulsante) { pulsante.disabled = true; pulsante.title = 'La pagina è stata montata senza uno scrittore (`apiPost`): il download non può partire da qui.'; }
      sezione.append(paragrafo(doc, 'talos-label', 'Questa pagina non ha ricevuto uno scrittore (`apiPost`): il download si avvia dal pannello del laboratorio.'));
    }

    const scarica = stato.hf.scarica;
    if (scarica.inCorso) {
      const pulsante = dove.querySelector('#paginaModelloScarica');
      if (pulsante) pulsante.disabled = true;
      sezione.append(paragrafo(doc, 'talos-muted', 'Avvio del download…'));
    } else if (scarica.errore) {
      const p = paragrafo(doc, 'talos-muted', `Download non avviato: ${scarica.errore}`);
      p.dataset.modelloScaricaEsito = 'errore';
      p.setAttribute('role', 'alert');
      sezione.append(p);
    } else if (scarica.esito) {
      const p = paragrafo(doc, 'talos-muted', scarica.esito);
      p.dataset.modelloScaricaEsito = 'avviato';
      p.setAttribute('role', 'status');
      sezione.append(p);
      if (typeof apriDownload === 'function') {
        const apri = nodo(doc, 'button', 'talos-button talos-button--secondary talos-button--sm', 'Apri Download');
        apri.type = 'button';
        apri.addEventListener('click', apriDownload);
        sezione.append(apri);
      }
    }
    return sezione;
  }

  /** La variante scelta: si annota e si ridisegna (è il `scegli` del pannello, con lo stesso esito). */
  function scegliVariante(chiave) {
    stato.hf.scelta = String(chiave ?? '') || null;
    onScelta?.({ revision: stato.repo?.revision, scelta: stato.hf.scelta });
    disegnaPannello();
  }

  /**
   * La stima delle varianti: una richiesta per variante, tutte insieme, e il risultato si tiene.
   *
   * ⛔ La rotta (`GET /api/v1/local-models/fit-estimate?bytes=…`) vuole il PESO, non un id: è per
   *   questo che funziona su un repository che non è sul disco — misurato sul 4174 il 19/09/2026 con
   *   i byte veri di `GLM-4.7-Flash-Q4_K_M.gguf` (18.312.339.808): risponde
   *   `state:'blocked', reason:'memory'`. Una variante che non si riesce a stimare resta
   *   `{state:'unknown'}` — mai un numero inventato al suo posto.
   */
  function misuraVarianti(gruppi) {
    if (!Array.isArray(gruppi) || !gruppi.length) return;
    for (const g of gruppi) stato.hf.stima.set(g.chiave, { inCorso: true });
    disegnaPannello();
    Promise.all(gruppi.map(async ({ chiave, bytes }) => {
      try {
        stato.hf.stima.set(chiave, await apiGet(percorsoStima(bytes, { contextTokens })));
      } catch (errore) {
        stato.hf.stima.set(chiave, { state: 'unknown', reason: 'measurement', errore: String(errore?.message || errore) });
      }
    })).then(() => {
      // ⛔ La pagina può essere stata distrutta durante le richieste (si cambia scheda, si esce):
      //   ridisegnare allora scriverebbe su nodi staccati.
      if (!stato.distrutto) disegnaPannello();
    });
  }

  /**
   * Il download: il corpo lo costruisce `corpoDownloadHf` (la forma di `app.js:3824`), e l'esito si
   * dice a schermo — avviato o il motivo per cui non è partito.
   */
  async function avviaDownload(gruppo) {
    if (typeof apiPost !== 'function' || stato.hf.scarica.inCorso || stato.distrutto) return;
    const corpo = corpoDownloadHf(stato.repo, gruppo);
    if (!corpo) {
      stato.hf.scarica = { inCorso: false, esito: '', errore: 'La variante scelta non ha un file da scaricare.' };
      disegnaPannello();
      return;
    }
    stato.hf.scarica = { inCorso: true, esito: '', errore: '' };
    disegnaPannello();
    try {
      const esito = await apiPost('/api/v1/huggingface/download', corpo);
      if (stato.distrutto) return;
      const stato2 = esito && typeof esito.state === 'string' ? ` (${esito.state})` : '';
      // Le stesse parole del pannello (`app.js:3827`): il file e il suo peso.
      stato.hf.scarica = { inCorso: false, errore: '', esito: `Download avviato: ${corpo.files[0].path} · ${byte(corpo.bytes)}${stato2}. Prosegue nella sezione Download.` };
    } catch (errore) {
      if (stato.distrutto) return;
      stato.hf.scarica = { inCorso: false, esito: '', errore: String(errore?.message || errore) };
    }
    disegnaPannello();
  }

  function disegnaFiles() {
    const scatola = nodo(doc, 'section', 'talos-stack');
    scatola.dataset.modelloFiles = '';
    if (stato.caricamento.modello || (remoto() && stato.caricamento.repo)) return conParagrafo(scatola, 'Lettura dei file…');
    if (stato.errori.modello) return conParagrafo(scatola, stato.errori.modello, { errore: true });
    if (remoto() && stato.errori.repo) return conParagrafo(scatola, `L’elenco dei file non è stato letto: ${stato.errori.repo}`, { errore: true });

    /*
     * ⛔ IN MODALITÀ REPOSITORY I FILE SUL DISCO SONO ZERO, e la lista «locale» deve restare VUOTA:
     *   il manifest di un repository porta i suoi file (servono alla scheda, al profilo, al
     *   confronto delle impronte dopo il download), e passarli a `confrontaFile` come se fossero
     *   sul disco farebbe uscire **«Coincide col repository»** su ogni riga — cioè la pagina
     *   direbbe che un file scaricato è identico a sé stesso. Sarebbe una bugia scritta in verde.
     */
    const locali = remoto() ? [] : (Array.isArray(stato.modello?.files) ? stato.modello.files : []);
    const remoti = Array.isArray(stato.repo?.files) ? stato.repo.files : [];
    const confronto = confrontaFile(locali, remoti);
    /*
     * ⛔ LA SCELTA DEL FILE STA IN CIMA, e solo su un repository: è il gesto che quella scheda
     *   esiste per fare (il mockup ci mette i file, e il clic sulla riga della lista HF porta qui).
     *   Il blocco è quello del pannello stretto (`montaSceltaFileHf`), montato con id propri.
     *   Su un modello già sul disco non si sceglie niente — c'è — quindi la sezione non compare.
     */
    if (remoto() && stato.repo) scatola.append(disegnaSceltaFile());

    const testa = nodo(doc, 'div', 'talos-cluster');
    testa.append(nodo(doc, 'h3', 'talos-lab__heading', remoto() ? 'Tutti i file del repository' : 'File del modello'));
    if (!remoto() || locali.length) testa.append(badge(doc, `${confronto.file.length} sul disco`, ''));
    if (Array.isArray(stato.repo?.files)) testa.append(badge(doc, `${stato.repo.files.length} nel repository`, ''));
    scatola.append(testa);
    scatola.append(paragrafo(doc, 'talos-label',
      remoto()
        ? 'Questo modello non è sul disco: qui sotto ci sono i file che il repository dichiara, con l’impronta che dichiara. Dopo il download, l’impronta del file scaricato si confronta con questa.'
        : percorsoRepo(stato.modello)
          ? 'L’impronta del file sul disco confrontata con quella dichiarata dal repository.'
          : 'Il modello è importato dal computer: non c’è un repository con cui confrontare l’impronta.'));

    if (!locali.length) {
      if (remoto()) {
        if (!confronto.soloRepository.length) {
          scatola.append(paragrafo(doc, 'talos-muted', 'Il repository non elenca file nella revisione letta.'));
          return scatola;
        }
        /*
         * ⛔ NIENTE `<details>` QUI, e la ragione è che non c'è niente da nascondere: il blocco
         *   richiudibile esiste per non allungare la pagina con i file che NON servono a chi ha già
         *   scaricato. Su un repository non installato quei file SONO la pagina — è quello che si è
         *   venuti a vedere — e chiusi dietro un clic sarebbero il contenuto dietro una porta.
         */
        for (const file of confronto.soloRepository) {
          scatola.append(riga(doc, String(file.path), byte(file.sizeBytes), { chiave: 'nel-repository' }));
        }
        if (Number.isFinite(stato.modello?.byteTotali)) {
          scatola.append(riga(doc, 'Peso complessivo del repository', byte(stato.modello.byteTotali), { chiave: 'peso-repository' }));
        }
        return scatola;
      }
      scatola.append(paragrafo(doc, 'talos-muted', 'Il manifest non elenca file.'));
      return scatola;
    }
    for (const voce of confronto.file) scatola.append(disegnaFile(voce));

    if (stato.modello?.sha256) {
      const rigaModello = nodo(doc, 'div', 'talos-cluster talos-lab__space');
      rigaModello.append(
        nodo(doc, 'span', 'talos-label', 'Impronta dell’intero modello'),
        nodo(doc, 'span', 'talos-mono', improntaBreve(stato.modello.sha256)),
        copia(doc, stato.modello.sha256, { etichetta: 'Copia', suggerimento: 'Copia l’impronta SHA-256 dell’intero modello' }),
      );
      rigaModello.title = String(stato.modello.sha256);
      scatola.append(rigaModello);
    }
    if (confronto.soloRepository.length) {
      const dettagli = nodo(doc, 'details', 'talos-lab__space');
      dettagli.dataset.modelloSoloRepo = '';
      dettagli.append(nodo(doc, 'summary', '', `Altri ${confronto.soloRepository.length} file nel repository, non scaricati`));
      for (const file of confronto.soloRepository) {
        dettagli.append(riga(doc, String(file.path), byte(file.sizeBytes), { chiave: 'solo-repository' }));
      }
      scatola.append(dettagli);
    }
    return scatola;
  }

  function disegnaFile(voce) {
    const file = nodo(doc, 'article', 'talos-card talos-card--pad');
    file.dataset.modelloFile = voce.percorso;
    const esito = ESITI_FILE[voce.esito] || ESITI_FILE['non-confrontabile'];

    const identita = nodo(doc, 'div', 'talos-cluster');
    identita.append(icona(doc, 'file', 'i i--sm'), nodo(doc, 'h4', 'talos-mono talos-grow', voce.percorso));
    const etichettaEsito = badge(doc, esito.etichetta, esito.tono);
    etichettaEsito.dataset.modelloEsito = voce.esito;
    identita.append(etichettaEsito);

    const impronta = String(voce.locale?.sha256 || '');
    const rigaImpronta = nodo(doc, 'div', 'talos-kv');
    const valoreImpronta = nodo(doc, 'span', 'talos-kv__v', impronta ? improntaBreve(impronta) : 'non dichiarata');
    valoreImpronta.dataset.modelloImpronta = '';
    if (impronta) {
      valoreImpronta.title = impronta;
      /*
       * ⛔ Il valore per ULTIMO, e il pulsante PRIMA di lui — la stessa forma della provenienza in
       *   `rigaFatto`, e per la stessa ragione misurata: `.talos-kv` e' `justify-content:space-between`
       *   (`index.css:1563`), quindi un terzo figlio dopo il valore lo spinge a META' riga. In foto
       *   il 18/09/2026 il valore di questa riga finiva a x≈620 mentre «Revisione del repository» e
       *   «Impronta nel repository» — che mostrano lo STESSO numero — finivano a x≈937: due righe
       *   con la stessa impronta e la colonna spezzata.
       * ⛔ E il pulsante sta ATTACCATO all'etichetta, non sospeso a meta' riga: con tre figli il
       *   `space-between` divide lo spazio libero e il «Copia» finisce al centro (stessa foto:
       *   etichetta a x≈36, «Copia» a x≈730, valore a x≈1300). Etichetta e pulsante in un
       *   `.talos-cluster` (`index.css:252`, 32 usi nel prodotto) riportano i figli a DUE: primo a
       *   sinistra, valore a destra, e niente in mezzo.
       */
      const testaImpronta = nodo(doc, 'div', 'talos-cluster');
      testaImpronta.append(nodo(doc, 'span', 'talos-kv__k', 'Checksum SHA-256 sul disco'),
        copia(doc, impronta, { etichetta: 'Copia', suggerimento: 'Copia l’impronta SHA-256 intera' }));
      rigaImpronta.append(testaImpronta, valoreImpronta);
    } else {
      rigaImpronta.append(nodo(doc, 'span', 'talos-kv__k', 'Checksum SHA-256 sul disco'), valoreImpronta);
    }

    file.append(
      identita,
      /*
       * ⛔ La dimensione e' una RIGA come le sue compagne, non un'etichetta col valore incollato
       *   dentro. Prima era `paragrafo(doc,'talos-label','Dimensione 4,4 GB')` — misurato nella foto
       *   del 18/09/2026: nella stessa card tre righe avevano il valore a DESTRA (`riga()`) e questa
       *   ce l'aveva attaccato all'etichetta, perche' il valore non stava in una cella `.talos-kv__v`.
       *   ⇒ Oltre a disallinearsi, quel numero era invisibile a ogni lettura che passa dalle celle
       *   (il test leggeva `.talos-label`, cioe' un'etichetta): era l'unico numero della card fuori
       *   da ogni elenco di valori. Il prodotto la dimensione la dice cosi' — `kv('File sul disco',
       *   dati.dimensione, 'modelloDimensione')`, `modelli-installati.js:147` — quindi la forma giusta
       *   era gia' in casa e non una nuova.
       */
      riga(doc, 'Dimensione', byte(voce.locale?.bytes), { chiave: 'dimensione' }),
      rigaImpronta,
      riga(doc, 'Revisione del repository', voce.remoto?.revision || String(stato.repo?.revision || '').slice(0, 12) || (voce.remoto ? 'non dichiarata' : '—'), { chiave: 'revisione' }),
      riga(doc, 'Impronta nel repository', voce.remoto?.sha256 ? improntaBreve(voce.remoto.sha256) : (voce.remoto ? 'non dichiarata' : 'il file non è elencato'), { chiave: 'impronta-repository' }),
    );
    if (voce.esito === 'diverso') {
      const avviso = paragrafo(doc, 'talos-muted',
        'Le due impronte non coincidono: il file sul disco non è quello che il repository dichiara per questo percorso.');
      avviso.setAttribute('role', 'alert');
      file.append(avviso);
    }
    if (voce.locale?.security) {
      file.append(riga(doc, 'Esito della scansione', String(voce.locale.security), { chiave: 'security' }));
    }
    return file;
  }

  /* ---- scheda «compatibility»: memoria, contesto, capacità ---- */

  function disegnaCompatibilita() {
    const scatola = nodo(doc, 'section', 'talos-stack');
    scatola.dataset.modelloCompatibilita = '';
    /*
     * ⛔ UN REPOSITORY NON HA UN VERDETTO, E NON SE NE INVENTA UNO. `/fit` risponde su un modello
     *   che sta sul disco: chiederlo per un id che non è installato sarebbe una richiesta che il
     *   server non può servire, e disegnare una stima al suo posto sarebbe un numero che nessuno ha
     *   misurato — la malattia che questa pagina ha già curato due volte («Non verificato» con la
     *   barra sotto, e «Sconosciuto · Sconosciuto»). Le cose vere che si possono dire sono tre: il
     *   modello non è sul disco, che cosa dichiara il repository, e com'è fatta QUESTA macchina.
     */
    if (remoto()) {
      const card = nodo(doc, 'section', 'talos-card talos-card--pad');
      card.append(nodo(doc, 'h3', 'talos-lab__heading', 'Memoria e spazio'));
      const quanti = Array.isArray(stato.modello?.files) ? stato.modello.files.length : 0;
      const dichiara = quanti
        ? `Il repository dichiara ${quanti} file${Number.isFinite(stato.modello?.byteTotali) ? `, ${byte(stato.modello.byteTotali)} in tutto` : ''}.`
        : 'Il repository non elenca file nella revisione letta.';
      card.append(paragrafo(doc, 'talos-muted',
        `Questo modello non è ancora sul disco: la verifica pesa il file che hai, e senza il file non c’è niente da pesare. ${dichiara} La stima si fa dopo il download — e il peso di una singola quantizzazione è quello del file che scaricherai, non il totale del repository.`));
      scatola.append(card);
      scatola.append(disegnaMacchina());
      return scatola;
    }
    if (stato.caricamento.fit) {
      conParagrafo(scatola, 'Verifica della memoria in corso…');
      scatola.append(disegnaMacchina());
      return scatola;
    }
    if (stato.errori.fit) {
      /*
       * ⛔ Se il VERDETTO non riesce, la MACCHINA si mostra lo stesso: sono due letture diverse, e
       *   la misura della macchina non dipende dal modello. Insieme all'errore arriva il «Riprova».
       */
      conParagrafo(scatola, `La verifica non è riuscita: ${stato.errori.fit}`, { errore: true });
      scatola.append(disegnaMacchina());
      return scatola;
    }
    if (!stato.fit) return conParagrafo(scatola, 'Verifica non ancora richiesta.');

    const verdetto = verdettoMemoria(stato.fit);
    const card = nodo(doc, 'section', 'talos-card talos-card--pad');
    const testa = nodo(doc, 'div', 'talos-cluster');
    testa.append(nodo(doc, 'h3', 'talos-lab__heading', 'Memoria e spazio'));
    const etichettaVerdetto = badge(doc, verdetto.etichetta, verdetto.tono);
    etichettaVerdetto.dataset.modelloVerdetto = verdetto.chiave;
    testa.append(etichettaVerdetto);
    card.append(testa);
    if (verdetto.dettaglio) card.append(paragrafo(doc, 'talos-muted', verdetto.dettaglio));

    /*
     * ⛔ `<meter>` e non `<progress>`: è una grandezza dentro un intervallo, non un compito che
     *   avanza (MDN + W3C APG «Meter Pattern», letti il 18/09/2026 — scambiarli è l'errore più
     *   comune del pattern). Niente `aria-valuenow`: su un `<meter>` nativo sarebbe una seconda
     *   fonte di verità. L'etichetta accessibile è invece obbligatoria, e il valore resta scritto
     *   anche come testo (qui sotto, riga per riga) — in contrasto forzato la barra sparisce.
     */
    const richiesti = stato.fit.memory?.requiredBytes;
    const liberi = stato.fit.memory?.availableBytes;
    /*
     * ⛔ La barra NON si disegna accanto a «Non verificato»: se il server dichiara di non aver
     *   potuto misurare la macchina, una percentuale richiesto/libero lì sotto sarebbe una cifra
     *   che nessuno ha misurato — e per giunta colorata d'allarme. La barra vive solo dove il
     *   verdetto poggia su quei due numeri (o li accompagna: `chat-only` e «Non entra»).
     */
    if (verdetto.chiave !== 'ignoto' && Number.isFinite(richiesti) && Number.isFinite(liberi) && liberi > 0) {
      const percento = Math.min(100, Math.round((richiesti / liberi) * 100));
      const meter = nodo(doc, 'meter', 'talos-lab__meter');
      meter.dataset.modelloMeter = '';
      meter.min = 0; meter.max = 100; meter.low = 75; meter.high = 90; meter.optimum = 0;
      meter.value = percento;
      meter.setAttribute('aria-label', `Memoria richiesta ${byte(richiesti)} su ${byte(liberi)} liberi: ${percento} per cento`);
      card.append(meter);
    }
    // ⛔ «Memoria» è la RAM, «spazio» è il disco: due grandezze diverse che il server chiama
    //    entrambe `availableBytes` (`local-runtime-probe.mjs:251-252`). Le etichette lo dicono.
    card.append(
      riga(doc, 'Memoria richiesta', byte(richiesti), { chiave: 'memoria-richiesta' }),
      riga(doc, 'RAM libera', byte(liberi), { chiave: 'ram-libera' }),
      riga(doc, 'Spazio richiesto sul disco', byte(stato.fit.storage?.requiredBytes), { chiave: 'spazio-richiesto' }),
      riga(doc, 'Spazio allocabile sul disco', byte(stato.fit.storage?.availableBytes), { chiave: 'spazio-allocabile' }),
    );
    card.append(paragrafo(doc, 'talos-label', 'La memoria è la RAM; lo spazio è il disco. Non sono la stessa grandezza, anche quando il server le chiama uguale.'));
    scatola.append(card);

    const contesto = nodo(doc, 'section', 'talos-card talos-card--pad talos-lab__space');
    contesto.append(nodo(doc, 'h3', 'talos-lab__heading', 'Contesto e capacità'));
    contesto.append(paragrafo(doc, 'talos-label', `Verifica per il profilo «${String(stato.fit.profile || profilo)}».`));
    const ispezione = stato.fit.inspection || {};
    // ⛔ Ogni fatto porta con sé la sua provenienza, e si vede: `osservato` e `dichiarato` non
    //    valgono uguale, e ciò che il runtime non ha visto resta «Sconosciuto».
    // ⛔ I conteggi di token passano da `contestoK`: `32768` e `32k token` nella stessa card
    //    sarebbero due modi di scrivere la stessa grandezza.
    const TOKEN = { numeri: contestoK };
    const fatti = [
      ['Contesto richiesto dalla verifica', { value: contestoK(stato.fit.context?.requestedTokens) || '—' }],
      ['Contesto addestrato', ispezione.context?.trainedTokens, TOKEN],
      ['Contesto del runtime', ispezione.context?.runtimeTokens, TOKEN],
      ['Contesto efficace', ispezione.context?.effectiveTokens, TOKEN],
      ['Template di chat', ispezione.template],
      ['Attrezzi', ispezione.capabilities?.tools],
      ['Chiamate di attrezzo', ispezione.capabilities?.toolCalls],
      ['Ruolo di sistema', ispezione.capabilities?.systemRole],
      ['Modello servito dal runtime', { value: ispezione.runtime?.servingModelId || (ispezione.runtime?.reachable ? 'nessuno' : 'runtime non raggiungibile') }],
    ];
    for (const [etichetta, fatto, opzioni] of fatti) contesto.append(rigaFatto(doc, etichetta, fatto, opzioni));
    /*
     * ⛔ `backend` e `build` sono FATTI TIPIZZATI (`{ state, value }` — `local-runtime-probe.mjs:21`),
     *   non stringhe. `filter(Boolean)` non li scarta (un oggetto e' *truthy*) e `join(' · ')` su
     *   due oggetti stampa **`[object Object] · [object Object]`**: e' quello che si leggeva nella
     *   scheda Compatibilita', misurato il 18/09/2026 sul 4174 (referto della ricognizione).
     * ⛔ La cura NON e' a monte: il server manda la forma giusta. Si legge il **valore** con
     *   `testoFatto`, la stessa funzione che usano le righe sorelle qui sopra (`:988-991`), che
     *   passano i fatti a `rigaFatto` e li sanno leggere. Solo questa riga li concatenava a mano.
     */
    /*
     * ⛔ E DUE VOLTE LA STESSA PAROLA NON È UNA MISURA — visto nella foto
     *   `pagina-modello-compatibility_1440p_real.png` del 18/09/2026: la riga diceva
     *   «Sconosciuto · Sconosciuto». `backend` e `build` sono DUE fatti, e quando il runtime non è
     *   raggiungibile sono ignoti TUTTI E DUE: ripetere la parola non aggiunge niente e sembra un
     *   guasto del rendering. ⇒ Si tiene la prima occorrenza di ogni testo, in ordine: due valori
     *   diversi restano due (`Vulkan · b6421`), due valori uguali diventano uno.
     * ⛔ Il `filter` è per INDICE, non per valore: `filter(v => Set.has(v))` toglierebbe anche i
     *   doppioni legittimi in mezzo, e comunque qui l'ordine è quello dei fatti.
     */
    const backend = [ispezione.backend, ispezione.build]
      .map((fatto) => testoFatto(fatto))
      .filter((testo, indice, tutti) => testo && testo !== '—' && tutti.indexOf(testo) === indice)
      .join(' · ');
    const rigaBackend = paragrafo(doc, 'talos-muted talos-mono talos-lab__space', backend || 'Backend non dichiarato dal runtime.');
    // ⛔ Un aggancio per la prova: questa riga è il difetto `[object Object]`, e un test che la
    //   cercasse per classe la confonderebbe con le altre della card.
    rigaBackend.dataset.modelloBackend = '';
    contesto.append(rigaBackend);
    if (ispezione.observedAt) {
      const quando = new Date(ispezione.observedAt);
      contesto.append(paragrafo(doc, 'talos-label', Number.isNaN(quando.getTime()) ? 'Misura senza data.' : `Misurato ${quando.toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}.`));
    }
    scatola.append(contesto);

    scatola.append(disegnaMacchina());
    return scatola;
  }

  function disegnaMacchina() {
    const card = nodo(doc, 'section', 'talos-card talos-card--pad talos-lab__space');
    card.append(nodo(doc, 'h3', 'talos-lab__heading', 'Questa macchina'));
    if (stato.caricamento.capacita) { card.append(paragrafo(doc, 'talos-muted', 'Misurazione…')); return card; }
    if (stato.errori.capacita) {
      const errore = paragrafo(doc, 'talos-muted', `Capacità non misurata: ${stato.errori.capacita}`);
      errore.setAttribute('role', 'alert');
      card.append(errore);
      card.append(pulsanteRicarica());
      return card;
    }
    let misura = null;
    try { misura = datiMemoria(stato.capacita, [], {}); } catch { misura = null; }
    if (!misura) { card.append(paragrafo(doc, 'talos-muted', 'La misura della capacità non è disponibile.')); return card; }
    /*
     * ⛔ Le etichette sono quelle della card della memoria del Model Lab (`misura-memoria.js:13`),
     *   ma qui NON si ripetono le righe che il verdetto ha già scritto con le sue parole: nella
     *   stessa schermata due righe col medesimo nome e due numeri diversi — o due unità diverse —
     *   sono la trappola delle «due misure che non tornano». Il verdetto dice quanto serve e quanto
     *   ce n'è; questa card dice com'è fatta la macchina.
     */
    card.append(
      riga(doc, 'RAM totale', byte(misura.totale), { chiave: 'ram-totale' }),
      riga(doc, 'RAM in uso', `${byte(misura.usata)} (${numero.format(Math.round(misura.percentuale))}%)`, { chiave: 'ram-in-uso' }),
      riga(doc, 'Disponibile sul disco', byte(misura.discoDisponibile), { chiave: 'disco-disponibile' }),
      riga(doc, 'Riserva sul disco', byte(misura.discoRiserva), { chiave: 'disco-riserva' }),
      riga(doc, 'Allocabile sul disco', byte(misura.discoAllocabile), { chiave: 'disco-allocabile' }),
    );
    const contestoMacchina = [stato.capacita?.platform, stato.capacita?.arch].filter(Boolean).join(' · ');
    if (contestoMacchina) card.append(paragrafo(doc, 'talos-muted talos-mono', contestoMacchina));
    return card;
  }

  function pulsanteRicarica() {
    const b = nodo(doc, 'button', 'talos-button talos-button--ghost talos-button--sm', 'Riprova');
    b.type = 'button';
    b.dataset.modelloRicarica = '';
    b.disabled = Boolean(ricaricaInCorso);
    b.addEventListener('click', () => ricarica());
    return b;
  }

  function conParagrafo(scatola, testo, { errore = false } = {}) {
    const p = paragrafo(doc, 'talos-card talos-card--pad talos-muted', testo);
    p.setAttribute('role', errore ? 'alert' : 'status');
    if (errore) p.dataset.modelloErrore = '';
    scatola.append(p);
    if (errore) scatola.append(pulsanteRicarica());
    return scatola;
  }

  function disegnaPannello() {
    let contenuto;
    if (stato.scheda === 'files') contenuto = disegnaFiles();
    else if (stato.scheda === 'compatibility') contenuto = disegnaCompatibilita();
    else contenuto = disegnaCard();
    pannello.replaceChildren(contenuto);
    pannello.dataset.modelloPannello = stato.scheda;
    /*
     * APG «Tabs»: un pannello senza niente da focalizzare vuole `tabindex="0"`, così la tastiera
     * può raggiungerne il contenuto; se dentro c'è già roba focalizzabile, un secondo punto di
     * tabulazione è solo un intoppo. I titoli del README hanno `tabindex="-1"` e non contano.
     */
    pannello.tabIndex = pannello.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])') ? -1 : 0;
  }

  function disegna() {
    if (stato.distrutto) return;
    disegnaBarra();
    disegnaTestata();
    disegnaPannello();
  }

  function vaiA(scelta) {
    if (!SCHEDE.includes(scelta) || stato.distrutto) return;
    stato.scheda = scelta;
    schede.seleziona(scelta);
    disegnaPannello();
    onScheda?.(scelta);
  }

  function ricarica() {
    if (stato.distrutto) return Promise.resolve();
    if (ricaricaInCorso) return ricaricaInCorso;
    generazioneLettura++;
    stato.errori = { modello: '', fit: '', capacita: '', repo: '' };
    stato.repo = null;
    // ⛔ In modalità repository il manifest È la risposta: senza questa riga un «Riprova» dopo un
    //   errore ridisegnerebbe il profilo e i file della risposta VECCHIA (o di nessuna), cioè un
    //   numero che sta lì mentre la pagina dice che sta leggendo.
    if (remoto()) stato.modello = null;
    /*
     * ⛔ Anche il REPOSITORY si rilegge, e dopo la lista: `percorsoRepo` vuole il modello, e senza
     *   questa seconda lettura una scheda che non era stata letta resterebbe nell'errore per
     *   sempre — un «Riprova» che promette una cosa e ne fa un'altra.
     */
    ricaricaInCorso = Promise.resolve().then(() => caricaModello())
      .then(() => Promise.all([caricaRepo(), caricaFit(), caricaCapacita()]))
      .finally(() => { ricaricaInCorso = null; disegna(); });
    disegna();
    return ricaricaInCorso;
  }

  function distruggi() {
    stato.distrutto = true;
    radice.remove?.();
  }

  /* ------------------------------- l'avvio ------------------------------- */

  disegna();
  const avvio = [];
  avvio.push(caricaFit());
  avvio.push(caricaCapacita());
  if (stato.modello) {
    // Il repository si legge dal manifest che ci hanno dato: niente lista da chiedere.
    avvio.push(caricaRepo());
  } else {
    const generazioneAvvio = generazioneLettura;
    avvio.push(caricaModello().then(() => { if (!stato.distrutto && generazioneAvvio === generazioneLettura) return caricaRepo(); }));
  }
  Promise.all(avvio).catch(() => {}); // gli errori sono già raccolti e disegnati da `leggi`

  return {
    vaiA,
    ricarica,
    aggiornaRuntime(nuovo) {
      if (stato.distrutto) return;
      runtime = nuovo || {};
      disegnaTestata();
    },
    distruggi,
    elemento: radice,
    get stato() { return stato; },
  };
}
