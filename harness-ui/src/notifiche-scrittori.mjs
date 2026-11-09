/*
 * Gli scrittori del registro delle notifiche del PC — contratto «notifiche» (31/10/2026, bozza 2, OK di CLI, Performance e Mobile):
 * «le voci le scrive il server dagli eventi che ha già; la pagina non le calcola più». Si aggancia al registro delle sessioni
 * (`createSessionRegistry({ osservatoreNotifiche })`), che chiama `evento(info, evento)` per ogni evento che resta nella storia e
 * `eliminata(sessionId)` dopo una cancellazione riuscita.
 *
 * La regola è quella che la finestra applicava da sola (`legacy/app.js`, `aggiornaNotifiche`), ora in un posto solo:
 * - un permesso o una domanda in attesa notifica SEMPRE, anche da una figlia (la porta apre la conversazione radice, dove la carta si
 *   disegna) e anche da un giro di un'automazione;
 * - la fine di un giro (`fine`), un giro fermato (`interrotta`) e un errore (`errore`) solo per le conversazioni della persona: mai
 *   per una figlia (le deleghe hanno la loro scheda) né per un giro di un'automazione (arriva da «Da guardare», che sa se ha qualcosa
 *   da dire). E solo quando l'evento chiude davvero un giro aperto: un avviso su una chat ferma non è una fine.
 * - la risposta a un permesso o a una domanda la risolve; una sessione eliminata risolve tutte le sue voci.
 *
 * `azione` è il `tipo` del nucleo così com'è (`scrivi`, `file_edit`, `shell`, …): le frasi della finestra e del telefono sono già
 * indicizzate su quel codice. L'id viene dalla fonte (sessione + richiesta o giro), quindi la stessa carta rigiocata è la stessa voce.
 */

import { approvabileFuori, datoDellAzione } from './approvabile-fuori.mjs';

const FERMATO = new Set(['fermato']); // `RunError.code` di un giro fermato dalla persona (session-registry, «Ferma tutto»)

/* L'id di una voce scritta qui: `<fatto>:<sessione>:<chiave>`. La sessione può contenere «:» (`ID_SESSIONE` lo ammette): la chiave è
   dopo l'ULTIMO «:», il fatto prima del primo. */
const FATTI_IN_ATTESA = new Set(['approvazione', 'domanda']);
export function partiDellId(id) {
  if (typeof id !== 'string') return null;
  const a = id.indexOf(':');
  const b = id.lastIndexOf(':');
  return a > 0 && b > a + 1 ? { fatto: id.slice(0, a), sessionId: id.slice(a + 1, b), chiave: id.slice(b + 1) } : null;
}

const testoDellaDomanda = (questions) => {
  const prima = Array.isArray(questions) ? questions[0] : null;
  const t = prima && typeof prima === 'object' ? (prima.question ?? prima.domanda ?? prima.header ?? '') : '';
  return typeof t === 'string' && t.trim() ? { genere: 'testo', valore: t } : null;
};

const istanteDi = (evento, adesso) => {
  const t = evento?.timestamp;
  if (typeof t === 'number' && Number.isFinite(t)) return new Date(t).toISOString();
  if (typeof t === 'string' && !Number.isNaN(Date.parse(t))) return new Date(t).toISOString();
  return new Date(adesso()).toISOString();
};

/**
 * @param {{ registro: ReturnType<import('./notifiche-registro.mjs').creaRegistroNotifiche>, adesso?: () => number,
 *   segnala?: (errore: unknown) => void }} p
 */
