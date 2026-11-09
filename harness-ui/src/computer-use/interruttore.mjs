/*
 * L'interruttore del computer use (decisioni dell'owner 79 e 80, 03/11/2026; 129, 04/11; 310, 06/11/2026).
 *
 * Decisione 310 (owner 06/11/2026): «computer use nel rilascio come "Anteprima" spento di serie (acceso solo a mano) finché non sono chiusi i
 * 2 critici e i 13 alti». Due livelli:
 * - `COMPUTER_USE_ACCESO`, la costante: la funzione è DENTRO la versione (decisione 129). Spenta, nessuno la può accendere senza cambiare il
 *   codice e passare da una revisione (niente variabile d'ambiente, niente `labs/feature-flags.json`).
 * - la scelta della persona (`impostazione.mjs`), SPENTA DI SERIE: `server.mjs` passa `acceso` come FUNZIONE, che porte, rotte, ponte del
 *   dispositivo e registro delle sessioni rileggono a ogni richiesta e a ogni giro. Si accende solo a mano: la riga «Anteprima» in
 *   Impostazioni → Strumenti, o `app_settings` (`tools.computerUse`) dietro la carta, che per il gruppo sicurezza c'è sempre.
 *
 * Spento (la costante, `acceso` diverso dal vero `true`, o la funzione che in quel momento risponde no):
 * - il registro dei luoghi di «Consenti sempre» non si crea (dal vivo si crea, ma non scrive finché nessuno «Consente sempre»), quindi
 *   nessun file `.computer-use-luoghi.json`;
 * - `http-app.mjs` non riceve `luoghiFn` e le rotte `/api/v1/computer-use/remembered-places` rispondono 404 come una rotta
 *   inventata (dal vivo riceve anche `computerUseAccesoFn` e, spento, risponde 404 a ogni metodo di quelle rotte);
 * - il controllo remoto non riceve `luoghi` (dal vivo riceve `luoghiAccesiFn`): `computer-use.places.*` non entra nell'elenco del
 *   dispositivo (UNKNOWN_OPERATION);
 * - il kernel non riceve `onLuoghiFn` né `onComputerUseFn` (dal vivo il registro delle sessioni li toglie al giro, `computerUseAccesoFn`):
 *   `computer_use_places_*` e `computer_use` non esistono per il modello, né nella scheda degli attrezzi.
 * Acceso (decisione 129, passo 5 del 04/11), `perNucleo` porta al registro delle sessioni i due ospiti: quello dei luoghi e quello del
 * computer use, che avvia l'aiutante nativo solo alla prima chiamata e solo con l'impronta fissata (`aiutante-mcp.mjs`).
 * `ciclo.mjs`, `protezioni.mjs` e `rilevatore.mjs` non li importa nessuno fuori da questa cartella; il sorgente di `native/` non è nel
 * pacchetto (`scripts/prepara-monorepo-pubblico.ps1`, elenco delle inclusioni): ci va solo il binario potato, con la sua impronta, in
 * `resources/aiutante-pc/` (`desktop/scripts/prepara-pacchetto.mjs`). Le prove: `tests/computer-use-interruttore.test.mjs`,
 * `tests/computer-use-aiutante-rilascio.test.mjs`.
 */
import { creaRegistroLuoghi } from './luoghi-ricordati.mjs';
import { creaOspiteLuoghi } from './luoghi-ospite.mjs';
import { creaOspiteComputerUse } from './attrezzo.mjs';
import { creaSessioneAttiva } from './sessione-attiva.mjs';
import { aiutantePerMacchina, aiutanteUsabile, percorsoAiutantePredefinito, IMPRONTA_AIUTANTE_PC } from './aiutante-mcp.mjs';

/* Decisione dell'owner 129 (04/11): il computer use entra nella versione nuova. Cambia la 79-80 solo qui: il verso spento resta provato
   passando `acceso: false` a mano (`tests/computer-use-interruttore.test.mjs`). Dalla 310 (06/11) vuol dire «c'è, come Anteprima»: se è
   acceso lo decide la persona, e di serie è spento (`COMPUTER_USE_DI_SERIE`). */
export const COMPUTER_USE_ACCESO = true;
/* Decisione 310 (06/11/2026): il valore di serie della scelta della persona. Anche le porte chieste senza `acceso` restano spente. */
export const COMPUTER_USE_DI_SERIE = false;

/* Ciò che il modello legge se chiama l'attrezzo a metà di un giro in cui la persona l'ha spento. Nessuna carta, nessun passo. Dal giro dopo
   l'attrezzo non c'è più. */
export const TESTO_COMPUTER_USE_SPENTO = 'Computer use (Preview) is turned off in Settings → Tools. Nothing was done on the screen. '
  + 'Tell the person it is off; only they can turn it on, from Settings or by approving app_settings (key tools.computerUse).';

