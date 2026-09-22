/*
 * L9 (12/09/2026) — LA RACCOLTA VIVA: il collettore portato, messo DENTRO la corsa vera.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Che cosa c'era prima di questo file, e perché non bastava
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `collector.mjs` è il porto fedele di `researchCollector.ts`: dato un ramo, cerca, legge le
 * prime pagine e tiene il testo. È provato, è puro, e l'I/O gli entra da `deps` — ma sul
 * desktop NON GIRAVA. La ricerca approfondita qui è una sessione figlia che parla col kernel e
 * chiama `web_search` e `naviga` quando vuole lei: non c'è nessun punto in cui qualcuno chiami
 * `talosResearchCollect(deps, ramo)`. Conseguenza misurata l'11 e il 12/09: giornale con TRE
 * eventi (`run_started`, `run_finished` e poco altro), `Piano` e `Speso` vuoti a schermo, le
 * fonti mai tenute su disco, e quindi le affermazioni depositate tutte «non verificate» —
 * perché senza il testo della pagina non c'è niente contro cui confrontare un passaggio.
 *
 * ⛔ La cura NON è far guidare il collettore al posto della figlia. Il motore del mobile
 *   decide lui che cosa cercare; qui è il modello a decidere, ed è il prodotto che l'owner ha
 *   scelto (una ricerca che ragiona, non uno scraper con un piano fisso). Costringere la figlia
 *   dentro `talosResearchCollect` vorrebbe dire buttare via la parte che funziona.
 *
 * ⇒ Questo file è il PONTE: gli attrezzi che la figlia usa davvero (`web_search`, `naviga`)
 *   passano da qui, e qui succede esattamente quello che il collettore faceva — la cache della
 *   corsa (`fetch-cache.mjs`), il budget di pagina (`page-budget.mjs`), il testo TENUTO
 *   (`fonti/<sha256>.txt`), la spesa CONTATA — più la cosa che il collettore non poteva fare da
 *   solo: ogni passo finisce nel GIORNALE, che è ciò che rende la corsa riprendibile.
 *
 * ⛔⛔ LA PORTA È UNA SOLA, ed è deliberato: questo oggetto espone `around(descrittore,
 *   produttore)`, cioè la STESSA firma di `fetch-cache.mjs`. Il kernel riceve un `cacheWeb` e
 *   non sa (e non deve sapere) se dietro c'è la cache nuda o la raccolta: un secondo punto di
 *   aggancio nel kernel sarebbe un secondo contratto da tenere allineato, ed è il modo in cui
 *   due strade divergono in silenzio. Il kernel resta condiviso col mobile e non importa una
 *   sola riga di `src/research/`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Ricerca web PRIMA di scrivere — fonti primarie, lette il 12/09/2026
 * ═══════════════════════════════════════════════════════════════════════════
 * (`WebSearch` esaurito, 200/200 — come per L1-L6: fonti primarie via `WebFetch`.)
 *
 *  - **Anthropic, «How we built our multi-agent research system»**
 *    (<https://www.anthropic.com/engineering/multi-agent-research-system>): «agents typically
 *    use about 4× more tokens than chat interactions, and multi-agent systems use about **15×**
 *    more tokens than chats». ⇒ è il numero che giustifica il «costo detto prima» del piano: su
 *    una corsa che costa quindici volte una chat, scoprire la spesa DOPO non è un dettaglio di
 *    presentazione. Stessa pagina: «The LeadResearcher begins by thinking through the approach
 *    and **saving its plan to Memory to persist the context**» e «we built systems that can
 *    **resume from where the agent was** when the errors occurred» — le due cose che questo
 *    lotto aggiunge alla corsa, non inventate qui.
 *  - **Gao et al., «Enabling Large Language Models to Generate Text with Citations»**
 *    (arXiv:2305.14627, 24/05/2023, rev. 31/10/2023 — benchmark ALCE): «on the ELI5 dataset,
 *    even the best models **lack complete citation support 50% of the time**». ⇒ il passaggio
 *    che il modello dichiara non è una prova finché qualcuno non lo ritrova nel testo della
 *    pagina: è esattamente ciò per cui il testo va TENUTO, e perché tenerlo è un lotto e non un
 *    optional.
 *
 * ⛔ Il vincolo che la ricerca ha aggiunto e che non conoscevo: il costo di una corsa
 *   multi-agente non è dominato dalla generazione ma dalla RILETTURA del contesto. È la ragione
 *   per cui qui si conta la FINESTRA (ciò che arriva al modello) e non il testo conservato:
 *   conservare di più non costa un token, mostrare di più sì.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * L'attribuzione al ramo — una CONVENZIONE dichiarata, non una misura
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Il giornale vuole un `branchId` per ogni passo, e il modello non riceve gli id dei rami (sono
 * un dato del server: `b1`, `b2`, …). L'attribuzione è quindi **per ordine di arrivo**: la
 * prima ricerca distinta è il ramo 1 del piano, la seconda il ramo 2, e così via; oltre il
 * piano si usano nomi `oltre-N` che NON esistono nel piano, così nessuno li scambi per rami
 * approvati. Le letture di pagina ereditano il ramo della ricerca che le ha trovate.
 *
 * ⛔ Perché è onesta abbastanza: la consegna della figlia ADESSO elenca le linee d'indagine del
 *   piano, nell'ordine (`research-orchestrator.promptRicerca`), quindi l'ordine non è un
 *   sorteggio — è quello che le abbiamo chiesto di seguire. Ma resta una convenzione: ciò che è
 *   **esatto** è il conteggio (quante ricerche, quante pagine, quanti caratteri); ciò che è
 *   **approssimato** è a quale ramo appartengano, e serve a una cosa sola — dire a una ripresa
 *   quali linee sono ancora aperte. Dichiararlo qui costa una riga; scoprirlo dopo costa una
 *   diagnosi sbagliata.
 * ⛔ E la chiave del passo è derivata dal CONTENUTO (la chiave di cache del descrittore), mai da
 *   un contatore: la stessa ricerca fatta due volte è LO STESSO passo, che è la regola che
 *   `run.mjs` scrive a lettere maiuscole («un nome nuovo è un passo che nessuno può riconoscere
 *   come già fatto — il modo in cui un giro ripreso paga due volte la stessa ricerca»).
 */

