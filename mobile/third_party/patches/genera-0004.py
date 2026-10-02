"""Rigenera la patch 0004 (vedi README.md, «Redoing a patch»): va lanciato sul pin CON la 0001, la 0002 e la 0003
applicate.

Punto 2, passo 2 (01/10/2026, owner: «Patch 0004 + riscaldo»): le compilazioni pigre della flash attention
(prepass, varianti per (dk, dv), MQ_GQA=8, c8 NSG2, split) passano da `build_program_from_source_ex`, che la cache su
disco (`cl-program-cache.cpp`) non la consulta e non la salva: solo `build_program_from_source` lo fa. Letto sul pin
`0c1e57098` (12 chiamate pigre) e sull'upstream di oggi `e358d5917` (01/10/2026, 11): nessuna usa la cache. Sul Pad sono 6-8 s
a OGNI avvio dell'app (build di sviluppo), non una volta per aggiornamento.

La cura: le chiamate pigre con `backend_ctx->context, backend_ctx->device` diventano
`talos_build_program_from_source_ex_cached(backend_ctx, …)`, che prova la cache, compila con la stessa
`build_program_from_source_ex` (stessi tentativi, stesso `fatal`, stesso log) e salva il binario riuscito. La chiave
della cache contiene già sorgente, opzioni, dispositivo, driver e piattaforma: un binario sbagliato non si legge mai.

Ogni ancora deve comparire UNA volta; i fine riga del file (CRLF su Windows) restano.
"""
import os
import re

P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'llama.cpp', 'ggml', 'src', 'ggml-opencl',
                 'ggml-opencl.cpp')
raw = open(P, 'rb').read().decode('utf-8')
NL = '\r\n' if '\r\n' in raw else '\n'
s = raw.replace('\r\n', '\n')


def una(testo, ancora):
    n = testo.count(ancora)
    assert n == 1, (n, ancora[:80])
    return testo.index(ancora)


# --- 1) le chiamate pigre (PRIMA dell'involucro, che contiene la stessa forma): `build_program_from_source_ex(<a capo + rientro>backend_ctx->context, backend_ctx->device,`
CHIAMATA = re.compile(r'build_program_from_source_ex\((\s*)backend_ctx->context, backend_ctx->device,')
s, n = CHIAMATA.subn(r'talos_build_program_from_source_ex_cached(\1backend_ctx,', s)
assert n == 12, n
# nessuna chiamata pigra deve restare fuori: restano la definizione e `build_program_from_source`
assert len(re.findall(r'build_program_from_source_ex\(', s)) == 2

# --- 2) l'involucro, subito dopo `build_program_from_source` (che usa già la cache allo stesso modo)
ANCORA = 'static cl_program build_program_from_binary(cl_context ctx, cl_device_id dev'
INVOLUCRO = '''// TALOS 0004: le compilazioni pigre (flash attention) passano dalla cache su disco come quelle di
// load_cl_kernels. Su una mancata si compila con build_program_from_source_ex, invariata (tentativi, fatal, log).
static cl_program talos_build_program_from_source_ex_cached(ggml_backend_opencl_context * backend_ctx,
        const char * program_buffer, const std::string & compile_opts, bool fatal,
        const char * tag = nullptr, cl_command_queue retry_queue = nullptr) {
    cl_program p_cached = cl_program_cache_try_load(
        backend_ctx->program_cache, backend_ctx->context, backend_ctx->device, program_buffer, compile_opts);
    if (p_cached != nullptr) {
        return p_cached;
    }
    cl_program p = build_program_from_source_ex(backend_ctx->context, backend_ctx->device, program_buffer,
        compile_opts, fatal, tag, retry_queue);
    if (p != nullptr) {
        cl_program_cache_try_save(backend_ctx->program_cache, p, backend_ctx->device, program_buffer, compile_opts);
    }
    return p;
}

'''
i = una(s, ANCORA)
s = s[:i] + INVOLUCRO + s[i:]

open(P, 'wb').write(s.replace('\n', NL).encode('utf-8'))
print('fatto, chiamate', n, 'fine riga', repr(NL))
