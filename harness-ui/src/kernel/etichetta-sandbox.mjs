/*
 * ⛔⛔⛔ L'INTESTAZIONE ONESTA DEL RISULTATO DI UNA SHELL — BLOCCO 6 (B3), 20/09/2026.
 *
 *   Fino a oggi l'unica traccia di DOVE aveva girato un comando era `[sandbox: none]`, e «none»
 *   non dice niente a chi legge: non dice che il comando è partito su cmd.exe **con lo stesso
 *   utente e gli stessi privilegi del processo che ospita TALOS**, cioè senza alcun isolamento.
 *   ⛔ Era nel piano come «il routing non è dichiarato da nessuna parte», ed è un difetto di
 *   ONESTÀ prima che di documentazione: l'esito dichiara un valore, non un fatto.
 *
 * ⭐ LA PRATICA, dalla ricerca del 20/09/2026 — tre fonti che dicono la stessa cosa:
 *   · **`harness_sandbox`** (docs.rs): `Isolation` descrive «what a backend actually enforces — as
 *     distinct from the FsPolicy / NetPolicy it requests. A policy the kernel doesn't enforce is not
 *     isolation, so callers should branch on this, not on the requested policy.» E `NullSandbox` è
 *     documentato come **no isolation**.
 *   · **Godspeed coding agent, PR #209** (set 2026): «Every result carries a one-line honest header
 *     (`sandbox: landlock (fs enforced, network enforced)` etc.)»; su Windows l'enforcement è
 *     «reported honestly as lifetime-only, fs/network NOT enforced, **never claimed as access
 *     enforcement**».
 *   · **DeepSeek Harness, field guide**: «Approval is not sandboxing… A denial is not the same as an
 *     unavailable sandbox, and a permissive prompt is not an isolation boundary.» E dichiara
 *     l'enforcement parziale di Windows invece di tacerlo.
 *   ⛔ E **Hermes non lo fa**: nel suo codice non c'è nessuna dichiarazione dell'ambiente al modello
 *     (cercato il 20/09/2026: i suoi `sandbox` sono iframe e webview). ⇒ Qui andiamo oltre il
 *     concorrente, e la forma è quella della migliore pratica, non inventata.
 *
 * ⛔ LA FORMA, e perché proprio questa:
 *   `exit <codice> [sandbox: <valore> (<che cosa è vero>)]`
 *   · il **valore** resta il primo token, pulito: è un valore di MACCHINA, confrontato altrove
 *     (`enforcement: 'wsl2'` contro `'none'`), e non si tocca;
 *   · la **spiegazione sta DENTRO le parentesi quadre**. È una scelta obbligata, non estetica: chi
 *     legge quella riga la legge con
 *       `/^exit\s+-?\d+\s+\[sandbox:[^\]]+\](?:\r?\n|$)/i`   (adb, `desktop-hotfix.mjs`)
 *       `/^exit (-?\d+)(?: \[sandbox: ([^\]]*)\])?/`         (il registro, `session-registry.mjs`)
 *     e **entrambe si fermano alla quadra**: un testo DOPO la quadra romperebbe la seconda, e
 *     toglierebbe il `sandbox` al registro. Dentro, tutte e due continuano a funzionare.
 *   · e il campo che il registro ne ricava (`sandbox`) **non è mostrato da nessuna parte** in
 *     interfaccia (verificato il 20/09/2026): allungarlo non porta gergo a schermo.
 *
 * ⛔ UN VALORE CHE NON CONOSCO NON SI DECORA: si restituisce com'è. Inventare una spiegazione per un
 *   `enforcement` che non ho mai visto sarebbe la stessa bugia, al contrario.
 *
 * ⛔⛔ F009, 01/10/2026 — «NAMESPACE LINUX: FILESYSTEM E PROCESSI SEPARATI» ERA FALSO, e prometteva un isolamento
 *   che non c'è. Misurato quel giorno sulla macchina dell'owner (Ubuntu, WSL 2.7): i comandi girano come root (uid 0);
 *   `C:` è montato in `/mnt/c` come drvfs SENZA `metadata`, `uid=0;gid=0`, e `/mnt/c/Users/<utente>` risulta `777
 *   root:root` ⇒ i permessi Linux lì non valgono, e conta solo ciò che il Windows dell'utente di TALOS consente; e
 *   l'interop è accesa (`cmd.exe /c ver` risponde da dentro WSL). Microsoft: «metadata… disabled by default»
 *   (https://learn.microsoft.com/en-us/windows/wsl/file-permissions). ⇒ L'etichetta dice con che UTENTE ha girato e
 *   che cosa è vero del DISCO della cartella (`dettagli` dal kernel, `utente-wsl.mjs`); senza dettagli dice il solo
 *   fatto generale. Decisioni owner 01/10/2026: «come gli altri, insieme», dichiarato «nell'esito e nel foglio della
 *   shell».
 * ⛔ Mai una `]` dentro: i due lettori si fermano alla quadra (vedi sopra). Un nome utente Linux non può contenerla
 *   (`utente-wsl.mjs`, `NOME_UTENTE`).
 */

/** Le spiegazioni, una per ogni livello che il kernel sa dichiarare. */
const SPIEGAZIONI = Object.freeze({
    none: 'cmd.exe nativo: stesso utente e stessi privilegi del processo, nessun isolamento',
    wsl2: 'Linux in WSL; nessun isolamento: i dischi di Windows sono in /mnt con i diritti dell\'utente Windows di TALOS',
    'adb-shell-on-device': 'shell sul dispositivo collegato, fuori da questa macchina',
});

/**
 * L'etichetta onesta per un livello di `enforcement`.
 * @param {string} enforcement il valore di macchina (`none`, `wsl2`, `adb-shell-on-device`)
 * @param {{utente?: string|null, disco?: {montaggio: string, metadata: boolean|null}|null}|null} [dettagli] solo per
 *   `wsl2`: il campo `wsl` dell'esito di `eseguiComandoSandboxato` (F009). Assente = il fatto generale.
 * @returns {string} il valore, con la spiegazione fra parentesi quando la conosco
 */
export function etichettaSandbox(enforcement, dettagli = null) {
    const valore = String(enforcement ?? '').trim();
    if (!valore) return 'non dichiarato';
    if (valore === 'wsl2' && dettagli && typeof dettagli === 'object') return `wsl2 (${spiegazioneWsl(dettagli)})`;
    const spiegazione = SPIEGAZIONI[valore];
    return spiegazione ? `${valore} (${spiegazione})` : valore;
}

/* F009 — la spiegazione di `wsl2` coi fatti di QUESTO comando: chi ha eseguito, e il disco della cartella. */
function spiegazioneWsl({ utente = null, disco = null }) {
    const chi = typeof utente === 'string' && /^[a-z_][a-z0-9_-]{0,31}\$?$/iu.test(utente) ? `come ${utente}` : 'con un utente non verificato';
    const dove = disco && typeof disco.montaggio === 'string' && /^\/mnt\/[a-z]$/u.test(disco.montaggio)
        ? `${disco.montaggio} è il disco di Windows con i diritti dell'utente Windows di TALOS${disco.metadata === false ? ', e lì i permessi Linux non valgono' : ''}`
        : "i dischi di Windows sono in /mnt con i diritti dell'utente Windows di TALOS";
    return `Linux in WSL ${chi}; nessun isolamento: ${dove}`;
}