/** La funzione dal vivo letta in sicurezza: solo il vero `true` accende, un errore spegne. */
function leggiDalVivo(acceso) {
  return () => { try { return acceso() === true; } catch { return false; } };
}

/* Spento dal vivo a metà giro: le fasi prima del compito non chiedono nulla, il compito non parte. Si rilegge a OGNI chiamata. */
function ospiteCheRilegge(ospite, accesoOra) {
  return async function ospiteDalVivo(nome, argomenti, opzioni = {}) {
    if (accesoOra()) return ospite(nome, argomenti, opzioni);
    /* `testo` lo legge il canale di computer_use, `messaggio` quello degli ospiti generici (luoghi) */
    return (opzioni?.fase ?? 'esegui') === 'esegui'
      ? { ok: false, testo: TESTO_COMPUTER_USE_SPENTO, messaggio: TESTO_COMPUTER_USE_SPENTO } : { ok: true, carta: false };
  };
}

/**
 * Ciò che `server.mjs` passa alle porte, deciso dall'interruttore in un posto solo.
 * `acceso`: il vero `true` o `false` SOLO dalle prove; il server passa la FUNZIONE dal vivo (`impostazione.mjs`). Assente: spento
 * (`COMPUTER_USE_DI_SERIE`, decisione 310). Con la costante spenta nemmeno la funzione accende.
 * `aiutante` si passa SOLO dalle prove (un aiutante finto); il server usa quello della macchina, col percorso e l'impronta fissati.
 * `exe` e `impronta` si passano SOLO dalle prove; il server usa il percorso predefinito e l'impronta del commit.
 * Cancello S2 (a) del Tester (05/11/2026): senza un aiutante usabile (impronta non fissata, file assente) il nucleo non riceve gli
 * attrezzi, così il modello non vede `computer_use` e non può dire alla persona di «attivarlo». Restano la pagina e le rotte dei luoghi
 * ricordati, che si possono rivedere e togliere anche su un computer dove l'aiutante non c'è.
 * @param {{ fileLuoghi: string, acceso?: boolean|(() => boolean), aiutante?: object, exe?: string, impronta?: string|null }} p
 */
export function porteDelComputerUse({ fileLuoghi, acceso = COMPUTER_USE_DI_SERIE, aiutante, exe = percorsoAiutantePredefinito(),
  impronta = IMPRONTA_AIUTANTE_PC }) {
  const dalVivo = typeof acceso === 'function';
  if (COMPUTER_USE_ACCESO !== true || (!dalVivo && acceso !== true)) return { registroLuoghi: null, perHttp: {}, perRemoto: {}, perNucleo: {} };
  /* dal vivo: tutto si monta, e ogni porta chiede `accesoOra()` prima di servire. Il valore fisso `true` (solo le prove) resta senza involucri */
  const accesoOra = dalVivo ? leggiDalVivo(acceso) : null;
  const avvolgi = (ospite) => (accesoOra ? ospiteCheRilegge(ospite, accesoOra) : ospite);
  const registroLuoghi = creaRegistroLuoghi({ file: fileLuoghi });
  const conAttrezzi = aiutante !== undefined || aiutanteUsabile({ exe, impronta });
  /* l'aiutante non parte qui: `aiutantePerMacchina` crea solo il cliente, che avvia il processo alla prima chiamata dell'attrezzo */
  const cliente = !conAttrezzi ? null : aiutante ?? aiutantePerMacchina({ exe, improntaAttesa: impronta });
  /* contratto del segno, riga 35 (forma del Desktop 05/11 17:45): quale sessione sta usando il computer, uno per server; senza attrezzi nessun
     compito può partire, quindi nessun segnale e il flusso del PC resta com'era */
  const sessioneAttiva = conAttrezzi ? creaSessioneAttiva() : null;
  return {
    registroLuoghi,
    perHttp: { luoghiFn: () => registroLuoghi, ...(sessioneAttiva ? { sessioneAttivaFn: () => sessioneAttiva } : {}),
      ...(accesoOra ? { computerUseAccesoFn: accesoOra } : {}) },
    perRemoto: { luoghi: registroLuoghi, ...(accesoOra ? { luoghiAccesiFn: accesoOra } : {}) },
    perNucleo: !conAttrezzi ? {} : {
      ospiteLuoghiFn: avvolgi(creaOspiteLuoghi({ registro: registroLuoghi })),
      ospiteComputerUseFn: avvolgi(creaOspiteComputerUse({ aiutante: cliente, registroLuoghi, sessioneAttiva })),
      ...(accesoOra ? { computerUseAccesoFn: accesoOra } : {}),
    },
  };
}
