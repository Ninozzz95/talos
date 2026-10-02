"""Rigenera la patch 0003 (vedi README.md, «Redoing a patch»): va lanciato sul pin CON la 0001 e la 0002 applicate.

Punto 2, passo 2 (01/10/2026): i blocchi di `load_cl_kernels` legati a UN formato di peso (q4_0, q4_1, q5_0, q5_1,
q8_0, q1_0, iq4_nl, mxfp4, q4_K, q5_K, q6_K) si compilano la prima volta che quel formato serve, come MNN
(`submitPrebuild`) e come il Vulkan di llama.cpp. Il formato di un blocco si ricava in due modi: dal nome dei suoi
kernel e dalle funzioni `ggml_cl_mul_mat_<formato>_f32_adreno*` che li usano. Un blocco usato da più di tre formati
(transpose, quant_a_q8_1, …) resta compilato subito, come f16/f32 e cvt.

Ogni ancora deve comparire UNA volta; i fine riga del file (CRLF su Windows) restano.
"""
import os
import re

P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'llama.cpp', 'ggml', 'src', 'ggml-opencl',
                 'ggml-opencl.cpp')
raw = open(P, 'rb').read().decode('utf-8')
NL = '\r\n' if '\r\n' in raw else '\n'
s = raw.replace('\r\n', '\n')

FORMATI = {
    'q4_0': 'GGML_TYPE_Q4_0', 'q4_1': 'GGML_TYPE_Q4_1', 'q5_0': 'GGML_TYPE_Q5_0', 'q5_1': 'GGML_TYPE_Q5_1',
    'q8_0': 'GGML_TYPE_Q8_0', 'q1_0': 'GGML_TYPE_Q1_0', 'iq4_nl': 'GGML_TYPE_IQ4_NL', 'mxfp4': 'GGML_TYPE_MXFP4',
    'q4_k': 'GGML_TYPE_Q4_K', 'q5_k': 'GGML_TYPE_Q5_K', 'q6_k': 'GGML_TYPE_Q6_K',
}
TOKEN = re.compile(r'(?<![a-z0-9])(q4_0|q4_1|q5_0|q5_1|q8_0|q1_0|iq4_nl|mxfp4|q4_k|q5_k|q6_k)(?![a-z0-9])')


def una(testo, ancora):
    n = testo.count(ancora)
    assert n == 1, (n, ancora[:80])
    return testo.index(ancora)


L = s.split('\n')
inizio = next(i for i, l in enumerate(L) if l.startswith('static void load_cl_kernels(ggml_backend_opencl_context'))
fine = next(i for i in range(inizio + 1, len(L)) if L[i] == '}')

# --- i blocchi veri: `    {` ... `    }` al primo livello, con i commenti che li precedono e il contesto #ifdef
blocchi = []
pila = []          # #if aperti al primo livello della funzione (fuori dai blocchi)
i = inizio + 1
while i < fine:
    l = L[i]
    if l.startswith('#if'):
        pila.append(l.strip())
    elif l.startswith('#endif'):
        pila.pop()
    elif l.startswith('#else'):
        pila[-1] = pila[-1] + ' #else'
    if l == '    {':
        a = i
        while a - 1 > inizio and L[a - 1].startswith('    //'):
            a -= 1
        b = i + 1
        while L[b] != '    }':
            b += 1
        blocchi.append({'da': a, 'a': b, 'pila': list(pila), 'testo': '\n'.join(L[a:b + 1])})
        i = b + 1
        continue
    i += 1

# --- kernel creati e funzioni che li usano
funzioni = []
for n, l in enumerate(L):
    if re.match(r'^(static\s+|inline\s+)?[\w:<>\*\s&,]+\b\w+\s*\([^;]*$', l) and not l.startswith((' ', '#', '/')):
        m = re.findall(r'(\w+)\s*\(', l)
        if m:
            funzioni.append((n, m[0]))


def funzione_di(riga):
    nome = '?'
    for n, f in funzioni:
        if n > riga:
            break
        nome = f
    return nome


IGNORA = {'populateProfilingInfo', 'use_q4_0_bin_kernels', 'use_q4_k_bin_kernels', 'use_q5_k_bin_kernels',
          'use_q6_k_bin_kernels'}
fuori = [(n, l) for n, l in enumerate(L) if not (inizio <= n <= fine)]
for blocco in blocchi:
    kernels = set(re.findall(r'backend_ctx->(kernel_\w+)\s*(?:\[[^\]]*\])*\s*=', blocco['testo']))
    formati = set(TOKEN.findall(' '.join(kernels).lower()))
    generici = False
    for k in kernels:
        pat = re.compile(r'\b' + re.escape(k) + r'\b')
        for n, l in fuori:
            if not pat.search(l):
                continue
            f = funzione_di(n)
            if f in IGNORA:
                continue
            m = TOKEN.search(f.lower())
            if m and f.startswith('ggml_cl_mul_mat_'):
                formati.add(m.group(1))
            elif f in ('ggml_cl_mul_mat', 'ggml_backend_opencl_buffer_set_tensor'):
                pass  # il formato lo dice il nome del kernel
            else:
                generici = True
    blocco['kernels'] = kernels
    blocco['formati'] = formati
    pila = [p for p in blocco['pila'] if 'GGML_OPENCL_EMBED_KERNELS' not in p]
    blocco['adreno'] = pila == ['#ifdef GGML_OPENCL_USE_ADRENO_KERNELS']
    blocco['su_richiesta'] = (kernels and formati and len(formati) <= 3 and not generici
                              and (pila == [] or blocco['adreno']))

