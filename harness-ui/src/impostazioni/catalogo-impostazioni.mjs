/*
 * ⭐ Fase 8 «Impostazioni dalla chat» (owner 01/11/2026, D1: «un attrezzo solo, `app_settings`, con un catalogo unico che alimenta
 *   anche la ricerca nelle Impostazioni; gli attrezzi di dominio restano») — IL CATALOGO, la fonte sola.
 *   Forma approvata: `handoff-talos-2026-09-27/in-corso/FORMA-FASE-8-IMPOSTAZIONI-DALLA-CHAT-2026-11-01.md` (§3, §6, §7).
 *
 * Una voce per impostazione:
 *   · `chiave`: stabile, è un CONTRATTO col Mobile (sua condizione 4: una chiave rinominata passa da lui). camelCase col punto, mai un
 *     trattino;
 *   · `sezione`, `ambito` ('app' = tutta l'app o le conversazioni nuove; 'conversazione' = questa conversazione);
 *   · `dove`: 'server' (un file del server) o 'finestra' (le preferenze della finestra, di cui il server tiene una copia: §3.5, strada A);
 *   · `fonte` e `campo`: chi la legge e la scrive (gli adattatori stanno in `fonti-impostazioni.mjs`; il catalogo non li chiama);
 *   · `valori`: i valori che il MODELLO vede (parole inglesi stabili), con `interni` quando la fonte ne usa altri; oppure `tipo:'modello'`
 *     (un id di modello: qui solo la forma, il resto lo convalida la fonte, cioè la rotta che esiste già) o `tipo:'sino'`;
 *   · `gruppo`: 'sicurezza' | 'costo' | 'aggiornamenti' | null — decide la carta (D3, D4, D5, D7; la regola sta nel nucleo,
 *     `GRUPPI_CARTA_SEMPRE` in `kernel/impostazioni-app.mjs`);
 *   · `testo`: la CHIAVE del dizionario dell'interfaccia del campo che la persona vede (nelle Impostazioni o, per le voci della
 *     conversazione, nel foglio della sessione). Cura 1 del 01/11 sera (forma `FORMA-FASE-8-TRE-CURE-2026-11-01.md` §1): prima il
 *     catalogo aveva parole sue, e «Fonte della ricerca web» non era «Origine della ricerca web» delle Impostazioni. Il nome si risolve
 *     UNA volta qui, al caricamento (Performance, nota 1), in `{ chiave, en, it }` da `nomi-impostazioni.mjs`; la prova CAT-03 lo
 *     confronta col dizionario vero. L'inglese va al modello, la chiave e le due lingue alla carta.
 *
 * ⛔ FUORI, per decisione e per costruzione (§2.4 della forma): segreti (chiavi, gettoni), account (ChatGPT, OpenRouter, GitHub),
 *   fiducia a ganci e server MCP, azioni distruttive (esporta/importa/ripristina, cancella), riserve dei fornitori (tolte dall'owner
 *   l'11/10: il modello non le riporta in vita), dimensioni di pannelli e modali. Lo prova CAT-02.
 * ⛔ Il modo Piano / Normale resta a `request_plan_mode`; i cinque attrezzi di dominio restano loro: il catalogo li indica come RIMANDI.
 * ⛔ «PC sveglio» (S5) non c'è: vive solo sul ramo `feat/motore-apertura-2026-11-01`, non nella base di questo ramo.
 */

import { nomeDalDizionario } from './nomi-impostazioni.mjs';

export const SCHEMA_CATALOGO_IMPOSTAZIONI ='talos.app-settings.catalog.v1';
export const GRUPPI_IMPOSTAZIONI = Object.freeze(['sicurezza', 'costo', 'aggiornamenti']);
/* L'ordine delle sezioni è quello in cui `list` le elenca */
export const SEZIONI_IMPOSTAZIONI = Object.freeze(['appearance', 'language', 'motion', 'chat', 'conversation', 'context', 'models', 'tools', 'updates']);

