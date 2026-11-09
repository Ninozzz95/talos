// Il lettore unico dei blocchi dell'interfaccia generativa (catalogo v1, 02/11/2026).
//
// Legge il corpo di un recinto `talos-blocco` man mano che arriva: `crea()` → `aggiungi(pezzo)` → `fine()`; restituisce un
// albero già validato contro il catalogo, con lo stato «in-arrivo», «completo» o «rotto» (motivo a codice). Mai lancia.
//
// Sintassi: il sottoinsieme «dati» di OpenUI Lang 1.0 (spec/language.md \§1-2 del clone openui-2026-10-30, MIT; solo la
// specifica, nessun codice): istruzioni `nome = valore`, valori letterali, liste, oggetti, chiamate di componente con
// argomenti posizionali, riferimenti fra istruzioni (anche in avanti). Fuori: operatori, `$stato`, `@funzioni`, Query,
// Mutation, Action \⇒ «espressioneNonAmmessa» (il catalogo v1 è fatto di dati, non di programmi).
//
// LINEARE (condizione 1 di Performance, 2 della CLI): ogni carattere si guarda UNA volta, da un automa a stati con una pila
// esplicita; nessuna rilettura da capo. Il parser di OpenUI rifà invece `preprocess(buf)` sull'intero testo a ogni pezzo
// (`packages/lang-core/src/parser/parser.ts:520`) e rianalizza la coda pendente dall'ultima istruzione chiusa
// (`:536`, `:591-610`): quadratico dentro un'istruzione lunga. Hermes non legge a pezzi affatto: mostra il recinto grezzo
// finché il giro non finisce (`apps/desktop/src/components/assistant-ui/embeds/listing-embed.tsx:38-40`). Di OpenUI si
// tengono le regole: a pezzi = intero (\§4 «Streaming equals parsing»), nessun segnaposto per un riferimento irrisolto (\§4.5),
// chi chiude il flusso è l'ospite (\§4.7).
//
// Il divieto di `scelte` e `modulo` nei blocchi con `fonte` esterna sta QUI (condizione 1 del Mobile).

import {
  CATALOGO,
  PROFONDITA_MASSIMA,
  Rotto,
  SCHEMA_FONTE,
  TIPI_INTERATTIVI,
  VERSIONE_DEL_CATALOGO,
  _ASSENTE as ASSENTE,
  tipoDelComponente,
  validaArgomenti,
  validaSchema,
} from './catalogo.mjs';

export const CARATTERI_MASSIMI = 2_000_000;
export const ISTRUZIONI_MASSIME = 5_000;

class Chiamata {
  constructor(nome, tipo) {
    this.nome = nome;
    this.tipo = tipo;
    this.argomenti = [];
  }
}

class Riferimento {
  constructor(nome) {
    this.nome = nome;
  }
}

const eRiferimento = (v) => v instanceof Riferimento;

// Modi dell'automa dei caratteri.
const NORMALE = 0;
const STRINGA = 1;
const COMMENTO = 2;
const NUMERO = 3;
const NOME = 4;
const BARRA = 5;
const MENO = 6;

// Fasi dell'istruzione a profondità zero.
const INIZIO = 0;
const UGUALE = 1;
const VALORE = 2;
const DOPO = 3;

const PUNTEGGIATURA = new Set(['(', ')', '[', ']', '{', '}', ',', ':', '=']);
const OPERATORI = new Set(['+', '*', '%', '!', '?', '<', '>', '&', '|', '.', '$', '@', '^', '~']);

const eCifra = (c) => c >= 48 && c <= 57;
const eLettera = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const eEsadecimale = (c) => eCifra(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);

const congela = Object.freeze;

/**
 * Crea un lettore per UN recinto. Ogni recinto nuovo vuole un lettore nuovo.
 * @param {{ fonte?: { tipo: 'file'|'attrezzo'|'pagina', nome: string, quando?: string } }} [opzioni]
 *   `fonte`: la provenienza nota all'ospite (pagina, file, attrezzo esterno). Vince su quella scritta dal modello e
 *   vieta `scelte` e `modulo`: la sicurezza non dipende da quello che il modello dichiara.
 */
