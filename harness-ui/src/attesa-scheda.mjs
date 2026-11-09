/**
 * Aspettare che la scheda grafica renda la memoria (A2-1, decisione owner 26/10 «Sì, subito»; forma 01/11/2026).
 *
 * Un processo uscito non vuol dire memoria già tornata (llama.cpp #19627): se il motore nuovo parte subito, il fitter vede meno spazio e sceglie
 * meno strati o una finestra più piccola, in silenzio. Ollama lo cura in `server/sched.go:1485-1543`, `waitForVRAMRecovery`: controlla ogni 250 ms
 * ed esce al 75% del recuperato, «If we're within ~75% of the estimated memory usage recovered, bail out» (letto il 01/11/2026).
 *
 * Una differenza voluta: Ollama STIMA quanto usava il modello, noi lo MISURIAMO (`liberaPrima - liberaAperto`).
 *
 * Non blocca mai a vuoto: senza una delle due misure, o con una lettura fallita, si apre come oggi (`saltata`). Il Ferma vince (`annullata`) e
 * uccide anche la lettura in corso. Il tetto non è un cancello: a `scaduta` si apre lo stesso, il fitter decide con ciò che vede.
 */
import { spawn } from 'node:child_process';

/** `  Vulkan0: AMD Radeon RX 9070 XT (16304 MiB, 15419 MiB free)`, letto il 01/11/2026 su b11669 e b11960. */
const RIGA_SCHEDA = /^\s*\S+:\s.*\((\d+) MiB, (\d+) MiB free\)\s*$/gmu;
const TETTO_TESTO = 64 * 1024;

/** Condizione del Desktop: si confronta sempre la stessa scheda. Con più d'una non sappiamo quale usa il motore, quindi nessun numero. */
export function liberaDellaSolaScheda(testo) {
  const trovate = [...String(testo ?? '').matchAll(RIGA_SCHEDA)];
  return trovate.length === 1 ? Number(trovate[0][2]) : null;
}

export function creaLettoreScheda({ binaryPath, spawnImpl = spawn, tettoMs: tettoLettura = 3_000, attesaUscitaMs = 2_000 } = {}) {
  return function leggi({ signal, tettoMs = tettoLettura } = {}) {
    return new Promise((risolvi) => {
      if (signal?.aborted) { risolvi(null); return; }
      let figlio;
      try {
        figlio = spawnImpl(binaryPath, ['--list-devices'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false });
      } catch { risolvi(null); return; }
      let testo = '';
      let fermato = false;
      let scaduta = null;
      let addio = null;
      const ascolta = (flusso) => flusso?.on?.('data', (pezzo) => { testo = `${testo}${pezzo}`.slice(-TETTO_TESTO); });
      const ferma = () => {
        fermato = true;
        figlio.kill();
        /* un processo bloccato nel driver può non uscire mai: «non blocca mai a vuoto» vale anche qui (revisione 2, M6) */
        addio = setTimeout(() => fine(null), attesaUscitaMs);
        addio.unref?.();
      };
      const fine = (valore) => {
        clearTimeout(scaduta);
        clearTimeout(addio);
        signal?.removeEventListener('abort', ferma);
        risolvi(valore);
      };
      ascolta(figlio.stdout);
      ascolta(figlio.stderr);
      figlio.once('error', () => fine(null));
      /* si risponde a processo uscito, non al colpo: dopo `annullata` non resta niente di vivo */
      figlio.once('close', (codice) => fine(!fermato && codice === 0 ? liberaDellaSolaScheda(testo) : null));
      signal?.addEventListener('abort', ferma, { once: true });
      scaduta = setTimeout(ferma, Math.min(tettoLettura, tettoMs));
      scaduta.unref?.();
    });
  };
}

function dormiAnnullabile(ms, signal) {
  return new Promise((risolvi) => {
    if (signal?.aborted) { risolvi(); return; }
    const fine = () => { clearTimeout(pausa); signal?.removeEventListener('abort', fine); risolvi(); };
    const pausa = setTimeout(fine, ms);
    pausa.unref?.();
    signal?.addEventListener('abort', fine, { once: true });
  });
}

