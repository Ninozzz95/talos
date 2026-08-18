#!/system/bin/sh
# ⛔⛔⛔ IL PONTE PER HWASAN SU UN TELEFONO NORMALE.
#
# HWAddress Sanitizer trova gli use-after-free nel codice nativo: e lo strumento
# corrente su ARM64, ed e abbastanza leggero da girare su un dispositivo vero.
#
# Un telefono con Android «HWASan» ce l'ha gia dentro. Un telefono normale no —
# e il Pad e un telefono normale. Da Android 14 pero basta questo file: dice al
# caricatore di preparare il runtime di HWASan prima di avviare l'app.
#
# ⛔ Sta in `src/debug/`, non in `src/main/`: cosi nella release NON C'E. Un
# ponte per gli strumenti di diagnosi che finisce in mano alle persone e un
# pezzo di superficie in piu che nessuno ha chiesto.
#
# ⛔ E vale SOLO con la variante compilata col sanitizer (`-PtalosHwasan`).
# Senza, questo file c'e e non fa danno: LD_HWASAN su un binario non
# strumentato viene semplicemente ignorato.
LD_HWASAN=1
export LD_HWASAN
exec "$@"
