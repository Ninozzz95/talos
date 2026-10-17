/**
 * obiettivo/per-il-modello.mjs — la porta del MODELLO sull'obiettivo della conversazione (/goal G6, la seconda porta): chi
 * risponde agli attrezzi `goal_status`, `goal_create`, `goal_update` del kernel (`onObiettivoFn(nome, argomenti, {fase})`), come
 * `automation-per-il-modello.mjs` per le automazioni.
 *
 * ⛔⛔⛔ DECISIONI DELL'OWNER (15/10/2026), dopo aver letto i concorrenti:
 *   - Codex `codex-rs/ext/goal/src/spec.rs:9-94`: `get_goal`, `create_goal` («only when explicitly requested by the user»),
 *     `update_goal {complete|blocked|paused}` («paused» solo su richiesta esplicita, «blocked» dopo tre giri di fila fermi sulla
 *     stessa cosa); Hermes e Claude Code non danno attrezzi al modello (solo `/goal`).
 *   - «Come Codex, ANCHE fatto»: il modello può dire «fatto», ma questo FA SOLO PARTIRE IL CONTROLLO (prove, giudice, revisore) —
 *     non chiude niente da solo. ⛔ È la scelta dell'owner, non quella consigliata (che escludeva «fatto»): qui la si rende
 *     innocua, perché «fatto» resta deciso dal ciclo.
 *   - Quando crea il modello, la carta di conferma dei controlli compare SEMPRE, tranne in Accesso pieno (che per regola non
 *     chiede mai niente): lì parte subito.
 *   - «Bloccato» = pausa col motivo del modello (dentro il confine dei dati quando lo si mostra), e la fascia si apre da sola.
 * ⛔ Due difese che Codex affida alla sola descrizione e qui le fa il codice:
 *   - creare e mettere in pausa vogliono un giro APERTO DALLA PERSONA (il suo messaggio, non un avviso del /goal, una delega,
 *     un passo, la coda di qualcun altro): «solo se la persona lo chiede» si controlla, non si spera;
 *   - «bloccato» vale solo dopo almeno 3 giri dell'obiettivo (contando questo): prima è un rifiuto che lo dice.
 * Due fasi come le automazioni: `anteprima` (valida e normalizza SENZA scrivere; un errore torna subito, senza carta) ed
 * `esegui`. I testi sono per il modello, in inglese (decisione owner 03/10); le parole per la persona le sceglie l'interfaccia.
 */
import { criterioDalModello } from './proposta.mjs';
import { nuovoContratto } from './contratto.mjs';
import { testoObiettivo } from './stato.mjs';

export const ATTREZZI_OBIETTIVO_OSPITE = Object.freeze(['goal_status', 'goal_create', 'goal_update']);
/** Quanti giri dell'obiettivo (contando quello in corso) prima che «bloccato» si accetti: Codex, «at least three consecutive goal turns». */
export const GIRI_PRIMA_DI_BLOCCATO = 3;
const MOTIVO_MASSIMO = 500;

const rifiuta = (messaggio) => ({ ok: false, messaggio });

/** I criteri scritti dal modello (il formato della proposta G2c) nella forma del contratto, o il primo errore con la posizione. */
function criteriDalModello(grezzi) {
  if (grezzi === undefined || grezzi === null) return { ok: true, criteri: undefined };
  if (!Array.isArray(grezzi)) return rifiuta('"criteria" must be a list.');
  if (grezzi.length === 0) return { ok: true, criteri: undefined };
  const criteri = [];
  for (const [indice, grezzo] of grezzi.entries()) {
    const tradotto = criterioDalModello(grezzo);
    if (!tradotto.ok) return rifiuta(`criterion ${indice + 1}: ${tradotto.motivo}.`);
    criteri.push(tradotto.criterio);
  }
  const forma = nuovoContratto({ criteri });
  if (!forma.ok) return rifiuta(`${forma.posizione ? `criterion ${forma.posizione}: ` : ''}${forma.motivo}${forma.operatore ? ` (${forma.operatore})` : ''}.`);
  return { ok: true, criteri, contratto: forma.contratto };
}

/** Lo stato dell'obiettivo in parole, per il modello. Solo fatti di TALOS: stato, motivo, conti, esito di ogni controllo. */
export function testoStatoObiettivo(obiettivo) {
  if (!obiettivo) return 'No goal is set in this conversation.';
  const righe = [`Goal: ${obiettivo.testo}`, `Status: ${obiettivo.stato}${obiettivo.motivo ? ` (${obiettivo.motivo.tipo}${obiettivo.motivo.dettaglio ? `: ${obiettivo.motivo.dettaglio}` : ''})` : ''}.`];
  const ciclo = obiettivo.ciclo;
  if (ciclo) righe.push(`Turns: ${ciclo.giri}. Tokens: ${ciclo.token}. Turns without progress: ${ciclo.senzaProgresso}.`);
  const verdetti = new Map((obiettivo.verifica?.verdetti ?? []).map((v) => [v.id, v]));
  const criteri = obiettivo.contratto?.criteri ?? [];
  if (criteri.length === 0) righe.push('Checks: none — a judge weighs the whole goal text on the evidence of each turn.');
  for (const criterio of criteri) {
    const v = verdetti.get(criterio.id);
    righe.push(`- ${criterio.id} [${criterio.verifica.tipo === 'comando' ? 'command' : criterio.verifica.tipo === 'file' ? 'file' : 'judgement'}] ${criterio.testo}: ${v ? v.esito : 'not checked yet'}${v?.motivo?.tipo ? ` (${v.motivo.tipo})` : ''}`);
  }
  return righe.join('\n');
}