export function creaAttesaScheda({ leggiLibera, ogniMs = 250, tettoMs = 5_000, quota = 0.75, now = Date.now, dormi = dormiAnnullabile } = {}) {
  async function attendi({ liberaPrima, liberaAperto, signal } = {}) {
    const inizio = now();
    const passati = () => now() - inizio;
    const esito = (nome, liberaMiB = null) => ({ esito: nome, ms: passati(), liberaMiB });
    if (!Number.isFinite(liberaPrima) || !Number.isFinite(liberaAperto) || liberaPrima <= liberaAperto) return esito('saltata');
    const soglia = quota * (liberaPrima - liberaAperto);
    let ultima = null;
    for (;;) {
      if (signal?.aborted) return esito('annullata', ultima);
      /* un `await` solo alla volta: la lettura dopo parte a fine di questa, e sa quanto tempo le resta */
      let letta = null;
      try { letta = await leggiLibera({ signal, tettoMs: tettoMs - passati() }); } catch { /* resta null: si apre come oggi */ }
      if (signal?.aborted) return esito('annullata', ultima);
      if (letta === null) return esito(passati() >= tettoMs ? 'scaduta' : 'saltata', ultima);
      ultima = letta;
      if (letta - liberaAperto >= soglia) return esito('tornata', letta);
      if (passati() + ogniMs > tettoMs) return esito('scaduta', letta);
      await dormi(ogniMs, signal);
    }
  }
  return Object.freeze({ attendi });
}

/**
 * Le misure di una scheda sola, che il motore di oggi e il router si passano: un modello lasciato dall'uno può essere aperto dall'altro.
 *   · `primaDiAprire`: aspetta la memoria del motore di prima, poi legge quella libera adesso. `liberato: false` per il cambio del router, dove
 *     il vecchio modello resta caricato e la sua memoria non tornerà: niente attesa e niente lettura (tornare a un modello aperto è istantaneo,
 *     RT-12), e la `liberaPrima` di prima resta valida: allo stop dopo si aspetta la memoria di tutti i modelli aperti.
 *   · `aperto`: a motore pronto legge in sottofondo. Non fa fallire né ritarda niente: un errore si ingoia e l'apertura dopo sarà `saltata`.
 *   · `ultima`: l'esito dell'ultima attesa, col tempo, per il registro e per il banco (Performance: accanto al tempo di caricamento).
 */
export function creaMemoriaScheda({ leggi, attesa = creaAttesaScheda({ leggiLibera: leggi }) } = {}) {
  let liberaPrima = null;
  let liberaAperto = null;
  let lettura = null;
  let liberando = false;
  let ultima = null;
  const leggiSenzaErrori = async (opzioni) => { try { return await leggi(opzioni); } catch { return null; } };

  async function primaDiAprire({ signal, liberato = true } = {}) {
    if (!liberato) return null;
    /* la lettura a motore pronto può essere ancora in corso: mai due insieme, e la sua cifra non vale più */
    if (lettura) { lettura.ferma.abort(); await lettura.fatta; }
    const misure = { liberaPrima, liberaAperto };
    liberaPrima = null;
    liberaAperto = null;
    /* un'apertura annullata non è mai stata pronta: «aperto» non ha letto, e quel che manca adesso rispetto a prima è il suo */
    const letta = misure.liberaAperto === null && misure.liberaPrima !== null ? await leggiSenzaErrori({ signal }) : null;
    const base = misure.liberaAperto ?? letta;
    let esito = null;
    if (base !== null) {
      liberando = true;
      try { esito = await attesa.attendi({ liberaPrima: misure.liberaPrima, liberaAperto: base, signal }); } finally { liberando = false; }
      ultima = esito;
      /* il Ferma non cancella il debito: la memoria sta ancora tornando, e l'invio subito dopo deve aspettarla (revisione 2, M8) */
      if (esito.esito === 'annullata') { liberaPrima = misure.liberaPrima; liberaAperto = base; return esito; }
    }
    liberaPrima = esito?.liberaMiB ?? letta ?? await leggiSenzaErrori({ signal });
    return esito;
  }

  function aperto() {
    if (liberaPrima === null || lettura) return;
    const ferma = new AbortController();
    const fatta = (async () => {
      const letta = await leggiSenzaErrori({ signal: ferma.signal });
      if (!ferma.signal.aborted) liberaAperto = letta;
      lettura = null;
    })();
    lettura = { ferma, fatta };
  }

  /** Il motore è caduto sul processore, o il router passa al motore di oggi: non c'è memoria della scheda da aspettare. */
  function dimentica() {
    lettura?.ferma.abort();
    liberaPrima = null;
    liberaAperto = null;
  }

  return Object.freeze({ primaDiAprire, aperto, dimentica, liberando: () => liberando, ultima: () => ultima });
}
