/*
 * ⛔ LA PROVA VERA, CON UN MODELLO CHE RAGIONA DAVVERO — NON ESEGUITA DA ME.
 *
 * Perché non l'ho eseguita io (16/09/2026): questa chiamata COSTA, e il permesso permanente
 * dell'owner riguarda `glm-5.3-flash` sul server 4174, che questa corsia non può aprire. Una chiave
 * DeepSeek è presente nell'ambiente, ma spendere su un fornitore per cui non ho un sì esplicito non
 * è una mia decisione. ⇒ Nel rapporto la riga è NON VERIFICATA, e questo è il comando pronto.
 *
 * Cosa dimostra: che un modello VERO che ragiona più di 60 secondi arriva in fondo. Prima della
 * cura veniva tagliato al `timeoutSeconds` del fornitore (default 60 s) mentre stava ancora
 * emettendo token — misurato con un fornitore finto: tagliato a 60.002 ms, ultimo token a 58.023 ms.
 *
 * Uso (dal worktree, cartella harness-ui):
 *     DEEPSEEK_API_KEY=... node tests/aiuto/prova-vera-ragionamento-lungo-corsia-d.mjs
 * oppure, per un altro fornitore diretto già configurato:
 *     TALOS_PROVA_FONTE=zai TALOS_PROVA_MODELLO=glm-5.3-flash ZAI_API_KEY=... node tests/aiuto/prova-vera-ragionamento-lungo-corsia-d.mjs
 *
 * ⛔ Non tocca il 4174: parla direttamente col fornitore, con il negozio delle credenziali in
 *   memoria. Nessuna sessione viene creata, nessun file del prodotto viene scritto.
 *
 * Verde = `ESITO: COMPLETATA`, con `tempo al primo token` e `durata` da leggere: perché la prova
 * valga, la durata deve superare i 60 secondi del vecchio tetto. Se il modello scelto risponde in
 * venti secondi la prova non prova niente — si alza `TALOS_PROVA_DOMANDA` finché non ci mette di più.
 */
import { chiamaConRitenta } from '../../src/kernel/talosHarness.mjs';
import { creaFetchMultiProvider } from '../../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../../src/provider-credential-store.mjs';
import { leggiInattivitaGenerazioneMs } from '../../src/generation-idle.mjs';

const FONTE = process.env.TALOS_PROVA_FONTE ?? 'deepseek';
const MODELLO = process.env.TALOS_PROVA_MODELLO ?? 'deepseek-reasoner';
const DOMANDA = process.env.TALOS_PROVA_DOMANDA ?? [
  'Dimostra passo per passo, senza saltare nessun passaggio e controllando ogni affermazione,',
  'che non esistono interi positivi a, b, c con a^4 + b^4 = c^4. Poi rileggi la tua dimostrazione',
  'cercando ogni punto debole, e dichiara esplicitamente quali passaggi richiederebbero un lemma',
  'che non hai dimostrato. Prenditi tutto il tempo che serve.',
].join(' ');

const store = createProviderCredentialStore({ env: process.env, keyring: null });
if (!store.hasKey(FONTE)) {
  console.error(`Nessuna chiave per «${FONTE}». Esporta la sua variabile d'ambiente e riprova.`);
  process.exit(2);
}
console.log(`fornitore ${FONTE} · modello ${MODELLO}`);
console.log(`timeoutSeconds (ora: tempo alla PRIMA risposta) = ${store.getRuntime(FONTE)?.timeoutSeconds}`);
console.log(`failsafe di silenzio = ${leggiInattivitaGenerazioneMs()} ms`);

const fetchDiRete = creaFetchMultiProvider(fetch, {
  providerStore: store,
  dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) },
});

let primoToken = null;
let pezzi = 0;
const t0 = Date.now();
try {
  const r = await chiamaConRitenta({
    modello: `${FONTE}:${MODELLO}`,
    chiave: store.getKey(FONTE),
    messaggi: [{ role: 'user', content: DOMANDA }],
    attrezzi: [],
    tentativiMassimi: 1,
    fetchDiRete,
    onDelta: () => { pezzi += 1; primoToken ??= Date.now() - t0; },
  });
  const durata = Date.now() - t0;
  const testo = r.scelta?.content ?? '';
  console.log(`ESITO: COMPLETATA · durata ${durata} ms · primo token a ${primoToken} ms · ${pezzi} pezzi · ${testo.length} caratteri`);
  console.log(durata > 60_000
    ? '⭐ la durata supera i 60 s del vecchio tetto: la prova MORDE.'
    : '⛔ durata sotto i 60 s: questa corsa NON prova niente — serve una domanda che faccia ragionare di più.');
} catch (e) {
  console.log(`ESITO: INTERROTTA a ${Date.now() - t0} ms · primo token a ${primoToken} ms · ${e.code ?? e.name} · ${e.message}`);
  process.exitCode = 1;
}