const TEMI = ['forge', 'paper', 'terminal', 'aurora', 'glacier', 'ember', 'atlas', 'noir', 'signal', 'violet', 'claudius', 'basicus', 'telemetry', 'calm'];
/* gli stessi di `frontend/src/components/lingue-delle-risposte.js` (VALORI_LINGUA_DELLE_RISPOSTE) */
const LINGUE_DELLE_RISPOSTE = ['auto', 'ar', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'fa', 'fi', 'fr', 'he', 'hi', 'hu', 'id', 'it', 'ja', 'ko', 'ms', 'nl', 'no',
  'pl', 'pt', 'pt-BR', 'ro', 'ru', 'sv', 'sw', 'th', 'tr', 'uk', 'ur', 'vi', 'zh-Hans', 'zh-Hant'];

/** Una voce di catalogo, congelata. `interni` mappa il valore pubblico a quello della fonte (assente = identici); `testo` entra come
 *  chiave del dizionario ed esce come `{ chiave, en, it }` (una chiave senza nome ferma il caricamento). */
const voce = (v) => Object.freeze({ gruppo: null, ...v, ...(v.valori ? { valori: Object.freeze([...v.valori]) } : {}),
  ...(v.interni ? { interni: Object.freeze({ ...v.interni }) } : {}), testo: nomeDalDizionario(v.testo) });
const finestra = (chiave, sezione, campo, resto) => voce({ chiave, sezione, ambito: 'app', dove: 'finestra', fonte: 'finestra', campo, ...resto });
const sino = { tipo: 'sino', valori: [true, false] };
const sessione = (chiave, campo, resto) => voce({ chiave, sezione: 'conversation', ambito: 'conversazione', dove: 'server', fonte: 'sessione', campo, ...resto });
const server = (chiave, sezione, fonte, campo, resto) => voce({ chiave, sezione, ambito: 'app', dove: 'server', fonte, campo, ...resto });