import { createHash } from 'node:crypto';

import { talosResearchFetchKey } from './fetch-cache.mjs';
import { TALOS_RESEARCH_HEAD_SHARE, talosResearchPageBudget } from './page-budget.mjs';
import { talosResearchStepIdFor } from './run.mjs';

/**
 * @typedef {import('./run.mjs').TalosResearchBranch} TalosResearchBranch
 * @typedef {import('./collector.mjs').TalosResearchSource} TalosResearchSource
 * @typedef {import('./fetch-cache.mjs').TalosResearchFetchDescriptor} TalosResearchFetchDescriptor
 */

/**
 * Quanto testo di una pagina si CONSERVA sul desktop.
 *
 * ⛔ Diverso dal telefono di proposito, e il numero ha una ragione: sul mobile
 * (`collector.mjs`) il tetto è 20.000 caratteri perché l'intero dossier vive in un database
 * solo. Qui ogni fonte è un file suo in `fonti/<sha256>.txt`, e il collettore lo dice in chiaro
 * («Sul desktop il dossier sta su disco e non in un database solo: chi lo sa alza questo, e il
 * budget resta sotto»). 200.000 caratteri sono ~50 pagine di prosa: abbastanza per ritrovare un
 * passaggio un anno dopo, abbastanza poco da non riempire un disco con una corsa.
 * ⛔ E resta SOPRA la finestra mostrata al modello: ciò che si conserva non è ciò che si mostra,
 *   e invertirli renderebbe inutile il budget.
 */
export const TALOS_RESEARCH_CONSERVA_DESKTOP = 200_000;

