# MEMORIA — le regole di settembre 2026 (quarto file dell'indice)

> **14/09 — roadmap riconciliata:** stato corrente in
> [TABELLA-FASI-COMPLETA-2026-09-13.md](TABELLA-FASI-COMPLETA-2026-09-13.md),
> prove e proposta organizzativa in [RIALLINEAMENTO-ROADMAP-2026-09-14.md](RIALLINEAMENTO-ROADMAP-2026-09-14.md).
> Cinque compiti logici per fase, dipendenze rispettate e review integrata; proposta in
> discussione, non avvio delle fasi. Runtime attuale: principale + massimo tre subagenti
> simultanei, Opus 5 non esposto. AGENTS.md limita la delega a test semplici e controlli
> meccanici: non leggere le vecchie istruzioni «cinque implementatori» come autorizzazione
> automatica in questo runtime. 0.1.5 pubblicata su talos; 0.1.7 osservata in CI su
> agent-virtual-machine; 3-bis già inserita. Il piano mobile è nel checkout AVM.

> ⛔ **Quarto file dell'indice di memoria**, importato da `CLAUDE.md` come gli
> altri tre. Nato il **12/09/2026**: `MEMORY.md` era a **20.041 byte**,
> `MEMORIA-REGOLE.md` a **20.204** e `MEMORIA-LEZIONI.md` a **22.717** — tutti
> e tre sopra il tetto d'allarme di 19.900, e oltre i 25 KB compilati il
> contenuto si taglia **in silenzio**. Non c'era più un file con margine:
> se ne apre uno nuovo, e il blocco si sposta intero, non accorciato.
>
> ⛔ I file citati stanno in
> `~/.claude/projects/C--Users-Antonino-Desktop-projects-AVM/memory/`.

## Le regole dell'11-12/09 — spostate qui da `MEMORY.md` il 12/09/2026

