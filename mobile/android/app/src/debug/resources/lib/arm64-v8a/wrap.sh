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

# ⛔⛔ SONDA TEMPORANEA — il filtro delle operazioni di ggml-opencl.
#
# `GGML_OPENCL_OPFILTER` e' una regex delle operazioni che OpenCL NON deve
# reclamare: quelle che combaciano finiscono sulla CPU, e il grafo si spezza.
# Serve a provare UNA cosa sola: se lo Stop su GPU morda soltanto dove esiste
# uno spezzone CPU in cui la callback di abort viene consultata.
#
# ⛔ Sta qui perche' un'app Android non legge variabili d'ambiente da nessun
# altro posto, e `wrap.sh` e' solo-debug. ⛔ VA TOLTO appena la misura e' presa:
# manda un'operazione sulla CPU e quindi FALSA tutte le altre misure.
# `RMS_NORM` compare due volte per strato, e' economica, e la sua uscita e'
# piccola: se il meccanismo e' quello, bastera' lei a creare i confini in cui
# l'abort viene consultato. Il confronto e' contro la stessa corsa senza filtro.
GGML_OPENCL_OPFILTER=RMS_NORM
export GGML_OPENCL_OPFILTER

exec "$@"
