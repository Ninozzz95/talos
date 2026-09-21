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
 */

/** Le spiegazioni, una per ogni livello che il kernel sa dichiarare. */
const SPIEGAZIONI = Object.freeze({
    none: 'cmd.exe nativo: stesso utente e stessi privilegi del processo, nessun isolamento',
    wsl2: 'namespace Linux: filesystem e processi separati',
    'adb-shell-on-device': 'shell sul dispositivo collegato, fuori da questa macchina',
});

/**
 * L'etichetta onesta per un livello di `enforcement`.
 * @param {string} enforcement il valore di macchina (`none`, `wsl2`, `adb-shell-on-device`)
 * @returns {string} il valore, con la spiegazione fra parentesi quando la conosco
 */
export function etichettaSandbox(enforcement) {
    const valore = String(enforcement ?? '').trim();
    if (!valore) return 'non dichiarato';
    const spiegazione = SPIEGAZIONI[valore];
    return spiegazione ? `${valore} (${spiegazione})` : valore;
}