export function crea(opzioni) {
  // ---- stato dell'automa ----
  let modo = NORMALE;
  let virgolette = 0;
  let testo = '';
  let fuga = 0; // 0 niente, 1 dopo «\», 2 dentro \uXXXX
  let esa = '';
  let numero = '';
  let faseNumero = 0;
  let nome = '';

  // ---- stato del parser ----
  let fase = INIZIO;
  let nomeIstruzione = '';
  let inSospeso = null; // nome con la maiuscola: chiamata se segue «(», altrimenti riferimento
  const pila = [];
  const istruzioni = new Map();

  // ---- stato del lettore ----
  let righe = 0;
  let caratteri = 0;
  let tipoInArrivo = null;
  let finale = null; // risultato definitivo (rotto o completo)
  let ultimoStato = null;
  let fonteOspite = null;

  const rotto = (codice, campo) => {
    const motivo = { codice };
    if (campo !== undefined && campo !== '') motivo.campo = campo;
    motivo.riga = righe + 1;
    return congela({ versione: VERSIONE_DEL_CATALOGO, stato: 'rotto', righe, motivo: congela(motivo) });
  };
  const rompi = (codice, campo) => {
    throw new Rotto(codice, campo);
  };

  if (opzioni && opzioni.fonte !== undefined && opzioni.fonte !== null) {
    try {
      fonteOspite = validaSchema(opzioni.fonte, SCHEMA_FONTE, 'fonte');
    } catch {
      finale = rotto('fonteNonValida', 'fonte');
    }
  }

  // ---- parser dei gettoni ----

  function completa(valore) {
    if (pila.length === 0) {
      if (!istruzioni.has(nomeIstruzione) && istruzioni.size >= ISTRUZIONI_MASSIME) rompi('troppoGrande');
      istruzioni.set(nomeIstruzione, valore);
      fase = DOPO;
      return;
    }
    const f = pila[pila.length - 1];
    if (f.k === 'oggetto') {
      f.v[f.chiave] = valore;
      f.chiave = null;
      f.fase = 'chiave';
    } else if (f.k === 'lista') {
      f.v.push(valore);
    } else {
      f.v.argomenti.push(valore);
    }
  }

  function apri(cornice) {
    if (pila.length >= PROFONDITA_MASSIMA) rompi('troppoAnnidato');
    pila.push(cornice);
  }

  function apriChiamata(nomeComponente) {
    const tipo = tipoDelComponente(nomeComponente);
    if (!tipo) rompi('tipoSconosciuto', nomeComponente);
    if (pila.length === 0 && (nomeIstruzione === 'root' || tipoInArrivo === null)) tipoInArrivo = tipo;
    apri({ k: 'chiamata', v: new Chiamata(nomeComponente, tipo) });
  }

  function iniziaValore(k, v) {
    switch (k) {
      case 'testo':
      case 'num':
      case 'lett':
        completa(v);
        return;
      case '[':
        apri({ k: 'lista', v: [] });
        return;
      case '{':
        apri({ k: 'oggetto', v: Object.create(null), fase: 'chiave', chiave: null });
        return;
      case 'nome': {
        const c = v.charCodeAt(0);
        if (c >= 65 && c <= 90) inSospeso = v;
        else completa(new Riferimento(v));
        return;
      }
      default:
        rompi('sintassi');
    }
  }

  function gettone(k, v) {
    if (inSospeso !== null) {
      const n = inSospeso;
      inSospeso = null;
      if (k === '(') {
        apriChiamata(n);
        return;
      }
      completa(new Riferimento(n));
    }
    if (pila.length === 0) {
      switch (fase) {
        case INIZIO:
          if (k === 'acapo') return;
          if (k === 'nome') {
            nomeIstruzione = v;
            fase = UGUALE;
            return;
          }
          rompi('sintassi');
          return;
        case UGUALE:
          if (k === '=') {
            fase = VALORE;
            return;
          }
          rompi('sintassi');
          return;
        case VALORE:
          if (k === 'acapo') rompi('sintassi');
          iniziaValore(k, v);
          return;
        default: // DOPO
          if (k === 'acapo') {
            fase = INIZIO;
            return;
          }
          rompi('sintassi');
          return;
      }
    }
    if (k === 'acapo') return;
    const f = pila[pila.length - 1];
    if (f.k === 'oggetto') {
      if (f.fase === 'chiave') {
        if (k === ',') return;
        if (k === '}') return chiudi();
        if (k === 'nome' || k === 'testo') {
          f.chiave = v;
          f.fase = 'duepunti';
          return;
        }
        if (k === 'num') {
          f.chiave = String(v);
          f.fase = 'duepunti';
          return;
        }
        rompi('sintassi');
      }
      if (f.fase === 'duepunti') {
        if (k === ':') {
          f.fase = 'valore';
          return;
        }
        rompi('sintassi');
      }
      iniziaValore(k, v);
      return;
    }
    if (k === ',') return;
    if ((k === ']' && f.k === 'lista') || (k === ')' && f.k === 'chiamata')) return chiudi();
    iniziaValore(k, v);
  }

  function chiudi() {
    const f = pila.pop();
    completa(f.v);
  }

  // ---- automa dei caratteri: ogni carattere una volta sola ----

  function chiudiNumero() {
    if (faseNumero === 1) rompi('espressioneNonAmmessa'); // «1.» seguito da altro: accesso a un membro
    if (faseNumero === 3 || faseNumero === 4) rompi('sintassi'); // esponente senza cifre
    modo = NORMALE;
    gettone('num', Number(numero));
  }

  function chiudiNome() {
    modo = NORMALE;
    if (nome === 'true') gettone('lett', true);
    else if (nome === 'false') gettone('lett', false);
    else if (nome === 'null') gettone('lett', null);
    else gettone('nome', nome);
  }

  function fugaFinita(c) {
    // dopo «\»: le fughe JSON nelle doppie virgolette; nelle semplici solo \' \\ \n \t; ogni altra si tiene com'è
    const doppie = virgolette === 34;
    switch (c) {
      case 110: testo += '\n'; break;
      case 116: testo += '\t'; break;
      case 114: testo += doppie ? '\r' : 'r'; break;
      case 98: testo += doppie ? '\b' : 'b'; break;
      case 102: testo += doppie ? '\f' : 'f'; break;
      case 117:
        if (doppie) {
          fuga = 2;
          esa = '';
          return;
        }
        testo += 'u';
        break;
      default: testo += String.fromCharCode(c);
    }
    fuga = 0;
  }

  function consuma(pezzo) {
    const n = pezzo.length;
    let i = 0;
    while (i < n) {
      let c = pezzo.charCodeAt(i);
      if (modo === STRINGA) {
        if (fuga === 1) {
          if (c === 10) righe += 1;
          fugaFinita(c);
          i += 1;
          continue;
        }
        if (fuga === 2) {
          if (eEsadecimale(c)) {
            esa += pezzo[i];
            i += 1;
            if (esa.length === 4) {
              testo += String.fromCharCode(parseInt(esa, 16));
              fuga = 0;
            }
            continue;
          }
          testo += `u${esa}`; // fuga \u rotta: si tiene il testo, e il carattere si riguarda da capo
          fuga = 0;
          continue;
        }
        // corsa veloce fino alla prossima virgoletta o barra rovescia
        let j = i;
        while (j < n) {
          const d = pezzo.charCodeAt(j);
          if (d === virgolette || d === 92) break;
          if (d === 10) righe += 1;
          j += 1;
        }
        if (j > i) testo += pezzo.slice(i, j);
        if (j === n) return;
        i = j + 1;
        if (pezzo.charCodeAt(j) === 92) {
          fuga = 1;
          continue;
        }
        modo = NORMALE;
        const fatto = testo;
        testo = '';
        gettone('testo', fatto);
        continue;
      }
      if (modo === COMMENTO) {
        if (c === 10) {
          modo = NORMALE;
          continue; // l'a capo si riguarda in NORMALE
        }
        i += 1;
        continue;
      }
      if (modo === NUMERO) {
        if (eCifra(c)) {
          numero += pezzo[i];
          if (faseNumero === 1) faseNumero = 2;
          else if (faseNumero === 3 || faseNumero === 4) faseNumero = 5;
          i += 1;
          continue;
        }
        if (c === 46 && faseNumero === 0) {
          numero += '.';
          faseNumero = 1;
          i += 1;
          continue;
        }
        if ((c === 101 || c === 69) && (faseNumero === 0 || faseNumero === 2)) {
          numero += 'e';
          faseNumero = 3;
          i += 1;
          continue;
        }
        if ((c === 43 || c === 45) && faseNumero === 3) {
          numero += pezzo[i];
          faseNumero = 4;
          i += 1;
          continue;
        }
        chiudiNumero();
        continue; // il carattere si riguarda in NORMALE
      }
      if (modo === NOME) {
        if (eLettera(c) || eCifra(c)) {
          nome += pezzo[i];
          i += 1;
          continue;
        }
        chiudiNome();
        continue;
      }
      if (modo === BARRA) {
        if (c === 47) {
          modo = COMMENTO;
          i += 1;
          continue;
        }
        rompi('espressioneNonAmmessa');
      }
      if (modo === MENO) {
        if (!eCifra(c)) rompi('espressioneNonAmmessa');
        modo = NUMERO;
        numero = '-';
        faseNumero = 0;
        continue;
      }
      // NORMALE
      i += 1;
      if (c === 32 || c === 9 || c === 13) continue;
      if (c === 10) {
        righe += 1;
        gettone('acapo');
        continue;
      }
      if (c === 34 || c === 39) {
        modo = STRINGA;
        virgolette = c;
        testo = '';
        fuga = 0;
        continue;
      }
      if (eCifra(c)) {
        modo = NUMERO;
        numero = pezzo[i - 1];
        faseNumero = 0;
        continue;
      }
      if (eLettera(c)) {
        modo = NOME;
        nome = pezzo[i - 1];
        continue;
      }
      if (c === 45) {
        modo = MENO;
        continue;
      }
      if (c === 47) {
        modo = BARRA;
        continue;
      }
      if (c === 35) {
        modo = COMMENTO;
        continue;
      }
      const s = pezzo[i - 1];
      if (PUNTEGGIATURA.has(s)) {
        gettone(s);
        continue;
      }
      if (OPERATORI.has(s)) rompi('espressioneNonAmmessa');
      // ogni altro carattere fuori dalle stringhe si salta, come in OpenUI \§1.3 («a;b» sono «a» e «b»)
    }
  }

  // ---- validazione contro il catalogo ----

  function risolutore() {
    const aperti = new Set();
    return (rif, percorso, parziale, poi) => {
      if (aperti.has(rif.nome)) rompi('riferimentoCircolare', percorso);
      if (!istruzioni.has(rif.nome)) {
        if (parziale) return ASSENTE;
        rompi('riferimentoMancante', percorso);
      }
      aperti.add(rif.nome);
      try {
        return poi(istruzioni.get(rif.nome));
      } finally {
        aperti.delete(rif.nome);
      }
    };
  }

  function radice(parziale) {
    let v = istruzioni.has('root') ? istruzioni.get('root') : undefined;
    if (v === undefined) {
      for (const valore of istruzioni.values()) {
        if (valore instanceof Chiamata) {
          v = valore;
          break;
        }
      }
    }
    if (v === undefined) return parziale ? null : rompi('nessunaRadice');
    // root = altroNome: si segue la catena (con la pila dei nomi aperti)
    const visti = new Set(['root']);
    while (v instanceof Riferimento) {
      if (visti.has(v.nome)) rompi('riferimentoCircolare', 'root');
      visti.add(v.nome);
      if (!istruzioni.has(v.nome)) return parziale ? null : rompi('riferimentoMancante', 'root');
      v = istruzioni.get(v.nome);
    }
    if (!(v instanceof Chiamata)) return parziale ? null : rompi('nessunaRadice');
    return v;
  }

  function valida(chiamata, parziale) {
    let blocco = validaArgomenti(chiamata.tipo, chiamata.argomenti, { parziale, eRiferimento, risolvi: risolutore() });
    if (fonteOspite) {
      blocco = { ...blocco };
      delete blocco.fonte;
      blocco.fonte = fonteOspite;
      blocco = congela(blocco);
    }
    if (blocco.fonte && TIPI_INTERATTIVI.includes(blocco.tipo)) rompi('interazioneDaFonteEsterna', 'fonte');
    return blocco;
  }

  function chiudiTutto() {
    if (modo === STRINGA) rompi('bloccoIncompleto');
    if (modo === NUMERO) chiudiNumero();
    else if (modo === NOME) chiudiNome();
    else if (modo === BARRA || modo === MENO) rompi('espressioneNonAmmessa');
    modo = NORMALE;
    // «root =» o «root» alla fine: l'istruzione è a metà, non sbagliata
    if (pila.length === 0 && inSospeso === null && (fase === UGUALE || fase === VALORE)) rompi('bloccoIncompleto');
    gettone('acapo');
    if (pila.length > 0) rompi('bloccoIncompleto');
    const blocco = valida(radice(false), false);
    return congela({ versione: VERSIONE_DEL_CATALOGO, stato: 'completo', righe, blocco });
  }

  function statoInArrivo() {
    if (!ultimoStato || ultimoStato.righe !== righe || ultimoStato.tipo !== tipoInArrivo) {
      ultimoStato = congela({ versione: VERSIONE_DEL_CATALOGO, stato: 'in-arrivo', tipo: tipoInArrivo, righe });
    }
    return ultimoStato;
  }

  function daErrore(errore) {
    return errore instanceof Rotto ? rotto(errore.codice, errore.campo) : rotto('erroreInterno');
  }

  // Istantanea: le cornici aperte si appendono per un momento ai genitori, si valida in modo parziale, si stacca tutto.
  function vistaParziale() {
    const annulla = [];
    const appendi = (f, valore) => {
      if (f.k === 'oggetto') {
        if (f.fase !== 'valore') return;
        const chiave = f.chiave;
        f.v[chiave] = valore;
        annulla.push(() => {
          delete f.v[chiave];
        });
      } else {
        const lista = f.k === 'lista' ? f.v : f.v.argomenti;
        lista.push(valore);
        annulla.push(() => lista.pop());
      }
    };
    try {
      if (modo === STRINGA && fuga === 0 && testo !== '' && pila.length > 0) appendi(pila[pila.length - 1], testo);
      for (let k = pila.length - 1; k > 0; k -= 1) appendi(pila[k - 1], pila[k].v);
      const inCorso = pila.length > 0 && pila[0].k === 'chiamata' ? pila[0].v : null;
      let chiamata = nomeIstruzione === 'root' && inCorso ? inCorso : radice(true);
      if (!chiamata) chiamata = inCorso;
      if (!chiamata) return null;
      return valida(chiamata, true);
    } catch {
      return null;
    } finally {
      for (let k = annulla.length - 1; k >= 0; k -= 1) annulla[k]();
    }
  }

  return {
    /**
     * Aggiunge un pezzo del corpo del recinto. Costo proporzionale al pezzo, mai al testo già letto.
     * @returns {{ versione: number, stato: 'in-arrivo', tipo: string|null, righe: number } | object} lo stato; dopo `fine()` o
     *   un blocco rotto, sempre lo stesso risultato definitivo
     */
    aggiungi(pezzo) {
      if (finale) return finale;
      try {
        if (typeof pezzo !== 'string') rompi('pezzoNonValido');
        caratteri += pezzo.length;
        if (caratteri > CARATTERI_MASSIMI) rompi('troppoGrande');
        consuma(pezzo);
        return statoInArrivo();
      } catch (errore) {
        finale = daErrore(errore);
        return finale;
      }
    },
    /** Fine del flusso (la dà l'ospite, come OpenUI \§4.7): l'albero completo o il motivo del rotto. */
    fine() {
      if (finale) return finale;
      try {
        finale = chiudiTutto();
      } catch (errore) {
        finale = daErrore(errore);
      }
      return finale;
    },
    /**
     * L'albero parziale per disegnare mentre arriva: costo proporzionale al blocco, da chiamare al ritmo del disegno
     * (33 ms sul PC), MAI a ogni pezzo. Solo valori chiusi o testo già arrivato, nessun segnaposto.
     */
    istantanea() {
      if (finale) return finale;
      try {
        return congela({ ...statoInArrivo(), parziale: vistaParziale() });
      } catch {
        return congela({ ...statoInArrivo(), parziale: null });
      }
    },
  };
}

/** Lettura di un blocco intero: `crea()`, un pezzo solo, `fine()`. */
export function leggi(testo, opzioni) {
  const lettore = crea(opzioni);
  lettore.aggiungi(testo);
  return lettore.fine();
}

export { CATALOGO };
