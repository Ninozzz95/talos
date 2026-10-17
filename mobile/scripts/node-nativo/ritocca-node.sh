#!/bin/sh
# ⛔ K2-A (ledger LEDGER-K2A-NODE-AUTOSUFFICIENTE-2026-10-14.md): Node e le sue 9 librerie (build di Termux) diventano
# autosufficienti fra le librerie native dell'APK. A ognuno: DT_RUNPATH=$ORIGIN (il linker di Android lo segue dall'API 24;
# DT_RPATH no), le dipendenze rinominate nei nomi lib*.so del manifesto, il SONAME nuovo. Si lancia in Linux/WSL:
#
#   sh ritocca-node.sh <patchelf 0.18.0> <cartella con gli originali> <cartella d'uscita>
#
# Gli originali e il risultato si controllano contro gli sha256 di node-nativo.json: un byte diverso ferma tutto.
set -eu
PE=$1
DA=$2
A=$3
MANIFESTO="$(dirname "$0")/node-nativo.json"

test "$("$PE" --version)" = "patchelf 0.18.0" || { echo "serve patchelf 0.18.0" >&2; exit 1; }

# Una riga per file: vecchio nuovo sha256Prima sha256Dopo
VOCI=$(python3 -c 'import json,sys; [print(f["vecchio"], f["nuovo"], f["sha256Prima"], f["sha256Dopo"]) for f in json.load(open(sys.argv[1]))["file"]]' "$MANIFESTO")
RUNPATH=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["runpath"])' "$MANIFESTO")

mkdir -p "$A"
echo "$VOCI" | while read -r VECCHIO NUOVO PRIMA DOPO; do
    test "$(sha256sum "$DA/$VECCHIO" | cut -c1-64)" = "$PRIMA" || { echo "originale diverso: $VECCHIO" >&2; exit 1; }
    cp "$DA/$VECCHIO" "$A/$NUOVO"
done

echo "$VOCI" | while read -r VECCHIO NUOVO PRIMA DOPO; do
    F="$A/$NUOVO"
    echo "$VOCI" | while read -r V2 N2 P2 D2; do
        if "$PE" --print-needed "$F" | grep -qx "$V2"; then "$PE" --replace-needed "$V2" "$N2" "$F"; fi
    done
    if [ "$NUOVO" != libtalosnode.so ]; then "$PE" --set-soname "$NUOVO" "$F"; fi
    "$PE" --set-rpath "$RUNPATH" "$F"
done

echo "$VOCI" | while read -r VECCHIO NUOVO PRIMA DOPO; do
    test "$(sha256sum "$A/$NUOVO" | cut -c1-64)" = "$DOPO" || { echo "risultato diverso dal manifesto: $NUOVO" >&2; exit 1; }
    echo "ok $NUOVO"
done