export function creaScrittoriNotifiche({ registro, adesso = () => Date.now(), segnala = () => {} }) {
  /* le scritture vanno in coda nel registro: qui non si aspetta mai (il registro delle sessioni è sincrono) */
  const scrivi = (voce) => { registro.scrivi(voce).catch(segnala); };
  const risolvi = (quale) => { registro.risolvi(quale).catch(segnala); };
  /*
   * Revisione del blocco, R1 (31/10/2026): alcune carte nascono e si chiudono nello STESSO istante (il confutatore del /goal, la
   *   Coordinazione negata o la scrittura fuori dal progetto senza nessuno davanti, i giri in tondo: `session-registry.mjs`, chiediApprovazione).
   *   Scriverle farebbe una voce che nessuno ha visto e un avviso che può svegliare il telefono per niente. Una carta si scrive dopo un
   *   giro dell'event loop: se la risposta arriva prima, non si scrive né si risolve niente.
   */
  const carteInArrivo = new Map(); // id → handle di setImmediate
  const scriviCarta = (voce) => {
    clearImmediate(carteInArrivo.get(voce.id));
    carteInArrivo.set(voce.id, setImmediate(() => { carteInArrivo.delete(voce.id); scrivi(voce); }));
  };
  /** Chiude la carta. Torna `false` se la carta non era ancora diventata una voce (risposta nello stesso istante, R1): allora non c'è niente
      da risolvere, né un'azione della persona da raccontare. */
  const chiudiCarta = (id) => {
    const inArrivo = carteInArrivo.get(id);
    if (inArrivo) { clearImmediate(inArrivo); carteInArrivo.delete(id); return false; }
    risolvi((v) => v.id === id);
    return true;
  };
  /*
   * Bozza 3, punto 1 (owner: le sue azioni in «Tutto», riga più chiara, senza pallino, mai in «Da fare»), con la condizione della CLI:
   *   `azione-persona` nasce SOLO da un atto della persona. Due condizioni insieme: (a) la carta era diventata una voce (`chiudiCarta`
   *   torna vero E il registro la ha davvero: una carta che nessuno ha visto non ha una risposta da raccontare); (b) la risoluzione non
   *   porta un motivo (tutti quelli di `MOTIVI_APPROVAZIONE_RISOLTA` sono automatici o di sistema, TRANNE `modificata-dalla-persona`, che
   *   racconta `modificato`: CLI 31/10) e, per una domanda, l'ha chiusa la persona (`da: 'persona'`) rispondendo o saltando.
   *   Vista e risolta dalla nascita; `dato` = quello della carta, già pulito. Non è fra i fatti della sveglia (contratto, «Avviso di sistema»).
   * ⛔ `modificato` NON porta il dato della carta (Frontend 31/10): quella è la PROPOSTA del modello, non ciò che è partito dopo la
   *   modifica, e il registro non vede la versione modificata. Una riga senza dato dice il vero; con quel dato racconterebbe una cosa non
   *   successa.
   */
  const raccontaAzione = ({ cartaId, sessionId, requestId, azione, istante }) => {
    registro.voce(cartaId).then((carta) => {
      if (!carta) return null;
      return registro.scrivi({ id: `azione-persona:${sessionId}:${requestId}`, fatto: 'azione-persona', azione, cosa: carta.cosa, dato: azione === 'modificato' ? null : carta.dato,
        porta: carta.porta, istante, stato: { visto: true, risolto: true } });
    }).catch(segnala);
  };

  return {
    /* i soli tipi che questi scrittori leggono: il registro delle sessioni non chiama per gli altri (revisione del blocco, R2) */
    tipi: new Set(['ApprovalRequested', 'ApprovalResolved', 'UserQuestionRequested', 'UserQuestionResolved', 'RunFinished', 'RunError']),

    evento(info, evento) {
      const sessionId = info?.sessionId;
      if (typeof sessionId !== 'string' || !sessionId || !evento || typeof evento.type !== 'string') return;
      const cosa = { tipo: 'sessione', id: info.radiceId || sessionId, nome: info.nome || '' };
      const porta = { tipo: 'sessione', id: info.radiceId || sessionId };
      const istante = istanteDi(evento, adesso);

      if (evento.type === 'ApprovalRequested' && evento.rigiocoAttesa !== true && typeof evento.requestId === 'string') {
        const dato = datoDellAzione(evento.azione);
        scriviCarta({ id: `approvazione:${sessionId}:${evento.requestId}`, fatto: 'approvazione',
          azione: typeof evento.azione?.tipo === 'string' ? evento.azione.tipo : null, cosa, dato, porta, istante,
          richiesta: { sessionId, requestId: evento.requestId }, approvabileFuori: approvabileFuori(evento.azione, dato) });
        return;
      }
      if (evento.type === 'UserQuestionRequested' && typeof evento.requestId === 'string') {
        scriviCarta({ id: `domanda:${sessionId}:${evento.requestId}`, fatto: 'domanda', cosa, dato: testoDellaDomanda(evento.questions), porta, istante,
          richiesta: { sessionId, requestId: evento.requestId } });
        return;
      }
      if (evento.type === 'ApprovalResolved' && typeof evento.requestId === 'string') {
        const cartaId = `approvazione:${sessionId}:${evento.requestId}`;
        const era = chiudiCarta(cartaId);
        /* CLI 31/10: `modificata-dalla-persona` è un atto della persona (ha cambiato la carta di un'automazione o di un obiettivo), non
           una decisione automatica: è l'unico motivo della lista che racconta un'azione, `modificato` (valore già nel contratto) */
        if (era && evento.motivo === 'modificata-dalla-persona') {
          raccontaAzione({ cartaId, sessionId, requestId: evento.requestId, azione: 'modificato', istante });
        } else if (era && !evento.motivo && typeof evento.approvato === 'boolean') {
          raccontaAzione({ cartaId, sessionId, requestId: evento.requestId, azione: evento.approvato ? 'consentito' : 'negato', istante });
        }
        return;
      }
      if (evento.type === 'UserQuestionResolved' && typeof evento.requestId === 'string') {
        const cartaId = `domanda:${sessionId}:${evento.requestId}`;
        if (chiudiCarta(cartaId) && !evento.motivo && evento.da === 'persona' && (evento.status === 'answered' || evento.status === 'skipped')) {
          /* 31/10 (CLI, Mobile, Performance): `saltato` solo per la carta INTERA saltata; saltata in parte arriva `answered` ⇒ `risposto` */
          raccontaAzione({ cartaId, sessionId, requestId: evento.requestId, azione: evento.status === 'skipped' ? 'saltato' : 'risposto', istante });
        }
        return;
      }
      if ((evento.type === 'RunFinished' || evento.type === 'RunError') && info.chiudeUnGiro === true) {
        if (info.padreId) return; // una figlia: la sua fine sta nella scheda delle deleghe
        if (String(info.taskId || '').startsWith('automazione:')) return; // un giro d'automazione: arriva da «Da guardare»
        const giro = Number.isSafeInteger(info.giro) ? info.giro : null;
        const chiave = giro === null ? istante : `giro-${giro}`;
        const fermato = evento.type === 'RunError' && FERMATO.has(evento.code);
        const fatto = evento.type === 'RunFinished' ? 'fine' : fermato ? 'interrotta' : 'errore';
        const dato = fatto === 'errore' && typeof evento.code === 'string' && evento.code ? { genere: 'codice-errore', valore: evento.code } : null;
        scrivi({ id: `${fatto}:${sessionId}:${chiave}`, fatto, cosa, dato, porta: { ...porta, ...(giro === null ? {} : { giro }) }, istante });
      }
    },

    /**
     * Un giro d'automazione chiuso o saltato (`createAutomationStore({ osservaGiro })`). Come «Da guardare» della finestra: solo i giri
     * che hanno qualcosa da dire (`daGuardare`: un fallimento, una risposta che non è un silenzio, un salto che vuole un tuo gesto);
     * un giro fermato da te o un salto ordinario no. `giro-saltato`, `giro-fallito` o `giro-finito` (Mobile 31/10: un fatto per esito,
     * così un client che non conosce `giro-fallito` cade sulla riga generica, mai su «finito»; `azione` resta null).
     */
    giro(info) {
      if (!info || info.daGuardare !== true || typeof info.automazioneId !== 'string' || typeof info.runId !== 'string') return;
      const saltato = info.evento === 'saltata';
      const riassunto = typeof info.riassunto === 'string' && info.riassunto.trim() ? info.riassunto : null;
      const dato = riassunto ? { genere: 'testo', valore: riassunto }
        : typeof info.motivo === 'string' && info.motivo ? { genere: 'codice-errore', valore: info.motivo } : null;
      const fatto = saltato ? 'giro-saltato' : info.esito === 'fallita' ? 'giro-fallito' : 'giro-finito';
      scrivi({ id: `giro:${info.automazioneId}:${info.runId}`, fatto, azione: null,
        cosa: { tipo: 'automazione', id: info.automazioneId, nome: info.nome || '' }, dato,
        porta: { tipo: 'automazione', id: info.automazioneId },
        istante: typeof info.alle === 'string' && !Number.isNaN(Date.parse(info.alle)) ? info.alle : new Date(adesso()).toISOString() });
    },

    /**
     * Fase 8, cura 3 (forma `FORMA-FASE-8-TRE-CURE-2026-11-01.md` §3, decisione D6; OK di Performance, CLI e Mobile il 01/11 sera) — un
     * cambio di impostazioni fatto DAL MODELLO (`app_settings` set o undo) diventa la voce `impostazioni`: chiave, prima → dopo, la
     * conversazione, `confermatoDa`. La chiama il servizio delle impostazioni DOPO l'esito, al giro dopo del ciclo, senza aspettarla
     * (Performance 3): una scrittura fallita va a `segnala` e l'esito per la persona non cambia. Non aspetta nessuno: fuori da «Da fare» e
     * dal numero della campanella (`FATTI_CHE_ASPETTANO` del registro). ⛔ Il telefono non legge questo registro (Mobile, 01/11): niente
     * qui gli arriva finché il ponte non lo porta, con una voce sua.
     * L'id viene dalla ricevuta: `impostazioni:<conversazione>:<ricevuta>` (la stessa ricevuta rigiocata è la stessa voce).
     */
    /*
     * Giro 2 delle cure, voce 2 (02/11/2026 notte, scelta del Desktop per l'owner): anche un cambio della PERSONA arrivato DAL DISPOSITIVO
     * (`/settings` dal ponte, origine `{tipo:'dispositivo'}`) diventa la voce: sul PC si vede «Cambiata dal tuo dispositivo». Porta
     * `impostazioni.origine` (solo lui: il cambio del modello resta della forma di prima). Una voce dell'app senza conversazione ha l'id
     * `impostazioni:app:<ricevuta>` e nessuna porta. La persona al PC no: la nota in chat le basta.
     */
    impostazioni(ricevuta, { nome = '' } = {}) {
      if (!ricevuta || typeof ricevuta !== 'object') return;
      const dalDispositivo = ricevuta.origine?.tipo === 'dispositivo';
      if (ricevuta.origine?.tipo !== 'modello' && !dalDispositivo) return;
      const sessionId = typeof ricevuta.sessionId === 'string' && ricevuta.sessionId ? ricevuta.sessionId : null;
      if ((!sessionId && !dalDispositivo) || typeof ricevuta.id !== 'string' || !ricevuta.id) return;
      const cambi = Array.isArray(ricevuta.cambi) ? ricevuta.cambi.filter((c) => c && typeof c.chiave === 'string') : [];
      if (!cambi.length) return;
      const mostra = (v) => JSON.stringify(v ?? null);
      scrivi({ id: `impostazioni:${sessionId ?? 'app'}:${ricevuta.id}`, fatto: 'impostazioni', azione: ricevuta.annulla ? 'undo' : 'set',
        cosa: sessionId ? { tipo: 'sessione', id: sessionId, nome: typeof nome === 'string' ? nome : '' } : { tipo: 'impostazioni', id: '', nome: '' },
        porta: sessionId ? { tipo: 'sessione', id: sessionId } : null,
        dato: { genere: 'testo', valore: cambi.map((c) => `${c.chiave}: ${mostra(c.prima)} → ${mostra(c.dopo)}`).join('; ') },
        impostazioni: { ricevuta: ricevuta.id, cambi: cambi.map(({ chiave, prima, dopo }) => ({ chiave, prima, dopo })), confermatoDa: ricevuta.confermatoDa ?? null,
          ...(dalDispositivo ? { origine: { tipo: 'dispositivo', dispositivoId: ricevuta.origine.dispositivoId ?? null } } : {}) },
        istante: typeof ricevuta.quando === 'string' && !Number.isNaN(Date.parse(ricevuta.quando)) ? ricevuta.quando : new Date(adesso()).toISOString() });
    },

    /** Una sessione eliminata: le sue voci (e quelle delle sue figlie, che portano a lei) diventano risolte. */
    eliminata(sessionId) {
      if (typeof sessionId !== 'string' || !sessionId) return;
      for (const [id, inArrivo] of carteInArrivo) if (partiDellId(id)?.sessionId === sessionId) { clearImmediate(inArrivo); carteInArrivo.delete(id); }
      risolvi((v) => v.cosa?.id === sessionId || v.porta?.id === sessionId || partiDellId(v.id)?.sessionId === sessionId);
    },

    /**
     * All'avvio, dopo il ripristino delle sessioni (contratto, «Riconciliazione all'avvio»): ogni permesso o domanda non risolti si
     * confronta con la carta che la sessione aspetta davvero (`attesaDi(sessionId)` = `domandaInAttesa`, che vede anche le carte
     * `semprePersona`). Se la sessione non c'è più o aspetta un'altra carta (o niente), la voce diventa risolta e `seq` avanza.
     */
    riconcilia({ attesaDi }) {
      return registro.risolvi((v) => {
        if (!FATTI_IN_ATTESA.has(v.fatto)) return false;
        const p = partiDellId(v.id);
        if (!p || p.fatto !== v.fatto) return false; // una voce scritta da altri: non si tocca
        /* revisione 1 (Mobile): il campo tipato quando c'è; l'id aperto a pezzi solo per le voci scritte prima di lui */
        const richiesta = v.richiesta && typeof v.richiesta.sessionId === 'string' && typeof v.richiesta.requestId === 'string' ? v.richiesta : null;
        const sessione = richiesta ? richiesta.sessionId : p.sessionId;
        const chiave = richiesta ? richiesta.requestId : p.chiave;
        let attesa = null;
        try { attesa = attesaDi(sessione); } catch { return true; }
        if (!attesa || attesa.erroreAvvio) return true;
        const tipo = v.fatto === 'approvazione' ? 'approvazione' : 'domanda';
        return attesa.tipo !== tipo || attesa.requestId !== chiave;
      });
    },
  };
}