export const CATALOGO_IMPOSTAZIONI = Object.freeze([
  /* Aspetto — preferenze della finestra (`DESKTOP_APPEARANCE_DEFAULTS`, frontend/src/legacy/app.js:21389), copia sul server */
  finestra('appearance.theme', 'appearance', 'themePreset', { tipo: 'scelta', valori: TEMI, diSerie: 'forge', testo: 'impostazioni.field.themePresetSelect.title' }),
  finestra('appearance.colorMode', 'appearance', 'colorMode', { tipo: 'scelta', valori: ['system', 'dark', 'light'], diSerie: 'system', testo: 'impostazioni.field.colorModeSelect.title' }),
  finestra('appearance.density', 'appearance', 'uiDensity', { tipo: 'scelta', valori: ['compact', 'comfortable'], interni: { compact: 'compatta', comfortable: 'comoda' }, diSerie: 'compact', testo: 'impostazioni.field.uiDensitySelect.title' }),
  finestra('appearance.interfaceSize', 'appearance', 'uiFontScale', { tipo: 'scelta', valori: ['xsmall', 'small', 'default', 'large', 'xlarge'], diSerie: 'default', testo: 'impostazioni.field.uiFontScaleSelect.title' }),
  finestra('appearance.chatTextSize', 'appearance', 'chatFontScale', { tipo: 'scelta', valori: ['xcompact', 'compact', 'balanced', 'expanded'], diSerie: 'balanced', testo: 'impostazioni.field.chatFontScaleSelect.title' }),
  finestra('appearance.newSessionView', 'appearance', 'newSessionView', { tipo: 'scelta', valori: ['window', 'sky'], diSerie: 'window', testo: 'impostazioni.field.newSessionViewSelect.title' }),
  finestra('appearance.messageStyle', 'appearance', 'messageStyle', { tipo: 'scelta', valori: ['sections', 'bubbles'], diSerie: 'sections', testo: 'impostazioni.field.messageStyleSelect.title' }),
  finestra('appearance.streamingAnimation', 'appearance', 'streamingAnimation', { tipo: 'scelta', valori: ['fade', 'typewriter'], diSerie: 'fade', testo: 'impostazioni.field.streamingAnimationSelect.title' }),
  finestra('appearance.chatFullWidth', 'appearance', 'chatFullWidth', { ...sino, diSerie: false, testo: 'impostazioni.field.chatFullWidthToggle.title' }),
  finestra('appearance.userBubbleFullWidth', 'appearance', 'userBubbleFullWidth', { ...sino, diSerie: false, testo: 'impostazioni.field.userBubbleFullWidthToggle.title' }),
  finestra('appearance.immersiveHeader', 'appearance', 'immersiveHeader', { ...sino, diSerie: false, testo: 'impostazioni.field.immersiveHeaderToggle.title' }),
  /* Lingua */
  finestra('language.interface', 'language', 'uiLanguage', { tipo: 'scelta', valori: ['system', 'en', 'it'], interni: { system: 'sistema' }, diSerie: 'system', testo: 'impostazioni.field.uiLanguageSelect.title' }),
  finestra('language.replies', 'language', 'replyLanguage', { tipo: 'scelta', valori: LINGUE_DELLE_RISPOSTE, diSerie: 'auto', testo: 'impostazioni.field.replyLanguageSelect.title' }),
  /* Movimento: solo gli interruttori principali (i cursori restano allo schermo: nessuno li chiede a parole) */
  finestra('motion.animatedBackground', 'motion', 'backgroundMotion', { ...sino, diSerie: true, testo: 'impostazioni.field.backgroundMotionToggle.title' }),
  finestra('motion.interfaceMotion', 'motion', 'interfaceMotion', { ...sino, diSerie: true, testo: 'impostazioni.field.interfaceMotionToggle.title' }),
  finestra('motion.reduced', 'motion', 'reducedMotion', { ...sino, diSerie: false, testo: 'impostazioni.field.reducedMotionToggle.title' }),
  /* Chat */
  finestra('chat.questionTimeout', 'chat', 'askTimeout', { tipo: 'scelta', valori: ['none', '60', '300', '600'], diSerie: 'none', testo: 'impostazioni.field.askTimeoutSelect.title' }),
  finestra('chat.stopWithAgents', 'chat', 'stopWithAgents', { tipo: 'scelta', valori: ['ask', 'all', 'chatOnly'], interni: { ask: 'chiedi', all: 'tutte', chatOnly: 'solo-chat' }, diSerie: 'ask', testo: 'impostazioni.field.stopWithAgentsSelect.title' }),
  finestra('chat.windowPresentation', 'chat', 'windowPresentation', { tipo: 'scelta', valori: ['drawer', 'fullscreen'], diSerie: 'drawer', testo: 'impostazioni.field.windowPresentationSelect.title' }),
  /* Decisione 140 (04/11/2026): «Blocchi vivi nelle risposte», sul server (`impostazioni-chat.mjs`), per le conversazioni nuove. Nessun
     gruppo: la carta c'è per il modello (fuori dall'Accesso pieno), il telefono la cambia con app-settings.apply senza conferma sul PC. */
  server('chat.liveBlocks', 'chat', 'chat', 'blocchiVivi', { ...sino, testo: 'blocchi.settings.title' }),
  /* Aggiornamenti dell'app (D7: ammessi, carta SEMPRE). Vivono nel guscio: la finestra li applica col suo canale (`desktop/canale-aggiornamenti.mjs`) */
  finestra('updates.automatic', 'updates', 'aggiornamentiAutomatici', { ...sino, diSerie: true, gruppo: 'aggiornamenti', testo: 'varie.updates.card.autoLabel' }),

  /* Questa conversazione (`aggiornaImpostazioni` e le due scelte sui comandi del registro): l'origine va nell'evento della sessione */
  sessione('conversation.model', 'modello', { tipo: 'modello', gruppo: 'costo', testo: 'app.sheets.model.title' }),
  sessione('conversation.planModel', 'modelloPlanner', { tipo: 'modello', nullo: true, gruppo: 'costo', testo: 'app.workspace.plannerLabel' }),
  sessione('conversation.reasoningEffort', 'sforzo', { tipo: 'scelta', valori: ['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], interni: { default: null }, gruppo: 'costo', testo: 'app.modelPicker.reasoningLevel' }),
  /* D4 + decisione del 31/10: la modalità veloce resta «chiesta», mai «attiva»: `true` vuol dire che la conversazione la CHIEDE */
  sessione('conversation.fastModeRequested', 'fasciaVeloce', { ...sino, gruppo: 'costo', testo: 'app.fastMode.label' }),
  sessione('conversation.permissions', 'permessi', { tipo: 'scelta', valori: ['readOnly', 'research', 'onRequest', 'workspaceWrite', 'fullAccess'],
    interni: { readOnly: 'Read only', research: 'Research', onRequest: 'On request', workspaceWrite: 'Workspace write', fullAccess: 'Full access' }, gruppo: 'sicurezza', testo: 'app.sheets.permissions.title' }),
  sessione('conversation.coordination', 'coordinazione', { ...sino, gruppo: 'sicurezza', testo: 'app.sheets.permissions.coordination' }),
  /* Decisioni 173, 189 e 196 (owner 04/11/2026; forma permessi 2 §5): la fiducia della cartella di questa conversazione, la seconda porta
     della domanda e della voce della pillola. Gruppo sicurezza ⇒ carta sempre. Scrive la stessa fonte (`fiducia-cartelle.mjs`); «mai
     chiesta» si legge null. Solo dove l'ospite passa la fonte (il server del PC): sul telefono la voce non c'è. È la fiducia della
     CARTELLA: quella dei singoli ganci, server e plugin resta fuori (CAT-02). */
  voce({ chiave: 'conversation.folderTrust', sezione: 'conversation', ambito: 'conversazione', dove: 'server', fonte: 'fiducia', campo: 'fidata',
    tipo: 'scelta', valori: ['trusted', 'notTrusted'], interni: { trusted: true, notTrusted: false }, gruppo: 'sicurezza', testo: 'chat.trust.menuItem' }),
  sessione('conversation.commandShell', 'dove', { tipo: 'scelta', valori: ['auto', 'windows', 'wsl2'], interni: { auto: null }, testo: 'app.sheets.permissions.whereCommandsRun' }),
  sessione('conversation.bangCommandsInChat', 'comandiNellaConversazione', { ...sino, testo: 'app.sheets.permissions.commandOutputAriaList' }),

  /* Server, tutta l'app o le conversazioni nuove */
  server('context.engine', 'context', 'contesto', 'motore', { tipo: 'scelta', valori: ['engine', 'legacy'], testo: 'varie.contextEngine.card.title' }),
  server('context.summaryModel', 'context', 'contesto', 'modelloDelRiassunto', { tipo: 'modello', nullo: true, gruppo: 'costo', testo: 'varie.compaction.card.modelLabel' }),
  server('context.summaryFallback', 'context', 'contesto', 'riservaDelRiassunto', { tipo: 'modello', nullo: true, ancheConversazione: true, gruppo: 'costo', testo: ['varie.compaction.card.modelLabel', 'varie.compaction.card.backupLabel'] /* forma §5: composto, la pagina non cambia */ }),
  server('models.localWindowFull', 'models', 'finestraLocale', 'scelta', { tipo: 'scelta', valori: ['enlarge', 'summarize', 'ask'], interni: { enlarge: 'allarga', summarize: 'riassumi', ask: 'chiedi' }, testo: 'varie.localWindow.card.title' }),
  server('tools.defaultCommandShell', 'tools', 'comandi', 'doveDiSerie', { tipo: 'scelta', valori: ['auto', 'windows', 'wsl2'], interni: { auto: null }, testo: 'varie.commandsDefault.title' }),
  server('tools.wslNormalUser', 'tools', 'wsl', 'usaUtenteNormale', { ...sino, gruppo: 'sicurezza', testo: 'modello.permissions.useANormalUser' }),
  /* Decisione 310 (06/11/2026), la seconda porta del computer use («Anteprima», spento di serie). Gruppo sicurezza ⇒ la carta c'è SEMPRE,
     anche in accesso pieno: il modello non lo accende da solo. Vale dal giro dopo, senza riavviare (`src/computer-use/impostazione.mjs`). */
  server('tools.computerUse', 'tools', 'computerUse', 'acceso', { ...sino, gruppo: 'sicurezza', testo: 'computer.settings.title' }),
  /* S7: solo la SCELTA fra le fonti già pronte; chiave e indirizzo restano alla persona (la fonte rifiuta una fonte non pronta) */
  server('tools.webSearchSource', 'tools', 'ricerca', 'source', { tipo: 'scelta', valori: ['duckduckgo', 'tavily', 'brave', 'searxng', 'custom', 'off'], testo: 'modello.frammenti.impostazioni.webSearchSource' }),
]);

/*
 * I RIMANDI: impostazioni che hanno già il loro attrezzo (D1: «gli attrezzi di dominio restano»). Escono solo quando una ricerca li
 *   tocca, una riga ciascuno: mai nell'elenco delle sezioni (Performance, condizione 3).
 */
export const RIMANDI_IMPOSTAZIONI = Object.freeze([
  Object.freeze({ parole: ['provider', 'providers', 'openrouter', 'exclude', 'excluded', 'fornitore', 'fornitori'], testo: 'Excluded OpenRouter providers: use provider_exclusions_list, provider_exclude and provider_allow.' }),
  Object.freeze({ parole: ['chatgpt', 'openai', 'account', 'subscription'], testo: 'ChatGPT sign-in and plan: use chatgpt_account.' }),
  Object.freeze({ parole: ['enlarge', 'finestra'], testo: 'Enlarging the local model window now: use local_model_window.' }),
  Object.freeze({ parole: ['remote', 'device', 'devices', 'phone', 'qr', 'pair', 'remoto', 'dispositivo', 'telefono'], testo: 'Remote control and devices: use remote_control and remote_phones.' }),
  Object.freeze({ parole: ['library', 'libreria'], testo: 'How the Library is used: use library_context_policy_update.' }),
  Object.freeze({ parole: ['plan', 'piano', 'mode'], testo: 'Plan mode: use request_plan_mode (the person decides).' }),
]);

const PER_CHIAVE = new Map(CATALOGO_IMPOSTAZIONI.map((v) => [v.chiave, v]));

/** La voce di questa chiave, o null. */
export function voceDelCatalogo(chiave) {
  return typeof chiave === 'string' ? PER_CHIAVE.get(chiave) ?? null : null;
}

/** Dal valore della fonte al valore pubblico (quello che il modello vede). Un valore sconosciuto torna com'è. */
export function valorePubblico(v, interno) {
  if (v.interni) {
    for (const [pubblico, i] of Object.entries(v.interni)) if (i === interno) return pubblico;
  }
  return interno === undefined ? null : interno;
}

/** Dal valore pubblico a quello della fonte. */
export function valoreInterno(v, pubblico) {
  return v.interni && typeof pubblico === 'string' && Object.hasOwn(v.interni, pubblico) ? v.interni[pubblico] : pubblico;
}

const ID_MODELLO = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u;

/**
 * Il valore che il modello ha passato, controllato contro la voce: `{ ok:true, valore }` (pubblico, normalizzato) o `{ ok:false, motivo }`.
 * Un id di modello qui si controlla solo nella FORMA: chi lo sa davvero è la fonte (la rotta già esistente), che lo rifiuta alla scrittura.
 */
export function controllaValore(v, grezzo) {
  if (v.tipo === 'sino') {
    if (typeof grezzo === 'boolean') return { ok: true, valore: grezzo };
    if (grezzo === 'true' || grezzo === 'false') return { ok: true, valore: grezzo === 'true' };
    return { ok: false, motivo: `${v.chiave} is true or false.` };
  }
  if (v.tipo === 'modello') {
    if (grezzo === null && v.nullo) return { ok: true, valore: null };
    if (typeof grezzo === 'string' && grezzo.trim() === 'conversazione' && v.ancheConversazione) return { ok: true, valore: 'conversazione' };
    if (typeof grezzo === 'string' && ID_MODELLO.test(grezzo.trim())) return { ok: true, valore: grezzo.trim() };
    return { ok: false, motivo: `${v.chiave} is a model id like z-ai/glm-5.3-flash${v.nullo ? ', or null' : ''}.` };
  }
  const testo = typeof grezzo === 'number' ? String(grezzo) : grezzo;
  if (typeof testo === 'string' && v.valori.includes(testo)) return { ok: true, valore: testo };
  return { ok: false, motivo: `${v.chiave} is one of: ${v.valori.join(', ')}.` };
}

/** Il catalogo per chi lo mostra (la ricerca delle Impostazioni, il Mobile): niente fonti né campi interni. */
export function catalogoPubblico(voci = CATALOGO_IMPOSTAZIONI) {
  return voci.map((v) => ({ key: v.chiave, section: v.sezione, scope: v.ambito === 'conversazione' ? 'conversation' : 'app', where: v.dove === 'finestra' ? 'window' : 'server',
    type: v.tipo, ...(v.valori && v.tipo !== 'sino' ? { values: [...v.valori] } : {}), ...(v.nullo ? { nullable: true } : {}), group: v.gruppo, text: { en: v.testo.en, it: v.testo.it }, textKey: v.testo.chiave, textKeys: [...v.testo.chiavi] }));
}
