#!/system/bin/sh
# ⛔ K4-A (ledger `LEDGER-K4-CANCELLO-PROVE-R4-2026-10-17.md`): le prove di r4 col Node dell'APK, come l'app (dominio untrusted_app),
# un file alla volta, 300 s al massimo ciascuno. Ripreso dal lanciatore di K0 (giri 1-4, 14-15/10).
# Uso (dentro `run-as ai.talos.dev`): sh prove-r4-pad.sh <librerie native dell'APK> <cartella di prova> [elenco dei file]
# Esiti in <cartella>/esiti: un TAP per file, `tabella.txt` (file|uscita|pass|fail|saltate|secondi), `avanzamento.txt`.
LIB=$1
P=$2
NODE=$LIB/libtalosnode.so
E=$P/esiti
rm -rf "$E"; mkdir -p "$E" "$P/casa" "$P/tmp"
export TALOS_HARNESS_UI_KEYRING=memoria HOME=$P/casa TMPDIR=$P/tmp
# Come il server r4 dell'app (`TalosR4Avvio.ambiente`): `node` è il collegamento all'eseguibile dell'APK in `codice-r4/bin`, rifatto a
# ogni avvio di r4. ⛔ 17/10: NON `codice/bin` del Codice vecchio, che dopo un aggiornamento dell'app resta a un APK che non c'è più.
export PATH=/data/data/ai.talos.dev/files/codice-r4/bin:$PATH
cd "$P/harness-ui" || exit 2
if [ -n "$3" ]; then cp "$3" "$E/elenco.txt"; else ls tests/*.test.mjs src/kernel/talosHarness.test.mjs > "$E/elenco.txt"; fi
TOT=$(wc -l < "$E/elenco.txt")
N=0
while read -r F; do
    N=$((N + 1))
    NOME=$(echo "$F" | tr '/' '_')
    INIZIO=$(date +%s)
    timeout 300 "$NODE" --test --test-reporter=tap "$F" > "$E/$NOME.tap" 2>&1
    CODICE=$?
    FINE=$(date +%s)
    PS=$(grep -m1 '^# pass ' "$E/$NOME.tap" | cut -d' ' -f3)
    FS=$(grep -m1 '^# fail ' "$E/$NOME.tap" | cut -d' ' -f3)
    SK=$(grep -m1 '^# skipped ' "$E/$NOME.tap" | cut -d' ' -f3)
    echo "$F|$CODICE|${PS:-?}|${FS:-?}|${SK:-?}|$((FINE - INIZIO))" >> "$E/tabella.txt"
    echo "$N/$TOT $F" > "$E/avanzamento.txt"
done < "$E/elenco.txt"
echo FINITO >> "$E/avanzamento.txt"
