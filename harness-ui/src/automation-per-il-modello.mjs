/**
 * automation-per-il-modello.mjs — la porta del MODELLO sulle automazioni: chi risponde agli attrezzi `automation_*` del kernel
 * (`onAutomazioneFn(nome, argomenti, {fase})`).
 *
 * ⛔⛔⛔ AUTOMAZIONI A DUE PORTE (owner 08/10/2026 notte, «non negoziabile»; regola `features-startable-from-chat`): ogni cosa
 *   che la persona fa nella sezione Automazioni la può chiedere in chat, tranne ELIMINARE (solo dall'interfaccia, come Claude
 *   Desktop: «To delete a task, use the Delete button on its detail page»). Decisioni dell'owner:
 *   - CARTA per crea, modifica, riprendi ed esegui ora (D4); pausa e ferma senza;
 *   - un GIRO di un'automazione (nessuno davanti) può cambiare SOLO sé stesso, e solo le istruzioni o il prossimo giro (D5),
 *     senza carta; tutto il resto gli si rifiuta col perché. Dall'08/10 sera (decisione 13) le istruzioni di un giro restano
 *     una PROPOSTA finché la persona non la approva;
 *   - ogni carta porta `avvisi: {oltre, minacce}` (decisioni 12-13, `automation-sicurezza.mjs`);
 *   - la cartella e il modello di serie sono quelli della conversazione; il modello lo sceglie solo la persona (Hermes
 *     `cronjob_tools.py:697`, «models don't pick models»), e un modello chiesto si verifica fra quelli che l'app sa usare.
 * Due fasi: `anteprima` (valida e normalizza, SENZA scrivere: è ciò che la carta mostra; un errore torna subito, senza
 * carta) ed `esegui`. I testi sono per il modello, in inglese (decisione owner 03/10); le parole per la persona le sceglie
 * l'interfaccia dalla bozza strutturata.
 */
import { Cron } from 'croner';

import { AutomationStoreError } from './automation-store.mjs';
import { PianificazioneNonValida, fusoValido, soloCampiDelTipo } from './automation-pianificazione.mjs';
import { oltreLaChat, percorsoRisolto, scansionaIstruzioni } from './automation-sicurezza.mjs';

/* un percorso assoluto si risolve; un valore che non lo è (relativo, non stringa) passa com'è e lo rifiuta la validazione */
const risolvi = (percorso) => percorsoRisolto(percorso) ?? percorso;

const GIORNI = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CAMPI_DEL_GIRO = new Set(['id', 'istruzioni', 'prossimoGiroAlle']);
/* Il campo della bozza che ogni avviso «oltre la chat» riguarda: la carta di una MODIFICA dice solo ciò che il cambio tocca. */
const CAMPO_DELL_AVVISO = Object.freeze({ 'permessi-piu-ampi': 'permessi', 'altra-cartella': 'cartella', 'cartella-mai-aperta': 'cartella', 'coordinazione-accesa': 'coordinazione' });
const RIASSUNTO_PER_IL_MODELLO = 2_000;