/**
 * ⛔⛔⛔⭐⭐⭐ TROVATO DAL VIVO IL 12/09/2026 — IL BUDGET DA 15.000 NON PASSAVA DALLA PORTA.
 *
 * Il rapporto L6 ha misurato su **430 pagine vere** che 15.000 caratteri (testa 75%, coda 25%)
 * sono il taglio giusto, e `TALOS_RESEARCH_PAGE_BUDGET` vale quello. Ma il risultato di un
 * attrezzo, nel kernel, viene tagliato a **8.000 caratteri** prima di entrare nel messaggio
 * `role:'tool'` (`talosHarness.mjs`: `String(esito).slice(0, 8_000)`, salvo `contextHooks`
 * attivi). ⇒ una finestra da 15.191 caratteri arrivava al modello **senza il marcatore e senza
 * la coda**: cioè esattamente le due cose per cui il budget esiste, tolte in silenzio da un
 * tetto che sta in un altro file e che nessuno aveva confrontato col primo.
 *
 * ⛔ L'ho trovato perché un test lo ha fatto fallire (`CHIUSURA` non arrivava), non perché
 *   l'avessi previsto: due tetti su due file diversi, scritti in due lotti diversi, e il più
 *   stretto vince senza dirlo. È la firma del difetto che questo repo chiama «il cancello che
 *   non guardava tutto».
 *
 * ⛔ Perché NON si alza il tetto del kernel: quel `slice` vale per OGNI attrezzo di OGNI harness,
 *   TALOS-BANCO compreso — cambiarlo sposterebbe il profilo di token di ogni campagna per una
 *   ragione che riguarda una sola funzione. Si abbassa la finestra, che è la cosa locale.
 *
 * ⇒ 7.500, e il numero è ARITMETICA, non una scelta tonda. Il tetto conta **tutto** ciò che
 *   finisce nella stringa, e la finestra non è solo testa+coda:
 *     7.500  i caratteri MOSTRATI (`cap`, cioè testa + coda: è ciò che `page-budget` garantisce)
 *     + ~190 il MARCATORE, che porta dentro il percorso della fonte (`fonti/<64 esadecimali>.txt`)
 *     +  ~60 la riga di testa di `naviga` (`HTTP 200 · <url>\n`)
 *     ─────
 *       ~7.750 su 8.000 — con margine, invece che al pelo.
 *   ⛔ La prima versione di questa costante era **7.800** e continuava a perdere la coda: il
 *     marcatore non era nel conto. È lo stesso difetto una seconda volta, in miniatura — un
 *     tetto confrontato con un numero che non è quello vero — e l'ha trovato di nuovo il test,
 *     non il ragionamento.
 *   ⇒ Resta comunque quasi il DOPPIO dei 4.000 di oggi, e soprattutto porta la CODA, che il
 *     taglio di oggi non porta mai.
 * ⛔ E quando `contextHooks` è attivo il tetto del kernel non si applica: allora questa finestra
 *   è più stretta del necessario. Dichiarato, non risolto — legare i due significherebbe far
 *   dipendere il budget da una configurazione che qui dentro non si vede.
 */
export const TALOS_RESEARCH_FINESTRA_SOTTO_IL_KERNEL = 7_500;

/** Quattro caratteri per token: la stessa regola pratica di `collector.mjs`, non una seconda. */
const CARATTERI_PER_TOKEN = 4;

/** @param {string} testo */
function normalizza(testo) {
  return String(testo ?? '').replace(/\s+/g, ' ').trim();
}

/** @param {string} valore */
function impronta12(valore) {
  return createHash('sha256').update(String(valore), 'utf8').digest('hex').slice(0, 12);
}

/**
 * ⛔ `null` invece di lanciare: una data che la fonte non dichiara è `null`, mai una
 * supposizione — è la stessa regola di `formattaRisultatiRicerca` nel kernel («una data assente
 * si DICHIARA, mai una supposizione»).
 *
 * @param {unknown} valore
 * @returns {string | null}
 */
function dataDichiarata(valore) {
  return typeof valore === 'string' && valore.trim().length > 0 ? valore.trim() : null;
}

