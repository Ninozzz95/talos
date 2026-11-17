/*
 * ⭐ Fase 8, §3.5 strada A (owner 01/11/2026, D2: «copia sul server, la finestra applica e risponde») — LA COPIA SUL SERVER delle
 *   preferenze della finestra.
 *
 * Fino a oggi tema, lingua, movimento e chat vivevano SOLO nel `localStorage` della finestra (`talos.harness.desktop.settings.v1`): il
 * server non li conosceva, e il modello non poteva né leggerli né cambiarli a finestra chiusa. Qui il server ne tiene una copia:
 *   · la finestra la manda quando la persona cambia qualcosa (`PUT /api/v1/app-settings/window`) e la rilegge all'avvio;
 *   · il modello la cambia (attraverso `app_settings`), e l'evento `talos.impostazioni-finestra` la porta alle finestre del PC, che
 *     applicano e rispondono con ciò che hanno applicato (Hermes `theme.apply`, `server-requests.ts:111-124, 724-731`).
 * `revisione` cresce a ogni cambio VERO (un invio uguale non la muove): è il cursore con cui la finestra sa se la copia è più nuova.
 * ⛔ Solo valori semplici (testo, numero, sì/no), al più 200 campi: è un documento di preferenze, non un archivio.
 */
import { readFile, stat } from 'node:fs/promises';
import { scriviAtomico } from '../research-store.mjs';

export const SCHEMA_COPIA_FINESTRA = 'talos.window-preferences.v1';
export const CAMPI_MASSIMI_COPIA = 200;
const NOME_CAMPO = /^[A-Za-z][A-Za-z0-9]{0,63}$/u;

const errore = (messaggio) => Object.assign(new Error(messaggio), { code: 'WINDOW_PREFERENCES_INVALID' });

/** I soli campi validi: nome semplice, valore testo (≤ 200), numero finito o sì/no. Il resto si scarta, mai un errore muto a metà. */
export function valoriDellaCopia(grezzi) {
  if (!grezzi || typeof grezzi !== 'object' || Array.isArray(grezzi)) throw errore('Window preferences must be an object.');
  const voci = Object.entries(grezzi);
  if (voci.length > CAMPI_MASSIMI_COPIA) throw errore(`Window preferences hold at most ${CAMPI_MASSIMI_COPIA} fields.`);
  const puliti = {};
  for (const [campo, valore] of voci) {
    if (!NOME_CAMPO.test(campo)) continue;
    if (typeof valore === 'boolean' || (typeof valore === 'number' && Number.isFinite(valore)) || (typeof valore === 'string' && valore.length <= 200)) puliti[campo] = valore;
  }
  return puliti;
}

const uguali = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const NOME_MIGRAZIONE = /^[a-z0-9][a-z0-9.-]{0,63}$/u;
/*
 * 0.2.2-DL, giro 4 (revisione del giro 2, reperto 4) — CIÒ CHE NON CONOSCE RESTA SUL DISCO, UGUALE. La migrazione aggiunge una scrittura
 *   all'avvio: prima toglieva i campi di primo livello di una versione più nuova e i nomi di migrazione fuori forma, che prima sparivano
 *   solo al primo cambio vero. Ora l'elenco `migrazioni` si rilegge com'è (i nomi nuovi si aggiungono in fondo) e gli altri campi di primo
 *   livello si riscrivono dopo i nostri. Come Hermes `hermes_cli/config.py:1359-1368` (`_merge_partial_save`: «Omitted top-level sections
 *   are preserved»); ricerca web del 09/11/2026 (la guida «migrate-config» di Zeph: le chiavi
 *   aggiunte che non conosce restano; brainos-core `config/migrate.rs`: migrazione solo in avanti, chiavi più nuove tollerate).
 */
const CAMPI_NOSTRI = new Set(['schema', 'revisione', 'valori', 'aggiornataIl', 'migrazioni']);
const estraneiLetti = (letto) => Object.fromEntries(Object.entries(letto).filter(([campo]) => !CAMPI_NOSTRI.has(campo)));
/*
 * Giro 4 (reperto 4) — la copia in SOLA LETTURA. Su Windows un file con l'attributo di sola lettura non si sostituisce col rename
 *   (MoveFileExW: EPERM), e `scriviAtomico` ritenta 1,3 s e lascia `.non-rinominato`: a OGNI avvio, perché il timbro non arriva mai sul
 *   disco. La migrazione allora non scrive: vale in memoria. Node, `fs.chmod`: «on Windows only the write permission can be changed»
 *   (la documentazione, letta il 09/11/2026): il bit di scrittura del proprietario È l'attributo. Su POSIX il rename sostituisce anche
 *   un file 0444 (decide la cartella): lì non si guarda.
 */