/** «2026-10-09 15:00» nell'ora del fuso dell'automazione. */
export function oraLocale(iso, fuso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parti = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: fusoValido(fuso) ? fuso : 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${parti.year}-${parti.month}-${parti.day} ${parti.hour}:${parti.minute}`;
}

/** La pianificazione in parole, per il modello (l'interfaccia ha le sue, nelle due lingue). */
export function descriviPianificazione(p) {
  switch (p?.tipo) {
    case 'manuale': return 'only when started by hand';
    case 'ogni-ora': return `every hour at :${String(p.minuto).padStart(2, '0')}`;
    case 'giornaliera': return `every day at ${p.ora}`;
    case 'feriali': return `on weekdays at ${p.ora}`;
    case 'settimanale': return `every ${GIORNI[p.giorno]} at ${p.ora}`;
    case 'ogni-n-minuti': return `every ${p.minuti} minutes`;
    case 'cron': return `on the custom schedule "${p.espressione}"`;
    case 'una-volta': return `once, on ${p.quando.replace('T', ' ')}`;
    default: return 'on an unknown schedule';
  }
}

function prossimoInParole(voce) {
  if (!voce.attiva) return 'it is off';
  if (!voce.prossimaEsecuzione) return voce.pianificazione?.tipo === 'manuale' ? 'it runs only when started by hand' : 'no next run';
  return `next run ${oraLocale(voce.prossimaEsecuzione, voce.fusoOrario)} (${voce.fusoOrario})`;
}

const rifiuto = (messaggio) => ({ ok: false, messaggio });
function rifiutoDa(errore) {
  if (errore instanceof AutomationStoreError || errore instanceof PianificazioneNonValida) return rifiuto(errore.message);
  if (errore && typeof errore.message === 'string' && typeof errore.code === 'string') return rifiuto(errore.message);
  throw errore;
}

/**
 * @param {{ store, scheduler, verificaCartellaFn?: (percorso:string)=>void, clock?: ()=>Date }} servizi
 * @returns la fabbrica di `onAutomazioneFn` per una sessione: `({ sessionId, cartella, modello, automazioneDelGiro,
 *   verificaModelloFn, contestoChatFn })`. `contestoChatFn()` → `{ permessi, coordinazioneAccesa, cartellaNota(percorso) }`
 *   della conversazione ADESSO (decisione 12: la carta dice dove la bozza va oltre); letta a ogni carta, perché la persona
 *   può cambiare permessi e Coordinazione fra un giro e l'altro.
 */
export function creaOspiteAutomazioni({ store, scheduler, verificaCartellaFn = () => {}, clock = () => new Date() }) {
  return function perLaSessione({ sessionId = null, cartella = null, modello = null, automazioneDelGiro = null, verificaModelloFn = null, contestoChatFn = null } = {}) {
    function avvisiPer(bozza, { campiToccati = null, testi = [] } = {}) {
      let chat = {};
      try { chat = (typeof contestoChatFn === 'function' && contestoChatFn()) || {}; } catch { chat = {}; }
      const oltre = oltreLaChat(bozza, { ...chat, cartella })
        .filter((a) => !campiToccati || a.codice === 'accesso-pieno' || campiToccati.has(CAMPO_DELL_AVVISO[a.codice]));
      const minacce = [...new Set(testi.flatMap((t) => scansionaIstruzioni(t)))];
      return { oltre, minacce };
    }
    async function leggiVoce(id) {
      if (typeof id !== 'string' || !id) return { errore: rifiuto('"id" is required: take it from automation_list.') };
      const voce = await store.leggi(id);
      if (!voce) return { errore: rifiuto(`there is no automation with id "${id}": call automation_list and use an id from it.`) };
      if (voce.versione !== 2) return { errore: rifiuto(`automation "${voce.nome}" uses the old format: the person can recreate it in Automations.`) };
      return { voce };
    }

    async function campiDellaBozza(argomenti) {
      const { nome, istruzioni, pianificazione, permessi, coordinazione, ripeti } = argomenti;
      // Y1 (review dell'08/10 sera): la cartella si RISOLVE prima di tutto, così la carta mostra e salva quella vera, e gli
      // avvisi la confrontano senza `..` di mezzo
      const campi = { nome, istruzioni, pianificazione: soloCampiDelTipo(pianificazione), cartella: risolvi(argomenti.cartella ?? cartella) };
      if (typeof campi.cartella === 'string') verificaCartellaFn(campi.cartella);
      if (argomenti.modello !== undefined) {
        const verifica = typeof verificaModelloFn === 'function' ? await verificaModelloFn(argomenti.modello) : { ok: true, modello: argomenti.modello };
        if (!verifica?.ok) throw Object.assign(new Error(verifica?.motivo ?? 'that model cannot be used here.'), { code: 'AUTOMATION_INVALID' });
        campi.modello = verifica.modello ?? argomenti.modello;
      } else if (typeof modello === 'string' && modello) {
        campi.modello = modello;
      }
      if (permessi !== undefined) campi.permessi = permessi;
      if (coordinazione !== undefined) campi.coordinazione = coordinazione;
      if (ripeti !== undefined) campi.ripeti = ripeti;
      return campi;
    }

    function prossimoDaOraLocale(quando, fuso) {
      if (typeof quando !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(quando)) {
        throw new AutomationStoreError('"prossimoGiroAlle" must be a local time "YYYY-MM-DDTHH:MM"', 'AUTOMATION_SCHEDULE_INVALID');
      }
      const data = new Cron(`${quando}:00`, { paused: true, timezone: fuso }).nextRun(clock());
      if (!data) throw new AutomationStoreError('"prossimoGiroAlle" has already passed', 'AUTOMATION_SCHEDULE_PAST');
      return data.toISOString();
    }

    async function lista() {
      const voci = (await store.elenca()).filter((v) => v.versione === 2);
      if (!voci.length) return { ok: true, testo: 'There are no automations yet.' };
      const daLeggere = await store.daGuardare();
      const righe = [];
      for (const v of voci) {
        const [ultimo] = await store.giri(v.id, { limite: 1 });
        const nonLetti = daLeggere.filter((g) => g.automazioneId === v.id).length;
        righe.push(`- ${v.id} · "${v.nome}" · ${v.attiva ? 'on' : 'off'} · runs ${descriviPianificazione(v.pianificazione)} · ${prossimoInParole(v)}`
          + ` · folder ${v.cartella}${v.modello ? ` · model ${v.modello}` : ''} · ${v.permessi}${v.coordinazione ? ' · Coordination on' : ''}`
          + `${ultimo ? ` · last run ${ultimo.esito}${ultimo.motivo ? ` (${ultimo.motivo})` : ''}` : ' · never run'}${nonLetti ? ` · ${nonLetti} unread` : ''}`);
      }
      return { ok: true, testo: `${voci.length} automation${voci.length === 1 ? '' : 's'}:\n${righe.join('\n')}` };
    }

    async function storico({ id, limit }) {
      const { voce, errore } = await leggiVoce(id);
      if (errore) return errore;
      const limite = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 50) : 10;
      const giri = await store.giri(voce.id, { limite });
      if (!giri.length) return { ok: true, testo: `Automation "${voce.nome}" has not run yet.` };
      const righe = giri.map((g) => {
        const quando = oraLocale(g.partitaAlle ?? g.saltataAlle, voce.fusoOrario);
        const testa = `- ${quando} · ${g.esito}${g.motivo ? ` (${g.motivo})` : ''}${g.manuale ? ' · started by hand' : ''}${g.ritardo === 'recupero' ? ' · catch-up run' : ''}`;
        const corpo = g.riassunto ?? g.dettaglio ?? null;
        return corpo ? `${testa}\n  ${String(corpo).slice(0, RIASSUNTO_PER_IL_MODELLO).replace(/\n/gu, '\n  ')}` : testa;
      });
      return { ok: true, testo: `Runs of "${voce.nome}" (${voce.fusoOrario}), newest first:\n${righe.join('\n')}` };
    }

    /* Decisione 13: dal giro, il prossimo orario si sposta e si segna; le istruzioni diventano una proposta, mai applicata qui. */
    async function aggiornaDalGiro(argomenti, fase) {
      const { voce, errore } = await leggiVoce(argomenti.id);
      if (errore) return errore;
      const { istruzioni, prossimoGiroAlle } = argomenti;
      const prossimo = prossimoGiroAlle !== undefined ? prossimoDaOraLocale(prossimoGiroAlle, voce.fusoOrario) : null;
      if (istruzioni === undefined && !prossimo) return rifiuto('nothing to change: pass "istruzioni" or "prossimoGiroAlle".');
      if (fase === 'anteprima') return { ok: true, carta: false };
      const frasi = [];
      if (prossimo) {
        const dopo = await store.spostaProssimo(voce.id, prossimo);
        await store.segnaCambioDelGiro(voce.id, ['prossimaEsecuzione']);
        frasi.push(`The next run of "${dopo.nome}" moved to ${oraLocale(dopo.prossimaEsecuzione, dopo.fusoOrario)} (${dopo.fusoOrario}).`);
      }
      if (istruzioni !== undefined) {
        const proposta = await store.proponiCambioDelGiro(voce.id, { istruzioni, minacce: scansionaIstruzioni(istruzioni) });
        if (!proposta) return rifiuto('only a run that is still going can propose new instructions for itself.');
        frasi.push('Your new instructions were saved as a proposal: they apply only after the person approves them in Automations. '
          + 'This run and the next ones follow the current instructions until then.');
      }
      return { ok: true, testo: frasi.join(' ') };
    }

    return async function onAutomazioneFn(nome, argomenti = {}, { fase = 'esegui' } = {}) {
      try {
        if (nome === 'automation_list') return fase === 'anteprima' ? { ok: true, carta: false } : lista();
        if (nome === 'automation_runs') return fase === 'anteprima' ? { ok: true, carta: false } : storico(argomenti);

        /*
         * D5: un giro di un'automazione cambia solo sé stesso, senza carta (nessuno potrebbe rispondere). Decisione 13
         * (08/10/2026 sera): il PROSSIMO GIRO si sposta subito (il caso utile di Claude Code `update_scheduled_task`); le
         * ISTRUZIONI no — diventano una proposta che aspetta la persona in «Da guardare», perché un testo che il giro ha letto
         * (una pagina, un file, una issue) può avergliele dettate. Nessun giro crea automazioni (Hermes `scheduler.py:412-427`,
         * contro i cicli).
         */
        if (automazioneDelGiro) {
          if (nome !== 'automation_update') {
            return rifiuto('an automation run can only read automations and change its own instructions or next run time (automation_update).');
          }
          if (argomenti.id !== automazioneDelGiro) return rifiuto('an automation run can change only itself.');
          const estranei = Object.keys(argomenti).filter((k) => !CAMPI_DEL_GIRO.has(k));
          if (estranei.length) return rifiuto(`an automation run can change only its instructions or its next run time, not: ${estranei.join(', ')}.`);
          return aggiornaDalGiro(argomenti, fase);
        }

        if (nome === 'automation_create') {
          if (fase === 'anteprima') {
            const bozza = store.anteprimaCrea(await campiDellaBozza(argomenti));
            return { ok: true, carta: true, azione: { bozza, avvisi: avvisiPer(bozza, { testi: [bozza.istruzioni] }) } };
          }
          const voce = await store.crea({ ...(await campiDellaBozza(argomenti)), origine: { tipo: 'chat', ...(sessionId ? { sessionId } : {}) } });
          return { ok: true, testo: `Automation "${voce.nome}" created (id ${voce.id}). It is on and runs ${descriviPianificazione(voce.pianificazione)}: ${prossimoInParole(voce)}. `
            + 'The person can change or delete it in Automations.' };
        }

        const { voce, errore } = await leggiVoce(argomenti.id);
        if (errore) return errore;

        if (nome === 'automation_update') {
          const { id: _id, prossimoGiroAlle, ...resto } = argomenti;
          const campi = { ...resto, ...(resto.pianificazione !== undefined ? { pianificazione: soloCampiDelTipo(resto.pianificazione) } : {}),
            ...(resto.cartella !== undefined ? { cartella: risolvi(resto.cartella) } : {}) };
          if (typeof campi.cartella === 'string') verificaCartellaFn(campi.cartella);
          if (campi.modello !== undefined) {
            const verifica = typeof verificaModelloFn === 'function' ? await verificaModelloFn(campi.modello) : { ok: true, modello: campi.modello };
            if (!verifica?.ok) return rifiuto(verifica?.motivo ?? 'that model cannot be used here.');
            campi.modello = verifica.modello ?? campi.modello;
          }
          const prossimo = prossimoGiroAlle !== undefined ? prossimoDaOraLocale(prossimoGiroAlle, voce.fusoOrario) : null;
          if (!Object.keys(campi).length && !prossimo) return rifiuto('nothing to change: pass at least one field.');
          if (fase === 'anteprima') {
            const diff = Object.keys(campi).length ? await store.anteprimaModifica(voce.id, campi) : { prima: {}, dopo: {} };
            if (prossimo) { diff.prima.prossimaEsecuzione = voce.prossimaEsecuzione; diff.dopo.prossimaEsecuzione = prossimo; }
            const avvisi = avvisiPer({ ...voce, ...diff.dopo }, { campiToccati: new Set(Object.keys(diff.dopo)),
              testi: typeof diff.dopo.istruzioni === 'string' ? [diff.dopo.istruzioni] : [] });
            return { ok: true, carta: true, azione: { automazione: { id: voce.id, nome: voce.nome, fusoOrario: voce.fusoOrario }, prima: diff.prima, dopo: diff.dopo, avvisi } };
          }
          let dopo = Object.keys(campi).length ? await store.modifica(voce.id, campi) : voce;
          if (prossimo) dopo = await store.spostaProssimo(voce.id, prossimo);
          const cambiati = [...Object.keys(campi), ...(prossimo ? ['next run'] : [])].join(', ');
          return { ok: true, testo: `Automation "${dopo.nome}" updated (${cambiati}). It runs ${descriviPianificazione(dopo.pianificazione)}: ${prossimoInParole(dopo)}.` };
        }

        if (nome === 'automation_pause') {
          if (fase === 'anteprima') return { ok: true, carta: false };
          const spenta = await store.imposta(voce.id, false);
          return { ok: true, testo: `Automation "${spenta.nome}" is off: it will not run on its schedule until it is turned on.${spenta.giroInCorso ? ' A run already going finishes.' : ''}` };
        }

        if (nome === 'automation_resume') {
          if (fase === 'anteprima') {
            return { ok: true, carta: true, azione: { automazione: { id: voce.id, nome: voce.nome, pianificazione: voce.pianificazione, fusoOrario: voce.fusoOrario },
              avvisi: avvisiPer(voce, { testi: [voce.istruzioni] }) } };
          }
          const accesa = await store.imposta(voce.id, true);
          return { ok: true, testo: `Automation "${accesa.nome}" is on and runs ${descriviPianificazione(accesa.pianificazione)}: ${prossimoInParole(accesa)}.` };
        }

        if (nome === 'automation_run') {
          const contesto = typeof argomenti.contesto === 'string' && argomenti.contesto.trim() ? argomenti.contesto.trim().slice(0, 4000) : null;
          if (fase === 'anteprima') {
            return { ok: true, carta: true, azione: { automazione: { id: voce.id, nome: voce.nome, cartella: voce.cartella, modello: voce.modello, permessi: voce.permessi, coordinazione: voce.coordinazione }, ...(contesto ? { contesto } : {}),
              avvisi: avvisiPer(voce, { testi: [voce.istruzioni, ...(contesto ? [contesto] : [])] }) } };
          }
          const esito = await scheduler.eseguiOra(voce.id, { contesto });
          if (!esito?.ok) {
            return rifiuto(esito?.code === 'AUTOMATION_RUN_IN_PROGRESS'
              ? `a run of "${voce.nome}" is still going: wait for it, or stop it with automation_stop.`
              : `the run of "${voce.nome}" did not start: ${esito?.erroreAvvio ?? esito?.code ?? 'unknown reason'}.`);
          }
          return { ok: true, testo: `A run of "${voce.nome}" started in the background. Do not wait for it: its report will appear in the automation's history (automation_runs).` };
        }

        if (nome === 'automation_stop') {
          if (fase === 'anteprima') return { ok: true, carta: false };
          const esito = await scheduler.fermaGiro(voce.id);
          if (!esito?.ok) return rifiuto(`no run of "${voce.nome}" is going right now.`);
          return { ok: true, testo: `The run of "${voce.nome}" was stopped. The automation stays ${voce.attiva ? 'on' : 'off'} for its next runs.` };
        }

        return rifiuto(`${nome} is not an automation tool.`);
      } catch (errore) {
        return rifiutoDa(errore);
      }
    };
  };
}