scelti = [b for b in blocchi if b['su_richiesta']]
print('blocchi:', len(blocchi), 'su richiesta:', len(scelti),
      'programmi spostati:', sum(b['testo'].count('build_program_from_source') for b in scelti))
for b in scelti:
    print('  ', L[b['da']].strip()[:60], sorted(b['formati']), 'adreno' if b['adreno'] else '')

# --- 1) la guardia per blocco nel contesto
a = '    bool kernels_loaded_ssm = false;\n'
i = una(s, a)
s = s[:i + len(a)] + (
    '    // TALOS 0003: one flag per weight-format block of load_cl_kernels,\n'
    f'    // compiled the first time that format is used.\n'
    f'    std::vector<char> talos_format_blocks_loaded = std::vector<char>({len(scelti)}, 0);\n'
) + s[i + len(a):]

# --- 2) togli i blocchi da load_cl_kernels (dal fondo, per non spostare gli indici)
L = s.split('\n')
spost = 3  # le 3 righe aggiunte al contesto, che sta sopra load_cl_kernels
for b in sorted(scelti, key=lambda b: b['da'], reverse=True):
    del L[b['da'] + spost:b['a'] + spost + 1]
s = '\n'.join(L)

# --- 3) le funzioni-blocco e la mappa formato -> blocchi, subito dopo load_cl_kernels
L = s.split('\n')
inizio = next(i for i, l in enumerate(L) if l.startswith('static void load_cl_kernels(ggml_backend_opencl_context'))
fine = next(i for i in range(inizio + 1, len(L)) if L[i] == '}')
PROLOGO = (
    '    cl_int err;\n'
    '    const std::string compile_opts = backend_ctx->kernel_compile_opts;\n'
    '    auto opencl_c_std =\n'
    '        std::string("CL") + std::to_string(backend_ctx->opencl_c_version.major) + "." + std::to_string(backend_ctx->opencl_c_version.minor);\n'
    '    std::string CL_moe_compile_opts = std::string("-cl-std=") + opencl_c_std +\n'
    '            " -cl-mad-enable "\n'
    '            " -cl-fast-relaxed-math";\n'
    '    GGML_UNUSED(err);\n'
    '    GGML_UNUSED(CL_moe_compile_opts);\n'
)
testo = ['', '// TALOS 0003 (01/10/2026): weight-format blocks of load_cl_kernels, compiled the',
         '// first time a tensor of that format is set or multiplied (see talos_load_cl_kernels_for_type).']
for n, b in enumerate(scelti):
    if b['adreno']:
        testo.append('#ifdef GGML_OPENCL_USE_ADRENO_KERNELS')
    testo.append(f'static void talos_format_block_{n}(ggml_backend_opencl_context *backend_ctx) {{')
    testo.append(PROLOGO.rstrip('\n'))
    testo.append(b['testo'])
    testo.append('}')
    if b['adreno']:
        testo.append('#endif // GGML_OPENCL_USE_ADRENO_KERNELS')
testo.append('')
testo.append('static void talos_load_cl_kernels_for_type(ggml_backend_opencl_context *backend_ctx, ggml_type type) {')
testo.append('    switch (type) {')
for token, tipo in FORMATI.items():
    usati = [(n, b) for n, b in enumerate(scelti) if token in b['formati']]
    if not usati:
        continue
    testo.append(f'        case {tipo}:')
    for n, b in usati:
        riga = (f'            if (!backend_ctx->talos_format_blocks_loaded[{n}]) {{ talos_format_block_{n}(backend_ctx); '
                f'backend_ctx->talos_format_blocks_loaded[{n}] = 1; }}')
        if b['adreno']:
            testo += ['#ifdef GGML_OPENCL_USE_ADRENO_KERNELS', riga, '#endif // GGML_OPENCL_USE_ADRENO_KERNELS']
        else:
            testo.append(riga)
    testo.append('            break;')
testo += ['        default:', '            break;', '    }', '}']
L = L[:fine + 1] + testo + L[fine + 1:]
s = '\n'.join(L)

# --- 4) le chiamate: dove un formato si incontra per la prima volta
def dopo_backend_ctx(firma, chiamata):
    global s
    definizioni = []
    for m0 in re.finditer(re.escape(firma), s):
        dopo = s[m0.start():]
        graffa, pv = dopo.find('{'), dopo.find(';')
        if graffa != -1 and (pv == -1 or graffa < pv):
            definizioni.append(m0.start())
    assert len(definizioni) == 1, (len(definizioni), firma)
    i = definizioni[0]
    fine_funzione = s.index('\n}\n', i)
    m = re.compile(r'ggml_backend_opencl_context\s*\*\s*backend_ctx\s*=[^\n]*\n').search(s, i, fine_funzione)
    assert m, firma
    s = s[:m.end()] + chiamata + s[m.end():]


dopo_backend_ctx('static void ggml_cl_mul_mat(ggml_backend_t backend',
                 '    talos_load_cl_kernels_for_type(backend_ctx, src0->type); // TALOS 0003\n')
dopo_backend_ctx('static void ggml_backend_opencl_buffer_set_tensor(',
                 '    talos_load_cl_kernels_for_type(backend_ctx, tensor->type); // TALOS 0003\n')
dopo_backend_ctx('static void ggml_cl_mul_mat_q4_k_glu_fused(',
                 '    talos_load_cl_kernels_for_type(backend_ctx, gate_tensor->src[0]->type); // TALOS 0003\n'
                 '    talos_load_cl_kernels_for_type(backend_ctx, up_tensor->src[0]->type); // TALOS 0003\n')

open(P, 'wb').write(s.replace('\n', NL).encode('utf-8'))
print('fatto, fine riga', repr(NL))