async function inSolaLettura(file) {
  if (process.platform !== 'win32') return false;
  try { return ((await stat(file)).mode & 0o200) === 0; } catch { return false; }
}

/*
 * 0.2.2-DL, giro 3 (decisione dell'owner del 09/11/2026 21:57, «Spente, rispetta la scelta») — LE MIGRAZIONI UNA VOLTA SOLA.
 *   Il file porta `migrazioni`: i nomi di quelle già fatte, il TIMBRO. Una migrazione si registra con `migraUnaVolta(nome, decidi)`:
 *   · gira solo se il suo nome non è nel timbro, e solo su una copia LETTA DAL DISCO (scritta da una versione di prima): una copia nata
 *     in questo processo (nessun file, file illeggibile) è già della versione nuova e riceve solo il timbro;
 *   · `decidi(valori)` ⇒ `{ valori, avanza }`; i valori nuovi, il timbro e la revisione vanno sul disco in UNA scrittura atomica
 *     (`scriviAtomico`, temporaneo + rename): un arresto a metà lascia o tutto il prima o tutto il dopo, mai il timbro senza lo scarto;
 *   · la revisione avanza se i valori cambiano, o se `avanza` (un valore che resta ma che le finestre devono riprendere);
 *   · ogni scrittura dopo porta il timbro con sé (`salva`), così un valore scritto dopo il timbro non si migra mai più;
 *   · `leggi` aspetta la migrazione: nessuno legge il valore di prima.
 *   Come Hermes `hermes_cli/config.py:1240-1243` (`config["_config_version"] = latest_ver` poi `_persist_migration(config)`: il numero
 *   di versione si scrive con la migrazione, nella stessa scrittura) e `:1140-1146` («a migration may only persist values that DIFFER
 *   from the schema default… A migration is Hermes' own write, never a user turning a feature off»). Ricerca web del 09/11/2026:
 *   Bitcoin Core #8407 (un valore di serie scritto sul disco senza che la persona l'abbia toccato blocca il cambio del valore di serie;
 *   un timbro di versione e un aggiornatore per il SOLO cambio di quella versione) e MongoDB COMPASS-6525 (stesso guasto).
 *
 * 0.2.2-DL, giro 5 (revisione GIALLA del giro 3, reperto D1) — UNA MIGRAZIONE «NON DECISA» NON ASPETTA IL RIAVVIO, e finché aspetta
 *   nessuno le scrive sopra. `decidi` che lancia lascia la migrazione IN SOSPESO: si ritenta in questa sessione, quando lo chiede chi
 *   l'ha registrata (`ritentaMigrazioni`) e comunque prima di ogni `scriviCampi` e di ogni `dallaFinestra` (stessa fila). Finché è in
 *   sospeso, per i soli campi che la migrazione dichiara (`campi`):
 *   · la finestra che manda un valore DIVERSO da quello in sospeso non l'ha mai visto (manda il suo valore di serie con l'aspetto
 *     intero): non è una scelta, quel campo non si scrive e gli altri sì. Scriverlo perdeva per sempre una scelta con la ricevuta;
 *   · la finestra che manda lo STESSO valore l'ha scelto in questa versione (lei mostrava l'altro): la migrazione si chiude com'è, col
 *     timbro, senza aspettare `decidi`. Lo stesso vale per la persona che lo riconferma da un'altra porta (`confermaInSospeso`);
 *   · la finestra che legge la copia (`leggi({ perLaFinestra })`) non riceve quei campi: un valore non deciso non le si manda;
 *   · chi si chiude dopo un'attesa lo dice a chi l'ha registrata (`quandoSiChiude`), che lo porta alle finestre aperte.
 *   Come Hermes `cron/jobs.py:1461` («repaired in memory; the next load retries the persist»: ciò che non si è potuto fare si ritenta
 *   alla prossima occasione) e `:1536-1537` («a stale writer would otherwise clobber concurrent creates»: chi scrive senza aver visto
 *   non copre ciò che non conosce). Ricerca web del 10/11/2026: WiredTiger WT-13363 («file operations… can be blocked by an anti-virus»:
 *   il ritento esteso a EBUSY), Zed #30222 (la migrazione delle impostazioni su Windows col file tenuto da un altro processo: si ripiega,
 *   non si rinuncia), microsoft/apm #440 (ritenti con attesa crescente, 5 in circa 3 s: un file che resta bloccato fallisce lo stesso,
 *   per questo qui si ritenta alle occasioni dopo). Node, `fs.rm` `maxRetries` (documentazione v22, letta il 10/11/2026): ritenti contati
 *   su EBUSY e EPERM, di serie zero.
 */
