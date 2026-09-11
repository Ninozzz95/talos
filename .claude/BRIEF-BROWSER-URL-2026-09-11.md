# Brief — il campo URL del browser integrato non apre nessuna scheda (11/09/2026)

> Da consegnare a un agente Opus 5, effort **high**, appena uno dei cinque slot si libera. File in
> esclusiva: `harness-ui/frontend/src/components/browser.js`, la parte di `legacy/app.js` che
> costruisce `creaBrowser` (righe ~10530-10630, azione `apri`) e `harness-ui/src/browser-vivo.mjs`
> se la causa sta lì. ⛔ Verificare che nessun altro agente stia ancora toccando `legacy/app.js`.

## Riproduzione, misurata due volte sul 4174 (ma l'agente NON deve usare il 4174)
Aprendo la vista Browser di una sessione senza schede, scrivendo `example.org` nel campo URL e
premendo Invio (sonda Playwright: `campo.value = u; dispatchEvent(input); dispatchEvent(keydown
Enter)`), il campo accetta il valore, **non nasce nessuna scheda** (`[data-browser-tab]` resta 0) e
**nessun iframe**. Stessa cosa con `example.com`. Nessun avviso a schermo (`#browserAvviso` nascosto).
Il gestore in `browser.js:311` chiama `azioni.apri?.(u)`; quindi o `apri` non crea la scheda, o la
crea in uno stato che `renderizza()` non disegna, o serve il browser pilotato (`browser-vivo.mjs`)
che in quel contesto non parte — e in nessuno dei tre casi la persona viene avvisata.

## Regole
Italiano; commenti col PERCHÉ; ricerca web PRIMA su ogni punto (fonte+data); verso contrario; niente
git; mai la porta 4174 (banco su porta propria, `scripts/serve-lab.mjs`); foto chiaro E scuro;
non copiare `dist/` in `public/`.

## Come chiudere
Riproduzione → causa (file:riga) → cura → prova con Playwright che una scheda nasce e la pagina si
vede → se la scheda NON può nascere (es. browser pilotato assente), un avviso che dice perché.
Rapporto in `.claude/RAPPORTO-BROWSER-URL-2026-09-11.md`. Suite `npm run test:unit` (635 verdi).

## Aggiunta 11/09 sera — DUE AGGANCI in `legacy/app.js` da fare nello stesso giro (stesso file, un agente solo)
1. **BC-13, i locali non aspettino la rete**: `app.js:5637-5659` fa `await apiGet('/api/v1/models')`
   (OpenRouter) e SOLO DOPO chiede i locali; col catalogo irraggiungibile entra nel `catch` di 5656 e
   i locali non si caricano MAI. Misurato: 361 ms → 3 ms partendo con le due richieste insieme. Il
   codice esatto è in `.claude/RAPPORTO-LOCALI-E-ENHANCER-2026-09-11.md`. ⛔ Coordinare con ciò che
   l'agente BC-12 ha fatto in `components/fonti-modelli.js`.
2. **BC-15, il pulsante del prompt enhancer**: in `index.template.html:443`, dentro
   `.talos-composer__bar` subito dopo `#capabilityBtn`; cablaggio (con `dispatchEvent(new
   Event('input'))` dopo l'inserimento) nel rapporto sopra. Componente già pronto:
   `frontend/src/components/migliora-prompt.js`, rotta `POST /api/v1/sessions/:id/migliora-prompt`.
   Nello sprite non c'è un'icona «scintille»: `#i-edit` o una nuova. Skill `frontend-design` prima.
