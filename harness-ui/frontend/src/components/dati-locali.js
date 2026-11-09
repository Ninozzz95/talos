import { t, linguaCorrenteDiT } from './lingua.js';

const localeUI = () => (linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT'); // come runtime-modelli.js:3

/*
 * Impostazioni → Sicurezza e privacy → «Dati locali del browser»: un nome umano per ogni dato salvato e la grandezza in parole.
 * Revisione d'uso della candidata 04/11/2026, reperto 7: l'elenco mostrava le chiavi interne («talos-harness-terminali-v1»,
 * «talos.harness.desktop.settings.section.v1»…) in carattere da codice, ognuna con «· 90 B». Come Hermes
 * (`apps/desktop/src/app/command-center/maintenance.tsx:326-341`: ogni dato salvato ha un'etichetta, mai il nome del file, e
 * `formatBytes` a :35-49 per la grandezza). Le chiavi con lo stesso nome (una bozza per sessione) diventano una riga sola.
 * L'ordine conta: la regola più stretta prima (la sezione delle Impostazioni prima delle Impostazioni).
 */
const REGOLE = [
  [/^talos\.harness\.desktop\.settings\.section\./u, 'settingsSection'],
  [/^talos\.harness\.desktop\.settings\.copy\./u, 'settingsCopy'],
  [/^talos\.harness\.desktop\.settings\./u, 'settings'],
  [/^talos\.desktop\.workspace\./u, 'workspace'],
  [/termina/u, 'terminals'],
  [/composer/u, 'composer'],
  [/modal-sizes/u, 'windowSizes'],
  [/bozze|draft/u, 'drafts'],
  [/\.comandi\./u, 'sentHistory'],
  [/\.barra\./u, 'sidebar'],
  [/bacheca/u, 'board'],
  [/link/u, 'links'],
  [/grafo|workflow-graph/u, 'graphs'],
  [/pannello|cardContesto/u, 'rightPanel'],
  [/sezioni/u, 'sectionViews'],
  [/modelli/u, 'models'],
  [/benvenuto|ritirato/u, 'noticesSeen'],
  [/obiettivo/u, 'goal'],
  [/segnalazione/u, 'reports'],
  [/browser-note/u, 'browserNotes'],
  [/deleghe/u, 'delegations'],
  [/session-deletion/u, 'deletedSessions'],
];

export function nomeDatoLocale(chiave) {
  const regola = REGOLE.find(([forma]) => forma.test(String(chiave)));
  return t(`app.settings.localData.${regola ? regola[1] : 'other'}`);
}

export function grandezzaInParole(byte) {
  if (!Number.isFinite(byte) || byte < 1024) return t('app.settings.localData.underOneKb');
  const mega = byte >= 1024 * 1024;
  const numero = (byte / (mega ? 1024 * 1024 : 1024)).toLocaleString(localeUI(), { maximumFractionDigits: 1 });
  return t(mega ? 'app.settings.localData.megabytes' : 'app.settings.localData.kilobytes', { n: numero });
}

/** [[chiave, byte]] ⇒ [{ nome, byte, quante }], una riga per nome, nell'ordine in cui compaiono. */
export function righeDatiLocali(voci) {
  const perNome = new Map();
  for (const [chiave, byte] of voci) {
    const nome = nomeDatoLocale(chiave);
    const riga = perNome.get(nome) ?? { nome, byte: 0, quante: 0 };
    riga.byte += byte;
    riga.quante += 1;
    perNome.set(nome, riga);
  }
  return [...perNome.values()];
}