/**
 * @param {{ file?: string|null, adesso?: () => number, scriviFn?: typeof scriviAtomico }} p — senza file la copia vive in memoria (le
 *   prove, un ospite senza cartella). `scriviFn` solo per le prove (contare le scritture, farne fallire una).
 */
export function creaCopiaFinestra({ file = null, adesso = () => Date.now(), scriviFn = scriviAtomico } = {}) {
  let stato = null;
  let coda = Promise.resolve();
  let migrazioniInCorso = Promise.resolve();
  /* giro 5: la migrazione rimasta «non decisa» in questo processo — `{ nome, decidi, campi, quandoSiChiude }` — o `null` */
  let inSospeso = null;
  const inFila = (lavoro) => { const prossimo = coda.then(lavoro, lavoro); coda = prossimo.catch(() => {}); return prossimo; };

  async function carica() {
    if (stato) return stato;
    let letto = null;
    if (file) {
      try { letto = JSON.parse(await readFile(file, 'utf8')); } catch { letto = null; }
    }
    stato = letto && letto.schema === SCHEMA_COPIA_FINESTRA && Number.isSafeInteger(letto.revisione)
      ? { revisione: letto.revisione, valori: (() => { try { return valoriDellaCopia(letto.valori); } catch { return {}; } })(), aggiornataIl: letto.aggiornataIl ?? null,
        migrazioni: Array.isArray(letto.migrazioni) ? [...letto.migrazioni] : [], estranei: estraneiLetti(letto), dalDisco: true }
      : { revisione: 0, valori: {}, aggiornataIl: null, migrazioni: [], estranei: {}, dalDisco: false };
    return stato;
  }
  /* il timbro (`migrazioni`) va sul disco con OGNI scrittura: chi scrive dopo la migrazione non lo perde; e con lui ciò che non conosce */
  async function salva(prossimo) {
    const pieno = { revisione: prossimo.revisione, valori: prossimo.valori, aggiornataIl: prossimo.aggiornataIl,
      migrazioni: prossimo.migrazioni ?? stato?.migrazioni ?? [], estranei: stato?.estranei ?? {}, dalDisco: stato?.dalDisco === true };
    if (file) await scriviFn(file, `${JSON.stringify({ schema: SCHEMA_COPIA_FINESTRA, revisione: pieno.revisione, valori: pieno.valori, aggiornataIl: pieno.aggiornataIl, migrazioni: pieno.migrazioni, ...pieno.estranei }, null, 1)}\n`);
    stato = pieno;
    return { revisione: pieno.revisione, valori: { ...pieno.valori } };
  }
  const avvisaChiusa = (m) => { try { m.quandoSiChiude?.({ revisione: stato.revisione, valori: { ...stato.valori } }); } catch { /* l'annuncio non cambia mai l'esito */ } };
  /** Un tentativo della migrazione `m` (il primo, o un ritento): l'esito come lo dice `migraUnaVolta`. */
  async function migra(m, ritento) {
    const { nome, decidi } = m;
    const s = await carica();
    if (s.migrazioni.includes(nome)) return 'gia-fatta';
    const migrazioni = [...s.migrazioni, nome];
    if (!s.dalDisco) { stato = { ...s, migrazioni }; return 'nuova'; }
    let esito;
    try { esito = await decidi({ ...s.valori }, { ritento }); } catch { inSospeso = m; return 'non-decisa'; }
    inSospeso = null;
    let valori;
    try { valori = valoriDellaCopia(esito?.valori ?? s.valori); } catch { return 'non-decisa'; }
    const muove = !uguali(valori, s.valori) || esito?.avanza === true;
    const prossimo = { revisione: muove ? s.revisione + 1 : s.revisione, valori, aggiornataIl: muove ? new Date(adesso()).toISOString() : s.aggiornataIl, migrazioni };
    const inMemoria = () => { stato = { ...s, ...prossimo, dalDisco: true }; return 'non-scritta'; };
    if (file && await inSolaLettura(file)) return inMemoria(); // giro 4: niente 1,3 s di ritenti né `.non-rinominato` a ogni avvio
    try { await salva(prossimo); return 'fatta'; } catch { return inMemoria(); }
  }
  /* giro 5: il ritento di ciò che è in sospeso, DENTRO la fila. Decisa adesso ⇒ lo sa chi l'ha registrata (le finestre aperte). */
  async function ritenta() {
    const m = inSospeso;
    if (!m) return null;
    const esito = await migra(m, true);
    if (esito === 'fatta' || esito === 'non-scritta') avvisaChiusa(m);
    return esito;
  }
  /*
   * giro 5: il valore in sospeso è stato scelto di nuovo in questa versione ⇒ la migrazione `m` si chiude com'è: `valori` (quelli di
   *   adesso, più ciò che la finestra porta), il timbro e la revisione che avanza (le finestre chiuse la riprendono all'avvio) in UNA
   *   scrittura. Se cambia SOLO il timbro, un disco che non si scrive non diventa un errore per chi ha scelto: vale in memoria e va sul
   *   disco con la prossima scrittura (e la sola lettura non si tenta, come nel giro 4).
   */
  async function chiudi(m, valori) {
    const s = await carica();
    const prossimo = { revisione: s.revisione + 1, valori, aggiornataIl: new Date(adesso()).toISOString(), migrazioni: [...s.migrazioni, m.nome] };
    const soloIlTimbro = uguali(valori, s.valori);
    if (soloIlTimbro && file && await inSolaLettura(file)) stato = { ...s, ...prossimo };
    else {
      try { await salva(prossimo); } catch (e) { if (!soloIlTimbro) throw e; stato = { ...s, ...prossimo }; }
    }
    inSospeso = null;
    avvisaChiusa(m);
    return { revisione: stato.revisione, valori: { ...stato.valori } };
  }
  /*
   * 0.2.2-DL, giro 6 (controllore del giro 5, R-A; owner 10/11/2026 22:51) — CIÒ CHE ASPETTA SI DICE. Finché una migrazione è in
   *   sospeso la finestra mostra il suo valore e il modello legge quello del disco: possono essere opposti, e nessuno dei due lo sapeva.
   *   `sospesi()` ⇒ i campi in sospeso col valore che il modello legge, o `null`. Vanno alla finestra in `nonConfermati`, FUORI da
   *   `valori` (la regola del giro 5 resta: un valore non deciso non si applica e non si salva in locale): lei li confronta con ciò che
   *   mostra e, se sono diversi, mette un segno accanto all'interruttore. D'accordo ⇒ il campo `nonConfermati` non c'è proprio.
   *   Come Hermes `apps/desktop/src/app/settings/billing/keep-going-on-credits-row.test.tsx:70` («one line under the switch, the switch
   *   stays on»: lo stato che il server non ha ancora preso si dice con una riga sotto l'interruttore, senza muoverlo).
   */
  function sospesi() {
    const m = inSospeso;
    if (!m || !stato) return null;
    const voci = m.campi.filter((c) => Object.hasOwn(stato.valori, c)).map((c) => [c, stato.valori[c]]);
    return voci.length ? Object.fromEntries(voci) : null;
  }
  const coiSospesi = (copia) => { const ns = sospesi(); return ns ? { ...copia, nonConfermati: ns } : copia; };

  return Object.freeze({
    /**
     * `{ revisione, valori }` com'è adesso (dopo le migrazioni registrate). giro 5, `perLaFinestra`: senza i campi di una migrazione in
     * sospeso — un valore che nessuno ha ancora deciso non va alla finestra, che lo scriverebbe in locale e lo rimanderebbe come suo.
     * giro 6: quei campi le arrivano a parte, in `nonConfermati` (solo se ce ne sono), per il segno accanto all'interruttore.
     */
    async leggi({ perLaFinestra = false } = {}) {
      await migrazioniInCorso;
      const s = await carica();
      const valori = { ...s.valori };
      if (perLaFinestra && inSospeso) for (const c of inSospeso.campi) delete valori[c];
      return perLaFinestra ? coiSospesi({ revisione: s.revisione, valori }) : { revisione: s.revisione, valori };
    },
    /** giro 6: i campi di una migrazione in sospeso col valore che il modello legge (`{}` se niente aspetta). Non decide e non scrive niente. */
    async nonConfermati() {
      await migrazioniInCorso;
      await carica();
      return sospesi() ?? {};
    },
    /**
     * Una migrazione una volta sola (vedi sopra). ⇒ `'fatta'` (scritta), `'gia-fatta'` (nel timbro), `'nuova'` (copia nata qui: solo il
     * timbro, in memoria, che va sul disco con la prima scrittura), `'non-scritta'` (la scrittura è fallita, o il file è in sola lettura e
     * non si tenta: valori e timbro valgono in
     * memoria e vanno sul disco insieme con la prossima scrittura) o `'non-decisa'` (`decidi` ha lanciato: niente cambia, niente timbro;
     * resta IN SOSPESO e si ritenta in questa sessione, vedi sopra, e comunque al prossimo avvio). Mai un errore.
     * `decidi(valori, { ritento })`: `ritento` è vero dal secondo tentativo. `campi`: i campi della copia che la migrazione decide.
     * `quandoSiChiude({ revisione, valori })`: chiamata quando una migrazione rimasta in sospeso si chiude (mai al primo tentativo).
     */
    migraUnaVolta(nome, decidi, { campi = [], quandoSiChiude = null } = {}) {
      if (!NOME_MIGRAZIONE.test(String(nome)) || typeof decidi !== 'function') return Promise.resolve('non-valida');
      const m = { nome, decidi, campi: Array.isArray(campi) ? campi.filter((c) => NOME_CAMPO.test(String(c))) : [], quandoSiChiude: typeof quandoSiChiude === 'function' ? quandoSiChiude : null };
      const lavoro = inFila(() => migra(m, false)).catch(() => 'non-decisa');
      migrazioniInCorso = migrazioniInCorso.then(() => lavoro);
      return lavoro;
    },
    /** giro 5: ritenta adesso la migrazione in sospeso (chi l'ha registrata sa quando ciò che mancava è tornato). ⇒ l'esito, o `null`. Mai un errore. */
    ritentaMigrazioni() { return inFila(ritenta).catch(() => 'non-decisa'); },
    /**
     * giro 5: uno di questi campi è stato scelto di nuovo, uguale, da una porta che non scrive niente quando il valore non cambia
     * (`/settings` della persona): se una migrazione in sospeso lo decide, si chiude com'è. ⇒ vero se si è chiusa. Mai un errore.
     */
    confermaInSospeso(campi = []) {
      return inFila(async () => {
        const m = inSospeso;
        if (!m || !Array.isArray(campi) || !m.campi.some((c) => campi.includes(c))) return false;
        await chiudi(m, (await carica()).valori);
        return true;
      }).catch(() => false);
    },
    /** Il modello cambia alcuni campi: la revisione avanza solo se cambia qualcosa. */
    scriviCampi(patch) {
      return inFila(async () => {
        await ritenta(); // giro 5: prima di ogni scrittura
        const s = await carica();
        const valori = { ...s.valori, ...valoriDellaCopia(patch) };
        if (uguali(valori, s.valori)) return { revisione: s.revisione, valori: { ...s.valori } };
        return salva({ revisione: s.revisione + 1, valori, aggiornataIl: new Date(adesso()).toISOString() });
      });
    },
    /**
     * La finestra manda il suo documento (la persona ha cambiato qualcosa): sostituisce i campi che porta, tiene gli altri.
     * giro 6: se dopo questo invio una migrazione aspetta ancora, la risposta porta `nonConfermati` (vedi `sospesi`).
     */
    dallaFinestra(valoriFinestra) {
      return inFila(async () => coiSospesi(await (async () => {
        const portati = valoriDellaCopia(valoriFinestra);
        /* giro 5: con una migrazione in sospeso i suoi campi non si prendono a occhi chiusi (vedi in testa) */
        const m = inSospeso;
        let scelto = false;
        if (m) {
          const inAttesa = (await carica()).valori;
          const decisi = m.campi.filter((c) => Object.hasOwn(inAttesa, c));
          scelto = decisi.some((c) => portati[c] === inAttesa[c]);
          if (!scelto) { await ritenta(); for (const c of decisi) delete portati[c]; }
        }
        const s = await carica();
        const valori = { ...s.valori, ...portati };
        if (scelto) return chiudi(m, valori);
        if (uguali(valori, s.valori)) return { revisione: s.revisione, valori: { ...s.valori } };
        return salva({ revisione: s.revisione + 1, valori, aggiornataIl: new Date(adesso()).toISOString() });
      })()));
    },
  });
}