/**
 * L'ospite degli attrezzi dell'obiettivo per UNA conversazione. Le porte le dà il registro, già legate alla sessione.
 * @param {{
 *   leggi: () => object|null,
 *   imposta: (testo: string, criteri?: object[]) => Promise<{ok?:true, obiettivo?:object, erroreAvvio?:string, code?:string}>,
 *   pausa: (motivo: {tipo:string, dettaglio?:string}) => Promise<{ok?:true, erroreAvvio?:string}>,
 *   rivendica: () => void,
 *   contesto: () => {giroDellaPersona:boolean, accessoPieno:boolean},
 * }} porte
 */
export function creaOspiteObiettivo({ leggi, imposta, pausa, rivendica, contesto }) {
  return async function ospiteObiettivo(nome, argomenti = {}, { fase } = {}) {
    const ora = leggi() ?? null;
    const { giroDellaPersona = false, accessoPieno = false } = contesto?.() ?? {};
    if (nome === 'goal_status') return fase === 'anteprima' ? { ok: true, carta: false } : { ok: true, testo: testoStatoObiettivo(ora) };

    if (nome === 'goal_create') {
      if (!giroDellaPersona) return rifiuta('create a goal only when the person asks for it in their own message in this turn. Nothing was created.');
      if (ora && ora.stato !== 'fatto') return rifiuta(`this conversation already has an unfinished goal (${ora.stato}): use goal_update, or ask the person to remove it first. Nothing was created.`);
      const testo = testoObiettivo(argomenti?.objective);
      if (!testo.ok) return rifiuta(`"objective": ${testo.motivo}. Nothing was created.`);
      const forma = criteriDalModello(argomenti?.criteria);
      if (!forma.ok) return rifiuta(`${forma.messaggio} Nothing was created.`);
      if (fase === 'anteprima') {
        /* la carta di conferma dei controlli (C1): sempre, tranne in Accesso pieno (owner 15/10) */
        return { ok: true, carta: !accessoPieno, azione: { obiettivo: { testo: testo.testo, criteri: forma.contratto?.criteri ?? [] } } };
      }
      const esito = await imposta(testo.testo, forma.criteri);
      if (!esito?.ok) return rifiuta(esito?.erroreAvvio ?? 'the goal could not be saved. Nothing was created.');
      return { ok: true, testo: `Goal set. TALOS checks it after every turn: ${forma.criteri ? `${forma.criteri.length} check(s)` : 'no checks, so a judge weighs the whole goal text'}, then a separate read-only reviewer before it is done. Keep working on it.` };
    }

    if (nome === 'goal_update') {
      const stato = typeof argomenti?.status === 'string' ? argomenti.status.trim().toLowerCase() : '';
      if (!['complete', 'blocked', 'paused'].includes(stato)) return rifiuta(`goal_update needs status "complete", "blocked" or "paused" (got ${JSON.stringify(argomenti?.status ?? null)}). Nothing was changed.`);
      if (!ora) return rifiuta('there is no goal in this conversation. Nothing was changed.');
      if (ora.stato !== 'attivo') return rifiuta(`the goal is not active (${ora.stato}): only the person can resume it. Nothing was changed.`);
      if (stato === 'paused' && !giroDellaPersona) return rifiuta('pause the goal only when the person asks for it in their own message in this turn. Nothing was changed.');
      const motivo = typeof argomenti?.reason === 'string' ? [...argomenti.reason.replace(/\s+/gu, ' ').trim()].slice(0, MOTIVO_MASSIMO).join('') : '';
      if (stato === 'blocked') {
        if (motivo === '') return rifiuta('"blocked" needs a "reason": what blocks you, and what the person must do. Nothing was changed.');
        /* contando questo giro; G6-REV-03: dall'ultima ripresa (o dalla creazione), come Codex `spec.rs:66` e `:78` */
        const giri = Math.max(0, (ora.ciclo?.giri ?? 0) - (ora.giriAllaRipresa ?? 0)) + 1;
        if (giri < GIRI_PRIMA_DI_BLOCCATO) return rifiuta(`"blocked" is accepted only after the same blocking condition has repeated for ${GIRI_PRIMA_DI_BLOCCATO} goal turns in a row; this is turn ${giri}. Keep working, or explain the problem in your answer. Nothing was changed.`);
      }
      if (fase === 'anteprima') return { ok: true, carta: false };
      if (stato === 'complete') {
        /* «fatto» FA SOLO PARTIRE IL CONTROLLO (owner 15/10): il ciclo a fine giro esegue le prove, il giudice e il revisore */
        rivendica();
        return { ok: true, testo: 'Noted. When this turn ends TALOS runs the goal checks, then the judge and a separate read-only reviewer. The goal is done only if they all agree; otherwise you will get what is missing. Finish your answer now.' };
      }
      const esito = await pausa(stato === 'paused' ? { tipo: 'persona' } : { tipo: 'bloccato', dettaglio: motivo });
      if (!esito?.ok) return rifiuta(esito?.erroreAvvio ?? 'the goal could not be paused. Nothing was changed.');
      return { ok: true, testo: stato === 'paused' ? 'Goal paused. Stop working on it; only the person can resume it.' : 'Goal paused as blocked, with your reason shown to the person. Stop working on it and tell the person what you need.' };
    }
    return rifiuta(`${nome} is not a goal tool.`);
  };
}