/**
 * La raccolta di UNA corsa.
 *
 * @param {object} opzioni
 * @param {{around: (d: TalosResearchFetchDescriptor, p: () => Promise<any>) => Promise<{value:any, fromCache:boolean, key:string}>, snapshot?: () => any, restore?: (i:any) => number, stats?: () => any}} opzioni.cache
 *   La cache vera della corsa (`fetch-cache.mjs`). ⛔ Obbligatoria: senza, questa classe
 *   sarebbe una seconda implementazione della stessa idea.
 * @param {(evento: object) => Promise<void> | void} opzioni.registra
 *   Una riga nel giornale. ⛔ Un guasto del giornale NON deve fermare la corsa: chi la passa
 *   inghiotte già l'errore (`research-orchestrator.registra`), e qui non si ricontrolla —
 *   due `catch` sullo stesso guasto sono due politiche che divergono.
 * @param {(testo: string) => Promise<{ref: string, giaPresente: boolean}>} opzioni.tieniFonte
 *   Deposita il testo di una pagina e torna il suo `fonti/<sha256>.txt`.
 * @param {(voce: {url: string, ref: string, titolo: string, dataDichiarata: string|null, ottenuta: 'page'|'snippet'}) => Promise<void> | void} [opzioni.annotaFonte]
 *   L'indice url → ref, che è ciò che permette a una VERIFICA dopo un riavvio di ritrovare il
 *   testo. Senza, la verifica funziona finché il processo vive e non un minuto di più.
 * @param {() => readonly TalosResearchBranch[]} [opzioni.piano] I rami approvati, per l'attribuzione.
 * @param {number} [opzioni.tettoFinestra] Caratteri mostrati al modello.
 * @param {number} [opzioni.tettoConservato] Caratteri conservati su disco.
 */
