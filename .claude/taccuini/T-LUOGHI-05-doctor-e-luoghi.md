# T-LUOGHI-05 — Doctor e i luoghi: verifica, e il plurale che diceva «1 ricordi»

> Prova d'uso sul **4178**, Chrome vero via Playwright, 1440×900, tema scuro. 06/09/2026.

## Il difetto curato: BH-12, il plurale

La caccia del 06/09 (`BUG-HUNT-2026-09-06.md`, BH-12): «apri Memoria (1 ricordo) e Officina (1
attrezzo) → **«1 ricordi · globali»**, **«1 attrezzi · 1 abilitato»** — e nella stessa stringa la
seconda metà il singolare lo fa. Nove componenti concatenano numero + sostantivo senza singolare».

⇒ Il plurale viveva in **nove posti**, quindi sbagliava in nove posti. Ora sta in uno:
`src/components/plurale.js`, usato da memoria · officina · board · libreria · capability ·
attività · doctor.

**Ricerca 06/09/2026 — perché una tabella e non solo `Intl.PluralRules`:** `Intl.PluralRules('it')`
dice quale *categoria* usare (`one` · `other`), **non la parola flessa** — MDN: «this does not
return the plural form itself». E l'italiano ha invariabili che nessuna regola meccanica azzecca:
«attività», «file» (prestito). Quindi la categoria la chiede a `Intl`, le due forme sono dichiarate
a mano, **invariabili compresi scritti due volte** perché si veda che è voluto.

⛔ **Due cose imparate misurando, non deducendo:**
1. **Lo zero in italiano prende il plurale** («0 ricordi»), e `Intl` lo sa: `select(0)` torna
   `other`. Un `n === 1 ? …` scritto a mano ci sarebbe cascato.
2. **L'italiano NON raggruppa i numeri di quattro cifre**: `Intl.NumberFormat('it-IT')` dà
   `1234`, non `1.234`, e dà `12.345` da cinque cifre in su (regola CLDR «min2»). Misurato su
   questo runtime — il mio primo test asseriva `1.234` ed **era il test a sbagliare**. È anche il
   motivo per cui «7454 token» nella Memoria e contesto è scritto giusto.

## Doctor — verificato, non fatto (era già lì)

| # | Decisione | L'audit | Verificato dal vivo |
|---|---|---|---|
| D29 | Il Doctor sta dentro le Impostazioni | ✅ | ✅ da «Account, Doctor e backup» → «Doctor» |
| H1-H5 | Controlli raggruppati, con severità e conteggio finale | ⚠️ «non ispezionati» | ✅ **«11 controlli · 2 da rivedere.»**, 11 carte, gravità *Avviso · Nota · OK* |
| H7 | Si esporta in JSON | ⚠️ «non verificato a schermo» | ✅ produce davvero `talos-diagnosi-2026-09-06.json` |

Esempio di carta: «Avviso · Servizio agente — Configurato. Il runtime agente non espone il
catalogo task richiesto.» Severità, cosa, e perché: come vuole H1-H5.

## I luoghi — guardati uno per uno

Aperti Libreria · Memoria · Attività · Board · Officina. Nessun errore JS, nessuna stringa col
plurale sbagliato. **C29** («dove vivono i file, scritto in piccolo») è rispettata almeno in
Memoria: «I ricordi sono conservati in `.memory-store/` · la lettura qui non modifica il
contenuto.»

## Passi

- **Impostazioni → Account, Doctor e backup → Doctor** ✅ · visto: si apre `#schermoDoctor`
- **conteggio e severità** ✅ · visto: «11 controlli · 2 da rivedere.», gravità Avviso/Nota/OK
- **premo «Esporta in JSON»** ✅ · visto: file `talos-diagnosi-2026-09-06.json`
- **giro sui cinque luoghi** ✅ · visto: nessun «1 ricordi»/«1 attrezzi»
- **errori** ✅ · JS 0 · console 0

Foto: `scratchpad/luoghi/foto/T-LUOGHI-05-doctor-e-luoghi/`.

## Verdetto

**PASSA CON RISERVA.**

⛔ **NON VERIFICATO, per nome — e la riserva è tutta qui:**
- **Il plurale col numero UNO, dal vivo.** Il mio store è vuoto di proposito (non ho copiato le 74
  sessioni dell'owner), quindi ogni conteggio a schermo era **0**, che è proprio il caso che il
  vecchio codice azzeccava per sbaglio. Il caso «1» è provato **solo nei test unitari** (12
  asserzioni, `BH-12 PLURALE`). Per vederlo a schermo serve una sessione, un ricordo o un file
  veri.
- **H6** (quanto occupano la app e lo store): fra le 11 carte non l'ho cercata per nome.
- **H9-H10** (pagina più nuova del server: mostrare le due versioni e proporre il riavvio):
  **non fatto**, ed è legato alla riga W0-09.
- **I rimedi eseguibili** di H1-H5 («riavvia il server», «apri la cartella»): le carte mostrano
  cosa fare a parole; **non ho premuto nessun rimedio** e non so se ce ne sono di eseguibili.
- **Libreria C21** (costo in token di un file), **Memoria C22** (gli strati), **Attività C25**
  (l'autore su ogni riga): **non fatte**. Servono dati veri per vederle e, per C22 e C25, un dato
  che oggi il server non manda (l'audit stesso dice «la colonna c'è, il dato no»).