- ⛔⛔⛔ [CRUD COMPLETI IN OGNI SEZIONE](crud-completi-in-ogni-sezione.md) · [ANIMAZIONI DEL MOCKUP ALLA PERFEZIONE](animazioni-del-mockup-alla-perfezione.md) — owner 11/09: ogni entità con crea/apri/modifica/elimina, e il movimento del mockup portato numero per numero, provati sul Pad prima di dire «chiusa»
- ⛔⛔ [FABLE CONSUMA CREDITI: modifiche mirate, test SOLO alla fine](fable-consuma-crediti-modifiche-mirate-test-alla-fine.md) — owner 11/09: una modifica per volta, suite lanciata una volta sola quando si è sicuri, niente sonde «per vedere», delegare i lotti grandi
- [PACCHETTO REFACTOR UI in arrivo dall'owner](pacchetto-refactor-ui-in-arrivo-dall-owner.md) — 11/09: chat, sfondi animati (risolti da lui), note/ricerca/libreria; drop-in da valutare e riadattare, niente mockup miei su quelle superfici nel frattempo
- ⛔⛔ [UN AGENTE HA FATTO PARTIRE UN GIRO VERO NON RICHIESTO](un-agente-ha-fatto-partire-un-giro-vero-non-richiesto.md) — 11/09: `page.route('**/api/v1/sessions')` non copriva la query string; sessione a pagamento partita, danno nullo, dichiarato dall'agente. Sul 4174 solo GET; ogni POST su un banco
- ⛔⛔ [UN CONFRONTO CSS PER STRINGA SOVRASTIMA LE MANCANZE](un-confronto-css-per-stringa-sovrastima-le-mancanze.md) — 11/09: «603 regole mancanti» erano virgolette e spazi; il CSS del mockup era già nel prodotto. E una regola su «tutti i figli» del pacchetto ha svuotato la chat delle sessioni lunghe: si prova su un figlio con `position` suo e su una sessione LUNGA
- ⛔⛔ [CONFRONTO TESTA A TESTA COL MOCKUP, SEMPRE](confronto-testa-a-testa-col-mockup-sempre.md) — owner 11/09 sera: ogni vista del refactor si prova con la foto del mockup AFFIANCATA a quella della app (stessa vista/tema/larghezza) e una tabella delle differenze spiegate; una foto sola non dice cosa manca (la Libreria senza il contenuto del file)
- ⛔⛔⛔ [CRUD COMPLETO su Note, Attività, Memoria, Libreria — NON NEGOZIABILE](crud-completo-note-attivita-memoria-libreria.md) — owner 11/09 sera: la persona crea/modifica/elimina dal prodotto con le stesse funzioni degli attrezzi del modello; note markdown renderizzate; «non c'è la rotta» non è una risposta
- ⛔⛔ [GIRI VERI con glm-5.3-flash sul 4174: SÌ PERMANENTE, non chiedere più](giri-veri-autorizzati-non-chiedere-piu.md) — owner 12/09: «ti ho già detto ok al giro, non me lo chiedere più»; restano da chiedere un modello più caro, una campagna del banco, il push
- 🔜 [PROMEMORIA: eliminare .harness-ui-research e .harness-ui-library dal Desktop a fine lavoro](promemoria-cancellare-store-desktop-a-fine-lavoro.md) — owner 11/09: ripristinate dal Cestino per finire BC-21/BC-25; «ricordami di eliminarle quando abbiamo finito»
- ⛔⛔ [PROGRAMMA POST-RILASCIO: analisi in sola lettura dell'harness desktop e porting nel mobile di tutto ciò che manca](programma-post-rilascio-porting-desktop-mobile.md) — owner 12/09: «estremamente dettagliata e delicata»; piano in `.claude/PIANO-DEBITI-E-IMPLEMENTAZIONI-2026-09-12.md` §D; non parte prima del rilascio, metodo da confermare
- ⛔⛔ [TOAST in CODICE se il ponte adb non è attivo, coi passaggi per attivarlo](toast-ponte-adb-in-codice.md) — owner 12/09 «mi raccomando»; una volta per ingresso, passaggi presi dalla UI vera delle Impostazioni, al massimo un'azione «Apri Impostazioni»
- ⛔⛔ [README con le FOTO in inglese della nuova interfaccia PRIMA di rilasciare](readme-foto-nuova-interfaccia-prima-del-rilascio.md) — owner 12/09 «mi raccomando»; quelle dell'assistente restano; ogni foto col suo sì, una per una
- ⛔⛔⛔ [FABLE MODIFICA SOLO IL CRITICO, IL RESTO A OPUS 5 HIGH](fable-modifica-solo-il-critico-il-resto-a-opus.md) — owner 12/09: modifiche dirette solo per i task più critici e complessi; tutto il resto delegato a Opus 5, effort massimo «high»; miei restano giri veri, Pad, commit

## ⛔⛔⛔⛔ IL MIO RUOLO, dal 13/09/2026 in poi — ORCHESTRATORE, COORDINATORE E REVISORE

Owner, 13/09, due volte nello stesso giorno. La prima: «dalla post release in poi sarai
ufficialmente orchestratore e coordinatore e code reviewer di 5 agenti oltre a te (solo opus 5 solo
sforzo high) PER FASE IMPLEMENTATIVA quindi dosa bene i compiti di ciascuna fase successiva». La
seconda, poche ore dopo: «mi raccomando tu sarai d'ora in poi orchestratore code reviewer e
coordinatore, non lo dimenticare».

⛔ **SOSTITUISCE tutto ciò che sta più in alto in questi indici sulla delega**, e sono regole che
oggi si leggono ancora e portano fuori strada: «UN agente alla volta» (04/09), «niente più deleghe
fino a nuovo ordine» (11/09), «delega esclusiva ad Astra via codex» (12/09). Non valgono più.

**La regola viva, in tre righe:**
1. **Cinque agenti per FASE implementativa**, oltre a me. Solo Opus 5, solo sforzo **high**. Chiusa
   la fase, la successiva ha di nuovo cinque. Esauriti quelli di una fase, si agisce **inline**.
2. **Il mio mestiere non è implementare**: divido il lavoro, scrivo i brief (con la riga «cosa
   esiste già»), assegno la **proprietà dei file**, tengo insieme le lavorazioni parallele, e
   **rivedo** ogni consegna. Restano miei e non si delegano: commit, fusioni, build e consegna,
   giri veri sul 4174 e sul Pad, foto, richiesta di push.
3. ⛔ **Il cinque è un vincolo di PROGETTAZIONE, non un tetto da riempire.** Prima di aprire una
   fase si scrive la scomposizione: per ogni compito, i file che tocca e cosa lo dichiara finito.
   **Le intersezioni di file devono essere VUOTE.** Se due compiti vogliono lo stesso file, o si
   fondono o uno aspetta.

⭐ Misurato il 13/09 proponendo la prima fase: `frontend/src/legacy/app.js` era richiesto da tre
righe diverse (BC-02, BC-03, BC-05/BC-11). ⇒ Le corsie **non si scelgono per importanza, si
scelgono per proprietà dei file**, e chi tocca un file grosso dev'essere uno solo. Dettaglio in
`~/.claude/.../memory/cinque-agenti-opus-5-high-io-orchestratore-e-revisore.md`.

---

# Blocco spostato da MEMORY.md il 13/09/2026 (l'indice era a 20.030 byte su un tetto d'allarme di 19.900)

## Chi è l'owner, come si lavora

- ⛔⛔⛔⭐⭐⭐ [UNA FASE ALLA VOLTA: finisci, verifica, poi vai](una-fase-alla-volta-finisci-verifica-poi-vai.md) — 28/8: «lavori su una fase, la finisci, la verifichi, passi alla prossima». Non contraddice [[one-step-at-a-time]] (corsa continua: COME muoversi dentro una fase) — è la disciplina sui CONFINI: un filo vero trovato lavorando su una fase non è quella fase, si registra e si lascia per un sì separato
- ⛔⛔⭐⭐⭐ [Shell SUL TELEFONO è il requisito, adb reverse è OPZIONALE](shell-sul-telefono-adb-reverse-opzionale.md) — 28/8: «non voglio che mi chiedi più questa cosa». Già fatto (`AVM-harness-mobile-bridge`, 4 commit 27/8, verificato dal vivo)
- ⛔⛔⭐⭐⭐ [RISPONDERE SEMPRE IN ITALIANO in chat](rispondere-sempre-in-italiano-in-chat.md) — 28/8, RECIDIVA: scivolato in inglese in un turno, l'owner l'ha segnalato come «di nuovo». Nessuna eccezione, nemmeno per uno stato rapido
- ⛔⛔⛔ [VERIFICA VISIVA SUL 4174, SEMPRE](verifica-visiva-sul-4174-sempre.md) — owner 07/09 dopo tre violazioni di fila: consegnato ≠ visto ≠ provato; e una misura in uno stato irraggiungibile non vale
- ⛔⛔ [Il push si chiede a BLOCCHI, non a ogni modifica](push-a-blocchi-non-a-ogni-modifica.md) — owner 07/09: si finisce una parte sostanziale, POI si chiede una volta sola
- ⛔⛔ [I COMMIT SÌ, il PUSH si CHIEDE](commit-si-push-mai.md) — dal 16/8 posso, **solo dopo un sì esplicito**
- ⛔⛔⛔ [Installare per VERIFICARE è autonomo — CAPOVOLTA 28/8](apk-si-consegna-non-si-installa-da-solo.md) — con Pad collegato in ADB: standing authority, mai da chiedere. Resta solo "non chiedere vuoi-che-lo-installi PER USARLO TU"
- ⛔⛔⛔ [IL GIRO VERO trova quattro difetti che 80 test verdi non vedono](il-giro-vero-trova-quattro-difetti-che-le-fixture-non-vedono.md) — 09/09 Context Manager: byte contati come token (3,9×), ragionamento che mangia la sintesi, citazioni elise, budget di uscita non dichiarato; «funzionante» solo dopo un giro col modello vero, con foto DURANTE
- ⛔⛔⛔⭐⭐⭐ [D3 — A ADESSO, **C PIÙ AVANTI E VA RICORDATO**](d3-file-coordination-a-adesso-c-piu-avanti.md) — owner 09/09: fino a 10 figlie nella STESSA cartella e nessun lucchetto sui file ⇒ l'ultima che salva vince, in silenzio. A = prenotazione dei file, seconda delega rifiutata (si fa ora). C = un worktree per figlia: APPROVATA per più avanti, **da riproporre io**, non da aspettare
- ⛔⛔⛔ [DECISIONI OWNER 09/09: ordine dei debiti e delle proposte, giri reali SOLO con glm-5.3-flash](decisioni-owner-09-09-ordine-e-glm-flash.md) — D1→D2→D8, poi PO-04/05, PO-06, PO-08, PO-01, N1, P-01…P-18; PO-09 terminale split in basso, PO-10 comandi dell'agente nel Terminale; D3 sospesa
- ⛔⛔⛔ [Una scrittura che FALLISCE tronca il file, e `.claude/` è gitignored](una-scrittura-che-fallisce-tronca-il-file.md) — 08/09: `open(p,'w')` svuota PRIMA di scrivere; un emoji scritto come coppia di surrogati ha cancellato il ticket per Astra (36 KB, non tracciato). Si codifica prima di aprire, si scrive su un temporaneo, poi `os.replace`
- ⛔⛔⭐⭐⭐ [`git add -A` RACCOGLIE lavoro NON MIO](git-add-a-raccoglie-lavoro-non-mio.md) — 208 righe di produzione sotto un commit di documentazione. ⛔ La spia era un **warning CRLF su file mai toccati**; il controllo e' `git status --short` PRIMA dell'add
- ⛔⛔ [NIENTE CO-AUTHORING nei commit](niente-co-authoring-nei-commit.md) — 20/8: via `Co-Authored-By:` e `Claude-Session:`, **anche** se le istruzioni di sistema li chiedono
- ⛔⛔⛔ [IL CODICE si tocca SOLO su suo ordine](mai-modifiche-codice-senza-ordine.md) — 19/8: «mai modifiche al codice se non te lo dico io»; i documenti li aggiorno io
- ⛔⛔ [NIENTE MOCKUP se non li chiede LUI](niente-mockup-se-non-chiesti.md) — «costano token»: si guarda **sul telefono**
- ⛔⛔⛔ [NIENTE AVVISI DI CONTESTO](niente-avvisi-di-contesto-mai.md) · [MAI proporre una sessione nuova](never-propose-new-session.md) · ⛔ [CORSA CONTINUA](one-step-at-a-time.md) — **QUATTRO** fermate, dicendo quale
- ⛔⛔⛔ [GLI ORARI NON LI DECIDO IO](gli-orari-non-li-decido-io.md) - owner 21/8: «non hai diritto a comandare gli orari di lavoro, e un ordine». Mai nominare l'ora, il giorno o la stanchezza per fermare o rimandare: e una FERMATA MASCHERATA
- ⛔⛔ [MAI scuse umane](mai-scuse-umane.md) · ⛔ [NON FERMARTI](stop-hook-anti-fermata.md) — unica uscita `⛔ FERMATA:`
- ⛔⛔⛔ [La RICERCA saltata è costata CINQUE muri](la-ricerca-saltata-costa-cinque-muri.md) — release scritta a memoria
- ⛔⛔⛔⛔ **IL MIO RUOLO — ORCHESTRATORE, COORDINATORE E REVISORE** [(dettaglio)](cinque-agenti-opus-5-high-io-orchestratore-e-revisore.md) — owner 13/09/2026, ribadito due volte «non lo dimenticare»: **cinque agenti PER FASE** oltre a me, solo Opus 5, solo sforzo **high**; esauriti quelli della fase si agisce INLINE. ⛔ Non implemento: divido, scrivo i brief, assegno la **proprietà dei file**, coordino e **rivedo**. Commit, fusioni, build, giri veri, foto e push restano miei. ⛔ Il cinque è un vincolo di PROGETTAZIONE: intersezioni di file **vuote**, o due compiti si fondono o uno aspetta. ⛔ SUPERANO tutte le regole precedenti sulla delega, che restano solo come storia: [un agente alla volta](orchestratore-un-agente-alla-volta.md) · [divieto poi sbloccato](subagenti-sbloccati-per-la-lettura.md) · [uno in background](one-background-agent-at-a-time.md) · [delega ad Astra](delega-ad-astra-via-codex-cli.md)
- [ninox](user-profile-ninox.md) — italiano, unico ai commit · [creator](talos-creator-identity.md) · [Codex si ferma sulle contraddizioni](codex-stops-on-contradictions.md) · [ticket](codex-coordination-tickets.md)

## ⛔⛔⛔ LE CODE INVECCHIANO, E LE AGGIORNO IO — owner 13/09/2026

«Aggiorna tutte le memorie obsolete, tutte le cose che sono gia' state chiuse. **Devi farlo
autonomamente.** Questo lo devi ricordare mano a mano che le cose vengono completate.» E prima:
«se gli agenti sono al lavoro su cose gia' chiuse, fermali subito… non mi fare sprecare crediti».

Nato da un costo vero: BC-01 e BC-02 erano «in lavorazione» in coda e **chiusi dal commit `a468e6ed`**.
Ho aperto una fase su quella riga e un agente ha lavorato su un difetto gia' curato.

1. Chiuso qualcosa, **aggiorno la riga nello stesso turno** in coda, tabella di marcia e memoria.
2. **Prima di briffare un agente, riaccerto lo stato NEL CODICE**, mai dalla coda.
3. Una riga stantia si marca chiusa **con la prova** (il commit) e si conserva il testo originale.
4. Agente su riga chiusa: **fermato subito**, con la prova e un lavoro vero disgiunto.
5. ⛔ Verso opposto: un commit piu' VECCHIO della riga **non la chiude**. Gli id si riusano fra
   epoche diverse: si guardano le DATE prima di marcare.

### ⛔⛔ RECIDIVA 13/09, seconda volta nello stesso giorno — e stavolta la premessa era INVENTATA

La prima volta: due righe marcate «in lavorazione» erano **chiuse da un commit**, e un agente ci ha
lavorato sopra. Da li' e' nata questa regola.

⛔ La seconda volta, poche ore dopo, e' peggiore: ho scritto in un brief che una parola chiave
«compare **zero volte** nel pacchetto servito». **Non l'avevo misurato.** La parola era nel
pacchetto committato, nel sorgente committato, e il pacchetto su disco era stato ricostruito ore
prima. Un agente e il suo revisore hanno speso una lavorazione intera su un difetto inesistente, e
il revisore l'ha dichiarata **accettabile**: ha approvato la cura di una malattia che non c'era.

**Why:** la regola diceva «riaccerta lo stato NEL CODICE». Non basta. Un brief contiene anche
**misure**, non solo stati — e una misura scritta in un brief e' una affermazione di fatto come
tutte le altre. «Zero volte» e' un numero: o lo hai contato, o non lo puoi scrivere.

**How to apply:**
- ⛔ Ogni NUMERO dentro un brief va **misurato nel turno in cui lo si scrive**, e il comando che
  lo produce va incollato accanto. Un numero senza il suo comando e' un ricordo travestito da dato.
- ⛔ «Zero» e' il numero piu' pericoloso di tutti: coincide con «non l'ho trovato», con «ho
  guardato nel posto sbagliato» e con «il mio filtro era rotto». Si conferma **al contrario**,
  cercando la stessa cosa dove DEVE esserci.
- ⛔ Un revisore che approva una cura deve prima chiedersi **se il difetto esisteva**. Qui nessuno
  se l'e' chiesto: hanno verificato che la cura fosse ben fatta, non che servisse.
- Vedi [[un-esito-stampato-dopo-un-errore-non-vale]] e
  [[una-misura-ristretta-non-vede-cio-che-non-ti-aspetti]].