export function creaRaccoltaViva({
  cache,
  registra,
  tieniFonte,
  annotaFonte = null,
  piano = () => [],
  tettoFinestra = TALOS_RESEARCH_FINESTRA_SOTTO_IL_KERNEL,
  tettoConservato = TALOS_RESEARCH_CONSERVA_DESKTOP,
}) {
  /** chiave di cache → id del passo. Il nome di un passo è derivato, mai contato. */
  const passoPerChiave = new Map();
  /** url (richiesto E finale) → la finestra già calcolata per quella pagina. */
  const finestraPerUrl = new Map();
  /** url → la fonte raccolta, col testo TENUTO. È ciò che la verifica legge. */
  const fontiPerUrl = new Map();
  /** Quante ricerche distinte sono già passate: decide il ramo della prossima. */
  let ricercheDistinte = 0;
  /** Il ramo dell'ultima ricerca: le pagine aperte dopo appartengono a lei. */
  let ramoCorrente = null;

  /** @param {TalosResearchFetchDescriptor} descrittore */
  function nomeDelPasso(descrittore) {
    const chiave = talosResearchFetchKey(descrittore);
    const gia = passoPerChiave.get(chiave);
    if (gia) return { ...gia, chiave, nuovo: false };

    if (descrittore.kind === 'search') {
      const rami = piano() ?? [];
      const ramo = ricercheDistinte < rami.length
        ? rami[ricercheDistinte].id
        // ⛔ `oltre-N` e non `b<N>`: un id che non è nel piano non deve poter essere scambiato
        //   per un ramo approvato da chi rilegge il giornale.
        : `oltre-${ricercheDistinte + 1 - rami.length}`;
      ricercheDistinte += 1;
      ramoCorrente = ramo;
      const voce = { stepId: talosResearchStepIdFor(ramo, 'search'), branchId: ramo, stepKind: /** @type {const} */ ('search') };
      passoPerChiave.set(chiave, voce);
      return { ...voce, chiave, nuovo: true };
    }

    const ramo = ramoCorrente ?? (piano()?.[0]?.id ?? 'oltre-1');
    const voce = {
      // ⛔ L'impronta dell'URL dentro il nome: due pagine dello stesso ramo sono due passi, e
      //   la stessa pagina riaperta è LO STESSO passo, qualunque cosa sia successa in mezzo.
      stepId: `${ramo}:read:${impronta12(descrittore.url ?? '')}`,
      branchId: ramo,
      stepKind: /** @type {const} */ ('read'),
    };
    passoPerChiave.set(chiave, voce);
    return { ...voce, chiave, nuovo: true };
  }

  /**
   * @param {string} testo
   * @param {string} url
   * @returns {{finestra: string, omessi: number}}
   */
  function finestraDi(testo, url) {
    const tagliata = talosResearchPageBudget(testo, {
      cap: tettoFinestra,
      headShare: TALOS_RESEARCH_HEAD_SHARE,
      /*
       * ⛔ Il riferimento è il PERCORSO VERO del testo tenuto, non una promessa: il marcatore
       *   dice al modello dove sta il resto, e `page-budget.mjs` tace quando non c'è un
       *   deposito («chi non ha un deposito non passa niente»). Qui c'è, perché la fonte è già
       *   stata scritta prima di calcolare la finestra.
       */
      reference: fontiPerUrl.get(url)?.riferimento ?? null,
    });
    return { finestra: tagliata.window, omessi: tagliata.omitted };
  }

  /**
   * Tiene una pagina: il testo su disco, la voce nell'indice, la finestra in memoria.
   *
   * @param {string} url
   * @param {string} corpo
   * @param {{titolo?: string, pubblicato?: string|null, ottenuta?: 'page'|'snippet'}} [extra]
   */
  async function tieni(url, corpo, extra = {}) {
    const testo = normalizza(corpo).slice(0, tettoConservato);
    if (testo.length === 0) return null;
    const ottenuta = extra.ottenuta ?? 'page';
    let ref = null;
    try {
      ({ ref } = await tieniFonte(testo));
    } catch {
      /*
       * ⛔ Una fonte che non si è potuta SCRIVERE non ferma la corsa, esattamente come il
       *   giornale: si perde la ri-verifica di quella pagina, non il lavoro già pagato. Ma la
       *   fonte resta in memoria, quindi la verifica di QUESTA corsa la vede lo stesso.
       */
      ref = null;
    }
    const voce = {
      url,
      title: extra.titolo || url,
      publishedAt: dataDichiarata(extra.pubblicato),
      text: testo,
      obtained: ottenuta,
      ref,
      riferimento: ref ? { percorso: ref } : null,
    };
    fontiPerUrl.set(url, voce);
    if (annotaFonte && ref) {
      try {
        await annotaFonte({
          url, ref, titolo: voce.title, dataDichiarata: voce.publishedAt, ottenuta,
        });
      } catch { /* come sopra: l'indice è un risparmio, non una condizione per lavorare. */ }
    }
    return voce;
  }

  return Object.freeze({
    /**
     * LA PORTA. Stessa firma di `fetch-cache.around`, e il kernel non distingue le due.
     *
     * @template T
     * @param {TalosResearchFetchDescriptor} descrittore
     * @param {() => Promise<T>} produttore
     * @returns {Promise<{value: T, fromCache: boolean, key: string}>}
     */
    async around(descrittore, produttore) {
      const passo = nomeDelPasso(descrittore);
      await registra({ kind: 'step_started', stepId: passo.stepId, branchId: passo.branchId, stepKind: passo.stepKind });

      let esito;
      try {
        esito = await cache.around(descrittore, produttore);
      } catch (guasto) {
        /*
         * ⛔ `step_failed`, e poi si RILANCIA. Il giornale registra che quel passo ha provato e
         *   non ce l'ha fatta — che è diverso da «interrotto» (`run.mjs`: «il primo è un
         *   risultato, il secondo è una domanda») — ma l'errore appartiene al kernel, che sa
         *   dirlo al modello. Inghiottirlo qui trasformerebbe una pagina bloccata in una
         *   pagina vuota, cioè in un silenzio.
         */
        await registra({
          kind: 'step_failed', stepId: passo.stepId,
          error: guasto instanceof Error ? guasto.message : String(guasto),
        });
        throw guasto;
      }

      if (descrittore.kind === 'search') {
        const righe = Array.isArray(esito.value) ? esito.value : [];
        /*
         * ⛔ Gli estratti dei risultati si TENGONO come fonti `snippet`, e non è zelo: se la
         *   figlia cita una pagina che non ha mai aperto, senza questo la verifica direbbe «la
         *   fonte citata non esiste fra quelle raccolte» — un motivo FALSO per un fatto vero
         *   («l'ha vista solo dall'elenco»). `resolved: 'snippet'` è la risposta giusta, e
         *   `report.mjs` la stampa come «solo estratto dal motore di ricerca».
         * ⛔ Ma non si sovrascrive una pagina già APERTA con il suo estratto: una prova più
         *   debole non deve poter cancellare una più forte.
         */
        for (const riga of righe) {
          const url = typeof riga?.url === 'string' ? riga.url : '';
          if (!url || fontiPerUrl.has(url)) continue;
          await tieni(url, riga?.snippet ?? '', {
            titolo: riga?.title, pubblicato: riga?.pubblicato ?? riga?.publishedAt, ottenuta: 'snippet',
          });
        }
        const caratteri = righe.reduce(
          (t, r) => t + String(r?.title ?? '').length + String(r?.url ?? '').length + String(r?.snippet ?? '').length,
          0,
        );
        await registra({
          kind: 'step_finished', stepId: passo.stepId,
          spend: {
            // ⛔ Servita dalla cache ⇒ NON è stata pagata. Contarla renderebbe invisibile il
            //   risparmio proprio nel numero fatto per mostrare il costo (`collector.mjs`).
            searches: esito.fromCache ? 0 : 1,
            pages: 0,
            tokens: Math.ceil(caratteri / CARATTERI_PER_TOKEN),
          },
          resultRef: null,
        });
        return esito;
      }

      const pagina = esito.value ?? {};
      const urlRichiesto = descrittore.url ?? '';
      const urlFinale = typeof pagina?.url === 'string' && pagina.url ? pagina.url : urlRichiesto;
      const tenuta = await tieni(urlFinale, pagina?.corpo ?? '');
      const { finestra, omessi } = tenuta ? finestraDi(tenuta.text, urlFinale) : { finestra: '', omessi: 0 };
      // Indicizzata su ENTRAMBI gli indirizzi: il modello ha chiesto il primo, la pagina ha
      // risposto col secondo dopo i reindirizzamenti, e chi cerca la finestra può avere l'uno o
      // l'altro in mano.
      finestraPerUrl.set(urlFinale, finestra);
      if (urlRichiesto) finestraPerUrl.set(urlRichiesto, finestra);
      await registra({
        kind: 'step_finished', stepId: passo.stepId,
        spend: {
          searches: 0,
          pages: esito.fromCache ? 0 : 1,
          // ⛔ Si contano i caratteri della FINESTRA, non del testo conservato: i token si
          //   pagano su ciò che arriva al modello. Identica scelta e identica riga in
          //   `collector.mjs`.
          tokens: Math.ceil((finestra.length || 0) / CARATTERI_PER_TOKEN),
        },
        resultRef: tenuta?.ref ?? null,
      });
      if (omessi > 0) { /* il marcatore lo dice già dentro la finestra: niente evento in più. */ }
      return esito;
    },

    /**
     * Che cosa vede il modello di questa pagina. `null` = «non lo so», e chi chiama ricade sul
     * suo taglio di sempre invece di mostrare il vuoto.
     *
     * @param {string} url
     * @param {string} corpo
     * @returns {Promise<string | null>}
     */
    async paginaLetta(url, corpo) {
      const gia = finestraPerUrl.get(url);
      if (typeof gia === 'string') return gia;
      /*
       * ⛔ Il ripiego esiste per un caso reale, non per simmetria: `naviga` può arrivare qui
       *   senza essere passato da `around` (una versione futura del kernel, un test che aggancia
       *   solo questo). Meglio una finestra calcolata al volo che nessuna.
       */
      const tenuta = await tieni(url, corpo ?? '');
      if (!tenuta) return null;
      const { finestra } = finestraDi(tenuta.text, url);
      finestraPerUrl.set(url, finestra);
      return finestra;
    },

    /**
     * Le fonti raccolte, nell'ordine in cui sono arrivate. ⛔ Col `text` TENUTO: è ciò che la
     * verifica confronta col passaggio citato, e senza il quale ogni affermazione resta «non
     * verificata» per mancanza di prova invece che per mancanza di giudice.
     *
     * @returns {readonly (TalosResearchSource & {ref: string|null})[]}
     */
    fonti() {
      return [...fontiPerUrl.values()].map(({ riferimento, ...resto }) => resto);
    },

    /** url → testo tenuto. La mappa che la verifica usa per riempire `source.text`. */
    testiPerUrl() {
      const mappa = new Map();
      for (const [url, voce] of fontiPerUrl) mappa.set(url, voce.text);
      return mappa;
    },

    /** Quanti passi distinti sono stati nominati finora. Per i test e per le sonde, mai per il modello. */
    passiNominati() {
      return passoPerChiave.size;
    },

    /** La cache vera che sta sotto: chi deve salvarne l'istantanea la prende da qui. */
    cacheSottostante() {
      return cache;
    },
  });
}
