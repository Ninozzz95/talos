# Censimento delle skill di terzi — 2026-08-02

Recuperato da un agente rimasto orfano dopo che ho fermato il suo genitore.
Dati primari, con le due correzioni che l'agente stesso si e' fatto.

## `SKILL.md` e' l'unita' interoperabile de facto

La spec **agentskills.io** e' implementata da Copilot (VS Code, CLI, agente
cloud), Gemini CLI, Cursor, Zed, Kiro, e da `gh skill install` che dichiara 13+
host. **`.agents/skills/` e' l'alias neutrale** letto da tutti. Copilot va oltre
e legge anche `.claude/skills/`, `.claude/agents/`, `.claude/rules`, `CLAUDE.md`.

## La scoperta che ci riguarda di piu': la provenienza esiste gia' come standard

`gh skill` (alias `gh skills`, richiede **gh >= 2.90.0**, verificato su 2.97.0)
scrive **la provenienza dentro il frontmatter di SKILL.md**, verbatim:

> *«provenance metadata is written into the skill's `SKILL.md` frontmatter,
> including the source repository, ref, and tree SHA»*

`gh skill update` fa il diff contro quei metadati; `--pin` blocca l'aggiornamento.

**Questo e' esattamente il record di provenienza che TALOS vuole**
([[library-file-provenance-record]]) — e non e' una nostra invenzione, e' uno
standard de facto gia' scritto da altri. Da adottare cosi' com'e'.

## Quanto materiale esiste

| Catalogo | Quantita' | Licenza |
|---|---|---|
| `github/awesome-copilot` | **395 Agent Skills**, 223 agenti, 190 instructions | verificato via trees API + cross-check su llms.txt |
| `github/copilot-plugins` | 19 plugin, 335 star | **MIT** |
| org `gemini-cli-extensions` | **66 repo** | **65 Apache-2.0** + 1 BSD-3 |
| galleria geminicli.com | **1.364 estensioni**, 1.114 owner | licenze delle 1.298 di terzi: **NON confermate** |
| registry MCP ufficiale | **>= 4.000 server** (pavimento verificato, non il totale) | Apache-2.0 |

## Il modello di sicurezza da copiare: Gemini CLI

E' il piu' severo del censimento, tre livelli:
1. `excludeTools` con granularita' per comando: `["run_shell_command(rm -rf)"]`
2. **Sanitizzazione dell'ambiente** — *«Extensions will not inherit the user's
   full shell environment variables»*: solo HOME/PATH/TMPDIR piu' quelle
   dichiarate, e `sensitive:true` va nel portachiavi di sistema
3. **Policy engine**, verbatim: *«Gemini CLI ignores any `allow` decisions or
   `yolo` mode configurations in extension policies… an extension cannot
   automatically approve tool calls or bypass security measures without your
   confirmation»*

**Questo e' il modello giusto per noi**: una skill scaricata **non puo'
auto-approvarsi**. E' la regola «i metadati sono dati, mai istruzioni» applicata
ai permessi.

Da confrontare con Copilot, che invece dichiara: *«Plugin MCP servers are
implicitly trusted when you install the plugin»* — cioe' l'opposto, e da non
imitare.

## Dove NON converge

- **Il packaging**: ogni harness ha il suo `plugin.json`.
- **I file di contesto**: Gemini CLI legge **solo `GEMINI.md`**
  (`DEFAULT_CONTEXT_FILENAME = 'GEMINI.md'` nel sorgente); AGENTS.md va
  configurato a mano. Copilot invece legge AGENTS.md + CLAUDE.md + GEMINI.md.
- **Il versioning della spec non esiste** — colmato fuori standard dalla
  provenienza di `gh skill`.

## Nota storica

Le **chat modes di Copilot sono state rinominate custom agents**: la pagina dei
doc risponde 301 e le istruzioni dicono di rinominare `.chatmode.md` in
`.agent.md`. In awesome-copilot ci sono **zero** `.prompt.md` e **zero**
`.chatmode.md`.
