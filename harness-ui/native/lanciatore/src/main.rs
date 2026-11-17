//! talos-lanciatore — il lanciatore nativo dei comandi di TALOS su Windows.
//!
//! Decisione 374 (R1 dei nipoti staccati), owner 12/11/2026 (decisione 1037, nostro exe in Rust); forma VERDE del giudice v1629.
//! Node mette ogni figlio in un Job con SILENT_BREAKAWAY_OK (libuv v1.52.1 `src/win/process.c:77-96`): un programma che un comando
//! lascia acceso (`start "" /b`, `detached: true`) non è più di nessuno. Qui la shell parte SOSPESA, entra in un Job SENZA breakaway
//! (né BREAKAWAY_OK né SILENT_BREAKAWAY_OK, come hermes `hermes_cli/local_runtime/processes.py:67`) con KILL_ON_JOB_CLOSE finché la
//! shell gira (strada Codex, owner 13/11/2026: `codex-rs/utils/pty/src/win/job.rs:240-257`; si toglie all'uscita della shell o alla
//! riga `sfondo`, vedi `sgancia`, così il sottofondo sopravvive), poi riparte. L'uscita
//! dell'ultimo processo arriva avvisata dalla porta di completamento (JOB_OBJECT_MSG_ACTIVE_PROCESS_ZERO), niente controlli a giro.
//!
//! Un modo solo: `"<exe>" "<shell>" <riga della shell>`. La riga arriva alla shell byte per byte com'è.
//! ⛔ Giro g4 (13/11/2026, giudice v1738): il Job è ANONIMO, come Codex (`codex-rs/utils/pty/src/win/job.rs:73`, CreateJobObjectW con
//! null, null) e Hermes (`hermes_cli/local_runtime/processes.py:61-62`): «If lpName is NULL, the job is created without a name»
//! (documentazione di CreateJobObjectW, letta il 13/11/2026). La sola maniglia è di questo processo: nessuno lo apre per nome, e
//! nessun nome si può prendere prima di noi. «Ferma» arriva dal nucleo sulla maniglia 4 (riga `ferma`, vedi `ascolta_ferma`).
//! Il canale verso il nucleo è la maniglia 3 che Node passa nel blocco del runtime C (`lpReserved2`, il formato di libuv): righe JSON
//! `{"avvio":pid,"nipoti":bool}` (con `"appoggio":false` se Windows ha rifiutato l'appoggio del Job), `{"sgancio":false}` se dopo
//! la ripartenza Windows non l'ha tolto (giro 3), `{"uscita":codice}` (con `"albero":"vuoto"` se l'albero è già vuoto), poi `{"albero":"vuoto"}`.
//! ⛔ Giudice §10.1: la shell eredita SOLO stdin, stdout e stderr (PROC_THREAD_ATTRIBUTE_HANDLE_LIST, e il canale reso non
//! ereditabile): un comando non può scrivere righe finte al nucleo. Il nucleo scrive al lanciatore solo sulla maniglia 4 (misurato il
//! 13/11/2026: il figlio la legge; anche lei non ereditabile, un comando non può chiudere il proprio gruppo per finta), e il lanciatore
//! risponde `{"ferma":true|false}` sul canale.
//! Se il Job non si crea, la shell parte lo stesso e la prima riga dice `"nipoti":false` col motivo (ripiego detto). Se il Job
//! c'è e Windows non crea la shell DENTRO di lui, si risponde `{"errore":"avvio"}` e il nucleo fa partire il comando come prima.
//! ⛔ La riga `avvio` si scrive PRIMA di far ripartire la shell, e se non si riesce a scriverla la shell non riparte (giro di cura del
//! 12/11/2026): il nucleo, che non la vede arrivare, rilancia il comando come prima sapendo che qui non è mai girato.

#![cfg_attr(not(windows), allow(dead_code))]

#[cfg(windows)]
mod win {
    use core::ffi::c_void;
    use core::ptr::{null, null_mut};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, SetHandleInformation, FILETIME, HANDLE, HANDLE_FLAG_INHERIT, INVALID_HANDLE_VALUE, WAIT_OBJECT_0,
    };
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
    use windows_sys::Win32::Storage::FileSystem::{ReadFile, WriteFile};
    use windows_sys::Win32::System::Console::{GetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE};
    use windows_sys::Win32::System::Environment::GetCommandLineW;
    use windows_sys::Win32::System::IO::{CreateIoCompletionPort, GetQueuedCompletionStatus, OVERLAPPED};
    use windows_sys::Win32::System::JobObjects::{
        CreateJobObjectW, IsProcessInJob, JobObjectAssociateCompletionPortInformation, JobObjectBasicProcessIdList,
        JobObjectExtendedLimitInformation, QueryInformationJobObject, SetInformationJobObject, TerminateJobObject,
        JOBOBJECT_ASSOCIATE_COMPLETION_PORT, JOBOBJECT_BASIC_PROCESS_ID_LIST, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{
        CreateProcessW, DeleteProcThreadAttributeList, ExitProcess, GetExitCodeProcess, GetProcessId, GetProcessTimes, GetStartupInfoW,
        InitializeProcThreadAttributeList, OpenProcess, ResumeThread, TerminateProcess, UpdateProcThreadAttribute, WaitForSingleObject,
        CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT, EXTENDED_STARTUPINFO_PRESENT, INFINITE, PROCESS_INFORMATION,
        PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE, PROCESS_TERMINATE, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
        PROC_THREAD_ATTRIBUTE_JOB_LIST, STARTF_USESHOWWINDOW, STARTF_USESTDHANDLES, STARTUPINFOEXW, STARTUPINFOW,
    };

    /// ⛔ Guasti forzati SOLO nelle prove (cura unica dei gialli, 13/11/2026, revisori A e C): compilati solo con
    /// `--features guasti-di-prova`, letti da `TALOS_LANCIATORE_GUASTI` (pezzi separati da virgole): `job` (Windows rifiuta il Job),
    /// `appoggio` (rifiuta «muore con me» alla partenza), `termina` (TerminateJobObject fallisce), `riaggancia` (rifiuta di rilegare il
    /// gruppo nel ripiego di «ferma»), `padre=<pid>` (senza Job: quel processo compare nella fotografia come figlio della shell, come un
    /// numero ridato), `membro=<pid>` (quel numero compare nell'elenco del Job del terzo ripiego, come un numero ridato a un estraneo),
    /// `tarda=<ms>` (quinto giro, 13/11/2026: «ferma» ha chiuso e aspetta prima di rispondere, il momento della gara col filo principale
    /// forzato invece di cercato con più giri). Nella build di rilascio (`lanciatore.yml`, senza `--features`) `attivo` è sempre falso e la variabile non c'è nel file.
    #[cfg(feature = "guasti-di-prova")]
    mod guasti {
        fn pezzi() -> Vec<String> {
            std::env::var("TALOS_LANCIATORE_GUASTI").map(|v| v.split(',').map(|g| g.trim().to_string()).collect()).unwrap_or_default()
        }
        pub fn attivo(nome: &str) -> bool {
            pezzi().iter().any(|g| g == nome)
        }
        pub fn falso_padre() -> Option<u32> {
            pezzi().iter().find_map(|g| g.strip_prefix("padre=")?.parse().ok())
        }
        pub fn falso_membro() -> Option<u32> {
            pezzi().iter().find_map(|g| g.strip_prefix("membro=")?.parse().ok())
        }
        pub fn tarda() -> Option<u64> {
            pezzi().iter().find_map(|g| g.strip_prefix("tarda=")?.parse().ok())
        }
    }
    #[cfg(not(feature = "guasti-di-prova"))]
    mod guasti {
        #[inline(always)]
        pub fn attivo(_: &str) -> bool {
            false
        }
        #[inline(always)]
        pub fn falso_padre() -> Option<u32> {
            None
        }
        #[inline(always)]
        pub fn falso_membro() -> Option<u32> {
            None
        }
        #[inline(always)]
        pub fn tarda() -> Option<u64> {
            None
        }
    }

    /// `JOB_OBJECT_MSG_ACTIVE_PROCESS_ZERO` (winnt.h): l'ultimo processo del Job è uscito.
    const MSG_ALBERO_VUOTO: u32 = 4;
    /// Quanto aspettare, uscita la shell, che il Job si svuoti prima di dire l'uscita da sola: un comando senza nipoti dice tutto in
    /// una riga (lo sgancio arriva subito, come prima); uno con un nipote vivo lo dice dopo.
    const ATTESA_ALBERO_MS: u64 = 50;
    /// Codici d'uscita del lanciatore quando la shell non parte (il nucleo li riconosce dalla riga `errore`, non dal codice).
    const USCITA_RIGA_ROTTA: u32 = 0xC0DE_0001;
    const USCITA_SHELL_NON_PARTITA: u32 = 0xC0DE_0002;
    /// La riga «avvio» non è arrivata al nucleo (canale assente o rotto): la shell NON riparte, e il lanciatore esce con questo codice.
    const USCITA_AVVIO_NON_DETTO: u32 = 0xC0DE_0003;
    /// Giro 3: Windows non ha tolto l'appoggio dopo la ripartenza della shell (i programmi lasciati accesi si chiudono col lanciatore).
    pub(crate) const RIGA_SGANCIO_RIFIUTATO: &str = "{\"sgancio\":false}";
    const VIRGOLETTE: u16 = b'"' as u16;
    const SPAZIO: u16 = b' ' as u16;
    const TAB: u16 = b'\t' as u16;

    fn valida(h: HANDLE) -> bool {
        !h.is_null() && h != INVALID_HANDLE_VALUE
    }

    fn salta_spazi(riga: &[u16], mut i: usize) -> usize {
        while i < riga.len() && (riga[i] == SPAZIO || riga[i] == TAB) {
            i += 1;
        }
        i
    }

    /// Un pezzo fra virgolette che comincia in `i` (non vuoto, senza virgolette dentro): `(pezzo, indice dopo la virgoletta finale)`.
    fn fra_virgolette(riga: &[u16], i: usize) -> Option<(Vec<u16>, usize)> {
        if riga.get(i) != Some(&VIRGOLETTE) {
            return None;
        }
        let inizio = i + 1;
        let fine = inizio + riga.get(inizio..)?.iter().position(|&c| c == VIRGOLETTE)?;
        if fine == inizio {
            return None;
        }
        Some((riga[inizio..fine].to_vec(), fine + 1))
    }

    /// Dopo il nome di questo exe (fra virgolette, o fino al primo spazio).
    fn dopo_il_nome(riga: &[u16]) -> Option<usize> {
        let i = if riga.first() == Some(&VIRGOLETTE) {
            1 + riga.get(1..)?.iter().position(|&c| c == VIRGOLETTE)? + 1
        } else {
            riga.iter().position(|&c| c == SPAZIO || c == TAB).unwrap_or(riga.len())
        };
        Some(salta_spazi(riga, i))
    }

    /// La riga di comando di questo processo, letta senza toccarla: `(shell, riga della shell)`.
    pub(crate) fn leggi_riga(riga: &[u16]) -> Option<(Vec<u16>, Vec<u16>)> {
        let (shell, k) = fra_virgolette(riga, dopo_il_nome(riga)?)?;
        // UNO spazio, poi la riga della shell così com'è (anche spazi in testa o in coda)
        let k = if riga.get(k) == Some(&SPAZIO) { k + 1 } else { k };
        let resto = riga[k..].to_vec();
        if resto.is_empty() {
            return None;
        }
        Some((shell, resto))
    }

    /// La maniglia del descrittore `fd` che il genitore ha passato nel blocco del runtime C (`lpReserved2`, il formato che libuv
    /// scrive: `int n; unsigned char flag[n]; HANDLE maniglia[n]`). `None` se il descrittore non c'è.
    pub(crate) unsafe fn maniglia_del_runtime_c(blocco: *const u8, dimensione: usize, fd: usize) -> Option<HANDLE> {
        if blocco.is_null() || dimensione < 4 {
            return None;
        }
        let n = (blocco as *const i32).read_unaligned();
        if n <= 0 {
            return None;
        }
        let n = n as usize;
        if fd >= n || dimensione < 4 + n + n * core::mem::size_of::<usize>() {
            return None;
        }
        if *blocco.add(4 + fd) & 0x01 == 0 {
            return None; // FOPEN
        }
        let h = (blocco.add(4 + n) as *const usize).add(fd).read_unaligned() as HANDLE;
        if valida(h) { Some(h) } else { None }
    }

    struct Canale(Option<HANDLE>);
    /// Due fili scrivono sul canale (il principale e `ascolta_ferma`): una riga alla volta, mai due mescolate.
    static UNA_RIGA: std::sync::Mutex<()> = std::sync::Mutex::new(());
    impl Canale {
        /// Vero se la riga è stata scritta tutta. Conta solo per «avvio» (vedi sotto): per le altre righe una scrittura fallita non
        /// ferma niente.
        fn scrivi(&self, testo: &str) -> bool {
            let Some(h) = self.0 else { return false };
            let riga = format!("{testo}\n");
            let _una = UNA_RIGA.lock();
            let mut dati = riga.as_bytes();
            while !dati.is_empty() {
                let mut scritti = 0u32;
                // il nucleo può essere già andato (riavvio di TALOS): una scrittura che fallisce non ferma niente
                let ok = unsafe { WriteFile(h, dati.as_ptr(), dati.len() as u32, &mut scritti, null_mut()) };
                if ok == 0 || scritti == 0 {
                    return false;
                }
                dati = &dati[scritti as usize..];
            }
            true
        }
    }

    fn con_zero(mut v: Vec<u16>) -> Vec<u16> {
        v.push(0);
        v
    }

    /// ⛔ Il Job fa da APPOGGIO alla shell finché è sospesa (cure dopo il ripasso, revisore B, 12/11/2026). Misurato: un lanciatore
    /// ucciso fra la creazione della shell sospesa e la sua ripartenza la lasciava sospesa PER SEMPRE (15 volte su 160 uccidendolo
    /// fra 16 e 20 ms dal lancio), coi tubi del comando in mano. Con `KILL_ON_JOB_CLOSE` acceso («Causes all processes associated with
    /// the job to terminate when the last handle to the job is closed», documentazione di JOBOBJECT_BASIC_LIMIT_INFORMATION letta il
    /// 12/11/2026) la sola maniglia del Job è di questo processo: se muore, Windows la chiude e la shell sospesa muore con lui.
    /// `acceso: false` lo toglie: da lì un lanciatore ucciso non ferma più nessuno (il sottofondo deve sopravvivere).
    /// Hermes lo tiene acceso per tutta la vita del Job (`hermes_cli/local_runtime/processes.py:68`); Codex finché la radice non esce
    /// (`codex-rs/utils/pty/src/win/job.rs:240-257`), e noi come Codex, più la riga `sfondo` (vedi `sgancia`).
    unsafe fn muore_con_me(job: HANDLE, acceso: bool) -> bool {
        let mut limiti = core::mem::zeroed::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>();
        limiti.BasicLimitInformation.LimitFlags = if acceso { JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE } else { 0 };
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &limiti as *const _ as *const c_void,
            core::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) != 0
    }

    /// La riga «avvio» (giro piccolo dopo il controllore, 12/11/2026). Col Job e senza l'appoggio (`muore_con_me(j, true)` rifiutato da
    /// Windows) porta `"appoggio":false`: un lanciatore ucciso prima della ripartenza lascerebbe la shell sospesa, e non si fa finta del
    /// contrario (il nucleo lo dice nel log e nella diagnostica). Codex non ignora lo stesso ritorno (`codex-rs/utils/pty/src/win/job.rs:136`).
    /// Senza Job (`motivo`) l'appoggio non c'è comunque, e la riga dice già «nipoti: false».
    pub(crate) fn riga_avvio(pid: u32, motivo: Option<&str>, appoggio: bool) -> String {
        match motivo {
            None if appoggio => format!("{{\"avvio\":{pid},\"nipoti\":true}}"),
            None => format!("{{\"avvio\":{pid},\"nipoti\":true,\"appoggio\":false}}"),
            Some(m) => format!("{{\"avvio\":{pid},\"nipoti\":false,\"motivo\":\"{m}\"}}"),
        }
    }

    /// Crea la shell SOSPESA: eredita solo `ereditate` (elenco esplicito); con `nel_job` nasce GIÀ dentro quel Job
    /// (`PROC_THREAD_ATTRIBUTE_JOB_LIST`: «a list of job handles to be assigned to the child process», Windows 10 e dopo, letta il
    /// 12/11/2026), così non c'è un istante in cui esiste fuori dal Job d'appoggio. `Err` col codice di Windows se non parte
    /// (anche quando è il Job a non poterla prendere: non nasce fuori).
    unsafe fn crea_shell_sospesa(
        shell: &[u16],
        riga: &mut [u16],
        mio: &STARTUPINFOW,
        std: &[HANDLE; 3],
        ereditate: &[HANDLE],
        nel_job: Option<HANDLE>,
        pi: &mut PROCESS_INFORMATION,
    ) -> Result<(), u32> {
        let quanti = 1 + u32::from(nel_job.is_some());
        let mut dimensione = 0usize;
        InitializeProcThreadAttributeList(null_mut(), quanti, 0, &mut dimensione);
        let mut memoria = vec![0u8; dimensione.max(64)];
        let lista = memoria.as_mut_ptr() as *mut c_void;
        let pronta = InitializeProcThreadAttributeList(lista, quanti, 0, &mut dimensione) != 0;
        let mut con_maniglie = false;
        let mut con_job = false;
        if pronta && !ereditate.is_empty() {
            con_maniglie = UpdateProcThreadAttribute(
                lista,
                0,
                PROC_THREAD_ATTRIBUTE_HANDLE_LIST as usize,
                ereditate.as_ptr() as *const c_void,
                ereditate.len() * core::mem::size_of::<HANDLE>(),
                null_mut(),
                null(),
            ) != 0;
        }
        if let (true, Some(j)) = (pronta, nel_job.as_ref()) {
            con_job = UpdateProcThreadAttribute(
                lista,
                0,
                PROC_THREAD_ATTRIBUTE_JOB_LIST as usize,
                j as *const HANDLE as *const c_void,
                core::mem::size_of::<HANDLE>(),
                null_mut(),
                null(),
            ) != 0;
        }
        // chiesta dentro il Job e l'elenco non lo porta: non la si crea fuori di nascosto (direbbe «seguiti» di un comando che non lo è)
        let mut esito = Err(GetLastError());
        if nel_job.is_none() || con_job {
            let mut si = core::mem::zeroed::<STARTUPINFOEXW>();
            si.StartupInfo.cb = core::mem::size_of::<STARTUPINFOEXW>() as u32;
            si.StartupInfo.dwFlags = STARTF_USESTDHANDLES | (mio.dwFlags & STARTF_USESHOWWINDOW);
            si.StartupInfo.wShowWindow = mio.wShowWindow;
            si.StartupInfo.hStdInput = std[0];
            si.StartupInfo.hStdOutput = std[1];
            si.StartupInfo.hStdError = std[2];
            si.lpAttributeList = if con_maniglie || con_job { lista } else { null_mut() };
            // senza l'elenco delle maniglie nessuna si eredita: meglio una shell senza tubi che una che vede il canale
            let partita = CreateProcessW(
                shell.as_ptr(),
                riga.as_mut_ptr(),
                null(),
                null(),
                if con_maniglie { 1 } else { 0 },
                CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT,
                null(),
                null(),
                &si.StartupInfo,
                pi,
            );
            esito = if partita != 0 { Ok(()) } else { Err(GetLastError()) };
        }
        if pronta {
            DeleteProcThreadAttributeList(lista);
        }
        esito
    }

    /// ⛔ «Ferma» (giro g4): il nucleo scrive `ferma` sulla maniglia 4, e qui si chiude il gruppo dalla PROPRIA maniglia del Job
    /// (`TerminateJobObject`: «Terminates all processes currently associated with the job», documentazione letta il 13/11/2026), mai
    /// un PID e mai un nome. Senza Job (Windows l'ha rifiutato) si chiude l'albero della shell dalla fotografia, per maniglia: un figlio
    /// il cui padre è già uscito non si trova (il nucleo lo dice). Risposta sul canale: `{"ferma":true}` o `{"ferma":false}`.
    /// Il nucleo andato (TALOS chiuso o aggiornato: la lettura fallisce) non ferma niente da qui: il sottofondo deve sopravvivere (§4).
    /// La riga `sfondo` toglie «muore con me» (strada Codex, vedi `sgancia`). Senza Job si chiude l'albero della shell per maniglia
    /// (`chiudi_albero_senza_job`); se `TerminateJobObject` fallisce si riaccende «muore con me» e si esce: Windows chiude il gruppo; se
    /// anche quello è rifiutato, i membri confermati del Job uno per uno (`chiudi_membri_del_job`).
    /// ⛔ Limite scritto (revisori A e C, 13/11/2026, non provocato): il ripiego «muore con me» e lo sgancio all'uscita della shell
    /// (`sgancia`, dal filo principale) non hanno un lucchetto comune; uno sgancio fra i due passi lascerebbe il gruppo acceso con la
    /// risposta `true`. Codex li mette in fila col lucchetto dello stato (`codex-rs/utils/pty/src/win/job.rs:242-245`).
    /// Gira in un filo suo, partito DOPO la ripartenza della shell: un «ferma» scritto prima resta nel tubo e si legge allora.
    unsafe fn ascolta_ferma(entrata: HANDLE, job: Option<HANDLE>, appoggio: bool, shell: HANDLE, canale: &Canale) {
        let (mut pezzo, mut riga) = ([0u8; 64], Vec::new());
        loop {
            let mut letti = 0u32;
            if ReadFile(entrata, pezzo.as_mut_ptr(), pezzo.len() as u32, &mut letti, null_mut()) == 0 || letti == 0 {
                return;
            }
            for &b in &pezzo[..letti as usize] {
                if b != b'\n' {
                    riga.push(b);
                    continue;
                }
                if riga == b"ferma" {
                    FERMA_IN_CORSO.store(true, Ordering::SeqCst);
                    let chiuso = match job {
                        Some(j) if !guasti::attivo("termina") && TerminateJobObject(j, 1) != 0 => true,
                        // ⛔ ripiego (cura dei gialli, 13/11/2026): il gruppo che non si chiude da qui si chiude con l'ultima maniglia,
                        // cioè con questo processo, se «muore con me» si riaccende (KILL_ON_JOB_CLOSE, vedi `muore_con_me`)
                        Some(j) if !guasti::attivo("riaggancia") && muore_con_me(j, true) => {
                            canale.scrivi("{\"ferma\":true}");
                            ExitProcess(1);
                        }
                        // ⛔ terzo ripiego (cura unica dei gialli, 13/11/2026, revisore A): Windows rifiuta anche di rilegare il gruppo.
                        // Prima la risposta era `false` e, dopo «sfondo» (KILL_ON_JOB_CLOSE già tolto), il nucleo chiudeva il lanciatore
                        // e i programmi restavano tutti accesi. Ora si chiudono uno per uno i membri che Windows conferma nel Job.
                        Some(j) => chiudi_membri_del_job(j),
                        None => chiudi_albero_senza_job(shell),
                    };
                    // solo nelle prove (quinto giro, mutante R-b): la risposta trattenuta, così il filo principale vede SEMPRE il gruppo
                    // vuoto prima che sia scritta, e deve aspettarla (`aspetta_ferma`)
                    if let Some(ms) = guasti::tarda() {
                        std::thread::sleep(Duration::from_millis(ms));
                    }
                    canale.scrivi(if chiuso { "{\"ferma\":true}" } else { "{\"ferma\":false}" });
                    FERMA_IN_CORSO.store(false, Ordering::SeqCst);
                } else if riga == b"sfondo" {
                    // strada Codex: il nucleo ha mandato il comando in sottofondo, che deve sopravvivere a TALOS chiuso o aggiornato
                    if let Some(j) = job {
                        sgancia(j, appoggio, canale);
                    }
                }
                riga.clear();
            }
        }
    }

    /// ⛔ Il terzo ripiego di «ferma» (cura unica dei gialli, 13/11/2026): né `TerminateJobObject` né «muore con me» riescono. Si legge
    /// l'elenco dei PID del Job (`JobObjectBasicProcessIdList`: «the process identifier list for a job object», documentazione letta il
    /// 13/11/2026) e ogni PID si apre e si colpisce SOLO se `IsProcessInJob` dice che quella maniglia è nel NOSTRO Job: un numero
    /// ridato a un estraneo fra l'elenco e `OpenProcess` non è nel Job e non si tocca. Come Codex (`codex-rs/utils/pty/src/win/job.rs:314`:
    /// «A listed PID can be reused before OpenProcess. Only signal confirmed job members.»), con un nuovo giro per i figli nati intanto
    /// (`:288-289`). Questo processo non è nel suo Job (è nel Job del node): non si colpisce mai da solo. Vero se il Job resta vuoto.
    unsafe fn chiudi_membri_del_job(job: HANDLE) -> bool {
        const TESTA: usize = core::mem::offset_of!(JOBOBJECT_BASIC_PROCESS_ID_LIST, ProcessIdList) / core::mem::size_of::<usize>();
        let mut lista = vec![0usize; 64];
        for _giro in 0..20 {
            let letto = QueryInformationJobObject(
                job,
                JobObjectBasicProcessIdList,
                lista.as_mut_ptr() as *mut c_void,
                (lista.len() * core::mem::size_of::<usize>()) as u32,
                null_mut(),
            ) != 0;
            let testa = &*(lista.as_ptr() as *const JOBOBJECT_BASIC_PROCESS_ID_LIST);
            let (assegnati, nella_lista) = (testa.NumberOfAssignedProcesses as usize, testa.NumberOfProcessIdsInList as usize);
            if !letto || nella_lista < assegnati {
                if lista.len() >= 1 << 16 {
                    return false;
                }
                let nuova = (lista.len() * 2).max(TESTA + assegnati + 8);
                lista.resize(nuova, 0);
                continue;
            }
            if assegnati == 0 {
                return true;
            }
            let mut pid: Vec<u32> = lista[TESTA..TESTA + nella_lista].iter().map(|&p| p as u32).collect();
            pid.extend(guasti::falso_membro()); // solo nelle prove: un numero ridato a un estraneo fra l'elenco e OpenProcess
            for p in pid {
                let h = OpenProcess(PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE, 0, p);
                if h.is_null() {
                    continue;
                }
                let mut dentro = 0;
                if IsProcessInJob(h, job, &mut dentro) != 0 && dentro != 0 && TerminateProcess(h, 1) != 0 {
                    WaitForSingleObject(h, 500); // uscito davvero: al giro dopo non è più nell'elenco
                }
                CloseHandle(h);
            }
        }
        false
    }

    /// Una volta sola: «muore con me» si toglie all'uscita della shell o alla riga `sfondo`, la prima che arriva.
    static SGANCIATO: AtomicBool = AtomicBool::new(false);

    /// ⛔ Cura unica dei gialli (13/11/2026, misurato): «ferma» è a metà (il terzo ripiego aspetta l'uscita di ogni membro; senza Job si
    /// chiude prima la shell e poi i presi) e il filo principale vede l'albero vuoto o la shell uscita ed esce col processo intero: la
    /// risposta non arrivava al nucleo (1 volta su 5 col terzo ripiego) e, senza Job, i presi non ancora chiusi potevano restare.
    /// Prima di uscire il filo principale aspetta che «ferma» abbia finito, al massimo `ATTESA_FERMA_MS`.
    static FERMA_IN_CORSO: AtomicBool = AtomicBool::new(false);
    const ATTESA_FERMA_MS: u64 = 15_000;
    fn aspetta_ferma() {
        let inizio = Instant::now();
        while FERMA_IN_CORSO.load(Ordering::SeqCst) && inizio.elapsed() < Duration::from_millis(ATTESA_FERMA_MS) {
            std::thread::sleep(Duration::from_millis(2));
        }
    }
    fn esci_dopo_ferma(codice: u32) -> ! {
        aspetta_ferma();
        unsafe { ExitProcess(codice) }
    }

    /// ⛔ Strada Codex (owner 13/11/2026 12:45, «Sì, giro con la strada Codex»): `KILL_ON_JOB_CLOSE` resta acceso finché la shell gira,
    /// come Codex (`codex-rs/utils/pty/src/win/job.rs:240-257`, `preserve_descendants`, chiamato all'uscita normale della radice in
    /// `codex-rs/utils/pty/src/pipe.rs:257-261`). Prima si toglieva subito dopo la ripartenza, e un lanciatore ucciso (o TALOS chiuso:
    /// libuv mette il lanciatore nel Job del node, `src/win/process.c:74-75` e `:1087`) lasciava il comando in primo piano vivo e
    /// slegato, 10 volte su 10 (controllore del 13/11): lo Stop non lo raggiungeva più. Si toglie qui, una volta: all'uscita della
    /// shell (i programmi che il comando lascia accesi sopravvivono, come in Codex) o quando il nucleo manda il comando in sottofondo
    /// (riga `sfondo`: resta adottabile dopo un riavvio). Se Windows non lo toglie, una riga al nucleo (giro 3).
    unsafe fn sgancia(job: HANDLE, appoggio: bool, canale: &Canale) {
        if appoggio && !SGANCIATO.swap(true, Ordering::SeqCst) && !muore_con_me(job, false) {
            canale.scrivi(RIGA_SGANCIO_RIFIUTATO);
        }
    }

    /// ⛔ Senza Job (Windows l'ha rifiutato; cura dei gialli, 13/11/2026: prima lo Stop chiudeva solo la shell, e i suoi figli restavano
    /// vivi 20 volte su 20): i discendenti della shell si prendono PER MANIGLIA, dalla fotografia dei processi, e si riconoscono dall'ora
    /// di nascita (un processo nato prima del suo «padre» ha un PID riusato, e non è suo). La maniglia tenuta impedisce a Windows di
    /// ridare quel numero mentre si cerca (la shell la tiene questo processo da CreateProcessW). Poi la shell e i presi, per maniglia.
    /// ⛔ Limite scritto (revisori A e C, 13/11/2026, non provocato in 400 lanci): la maniglia tenuta vale solo per la shell. Un figlio che
    /// muore fra la fotografia e `OpenProcess` col numero ridato a un processo nato DOPO la shell passerebbe il controllo della nascita.
    /// Vero se nessuno resta vivo. Un processo nato dopo la fotografia sotto un padre già chiuso resta (come `taskkill /T`).
    unsafe fn chiudi_albero_senza_job(shell: HANDLE) -> bool {
        let nascita = |h: HANDLE| -> u64 {
            let mut t = [core::mem::zeroed::<FILETIME>(); 4];
            let [a, b, c, d] = &mut t;
            GetProcessTimes(h, a, b, c, d);
            (u64::from(t[0].dwHighDateTime) << 32) | u64::from(t[0].dwLowDateTime)
        };
        let mut coppie: Vec<(u32, u32)> = Vec::new();
        let foto = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if valida(foto) {
            let mut e = core::mem::zeroed::<PROCESSENTRY32W>();
            e.dwSize = core::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut ok = Process32FirstW(foto, &mut e) != 0;
            while ok {
                coppie.push((e.th32ProcessID, e.th32ParentProcessID));
                ok = Process32NextW(foto, &mut e) != 0;
            }
            CloseHandle(foto);
        }
        if let Some(estraneo) = guasti::falso_padre() {
            coppie.push((estraneo, GetProcessId(shell))); // solo nelle prove: un numero ridato, figlio della shell nella fotografia
        }
        let mut presi: Vec<HANDLE> = Vec::new();
        let mut coda = vec![(GetProcessId(shell), nascita(shell))];
        while let Some((padre, nato)) = coda.pop() {
            for &(pid, ppid) in &coppie {
                if ppid != padre || pid == padre || pid == 0 {
                    continue;
                }
                let h = OpenProcess(PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE, 0, pid);
                if h.is_null() {
                    continue;
                }
                let n = nascita(h);
                if n < nato {
                    CloseHandle(h); // nato prima del padre: un PID riusato, non è suo
                    continue;
                }
                presi.push(h);
                coda.push((pid, n));
            }
        }
        let fermo = |h: HANDLE| TerminateProcess(h, 1) != 0 || WaitForSingleObject(h, 0) == WAIT_OBJECT_0;
        let mut tutti = fermo(shell);
        for h in presi {
            tutti &= fermo(h);
            CloseHandle(h);
        }
        tutti
    }

    pub fn principale() -> ! {
        unsafe {
            let riga_intera = {
                let p = GetCommandLineW();
                let mut n = 0;
                while *p.add(n) != 0 {
                    n += 1;
                }
                core::slice::from_raw_parts(p, n).to_vec()
            };
            let mut mio = core::mem::zeroed::<STARTUPINFOW>();
            mio.cb = core::mem::size_of::<STARTUPINFOW>() as u32;
            GetStartupInfoW(&mut mio);
            let uscita_canale = maniglia_del_runtime_c(mio.lpReserved2 as *const u8, mio.cbReserved2 as usize, 3);
            if let Some(h) = uscita_canale {
                SetHandleInformation(h, HANDLE_FLAG_INHERIT, 0); // ⛔ §10.1: il canale non passa mai alla shell
            }
            let canale = Canale(uscita_canale);
            // giro g4: l'entrata di «Ferma» non passa mai alla shell, come il canale
            let entrata = maniglia_del_runtime_c(mio.lpReserved2 as *const u8, mio.cbReserved2 as usize, 4);
            if let Some(h) = entrata {
                SetHandleInformation(h, HANDLE_FLAG_INHERIT, 0);
            }

            let (shell, mut riga) = match leggi_riga(&riga_intera) {
                Some((shell, riga)) => (con_zero(shell), con_zero(riga)),
                None => {
                    canale.scrivi("{\"errore\":\"riga\"}");
                    ExitProcess(USCITA_RIGA_ROTTA);
                }
            };

            // il Job (ANONIMO, giro g4) e la sua porta, PRIMA della shell: nessun messaggio si perde
            let mut motivo: Option<String> = None;
            let mut job: Option<HANDLE> = None;
            let mut porta: HANDLE = null_mut();
            // ⛔ l'appoggio c'è solo se Windows l'ha accettato: il ritorno di `muore_con_me` non si ignora (lo dice la riga «avvio»)
            let mut appoggio = false;
            let j = if guasti::attivo("job") { null_mut() } else { CreateJobObjectW(null(), null()) };
            if valida(j) {
                porta = CreateIoCompletionPort(INVALID_HANDLE_VALUE, null_mut(), 0, 1);
                let info = JOBOBJECT_ASSOCIATE_COMPLETION_PORT { CompletionKey: j as *mut c_void, CompletionPort: porta };
                if valida(porta)
                    && SetInformationJobObject(
                        j,
                        JobObjectAssociateCompletionPortInformation,
                        &info as *const _ as *const c_void,
                        core::mem::size_of::<JOBOBJECT_ASSOCIATE_COMPLETION_PORT>() as u32,
                    ) != 0
                {
                    job = Some(j);
                    // da qui alla ripartenza della shell il Job è il suo appoggio: se questo processo muore, lei muore con lui
                    appoggio = !guasti::attivo("appoggio") && muore_con_me(j, true);
                } else {
                    motivo = Some(format!("porta {}", GetLastError()));
                    CloseHandle(j);
                }
            } else {
                motivo = Some(format!("job {}", GetLastError()));
            }

            // SOLO stdin, stdout e stderr passano alla shell (elenco esplicito, senza doppioni)
            let mut ereditate: Vec<HANDLE> = Vec::new();
            let std = [GetStdHandle(STD_INPUT_HANDLE), GetStdHandle(STD_OUTPUT_HANDLE), GetStdHandle(STD_ERROR_HANDLE)];
            for h in std {
                if valida(h) && !ereditate.contains(&h) {
                    SetHandleInformation(h, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT);
                    ereditate.push(h);
                }
            }
            let mut pi = core::mem::zeroed::<PROCESS_INFORMATION>();
            // ⛔ La shell nasce sospesa GIÀ dentro il Job d'appoggio (non c'è più un `AssignProcessToJobObject` dopo). Se Windows non
            // la crea così, qui non si riprova fuori dal Job: si risponde «errore avvio» e il nucleo fa partire il comando come
            // prima, dicendolo (il suo ripiego di sempre). Senza Job (Job rifiutato da Windows) nasce fuori, come prima.
            let creata = crea_shell_sospesa(&shell, &mut riga, &mio, &std, &ereditate, job, &mut pi);
            if let Err(codice) = creata {
                canale.scrivi(&format!("{{\"errore\":\"avvio\",\"codice\":{codice}}}"));
                ExitProcess(USCITA_SHELL_NON_PARTITA);
            }
            // ⛔ La cartella del comando non si tiene (giro di cura del 12/11): la shell l'ha già presa per sé alla creazione, e questo
            // processo vive finché vive l'albero. Una cartella che è «la corrente» di un processo vivo non si cancella né si rinomina:
            // misurato, chi toglieva la cartella appena il comando era fermato trovava ancora questo processo dentro (4 volte su 8).
            // Ci si sposta nella cartella dell'exe, che esiste per forza ed è già occupata dall'exe che gira. Se non riesce, come prima.
            if let Ok(exe) = std::env::current_exe() {
                if let Some(casa) = exe.parent() {
                    let _ = std::env::set_current_dir(casa);
                }
            }
            // ⛔ La riga «avvio» PRIMA di far ripartire la shell (giro di cura del 12/11, B2): il nucleo rilancia il comando come prima
            // se questo processo finisce senza averla scritta, e deve poter contare su «nessun avvio ⇒ il comando non è mai
            // partito». Scritta dopo ResumeThread, un lanciatore ucciso fra le due righe farebbe girare il comando due volte.
            // ⛔ E se la riga NON si riesce a scrivere (canale assente, o il nucleo è già andato) la shell non riparte affatto: si chiude
            // sospesa e si esce. Così «nessun avvio ⇒ mai partito» lo garantisce questo exe, non la fortuna: senza, un canale rotto
            // farebbe girare il comando qui e poi di nuovo nel nucleo.
            let detto = canale.scrivi(&riga_avvio(pi.dwProcessId, motivo.as_deref(), appoggio));
            if !detto {
                TerminateProcess(pi.hProcess, USCITA_AVVIO_NON_DETTO);
                ExitProcess(USCITA_AVVIO_NON_DETTO);
            }
            ResumeThread(pi.hThread);
            // ⛔ Strada Codex (13/11/2026): l'appoggio NON si toglie più qui, dopo la ripartenza. Resta finché la shell gira (un lanciatore
            // ucciso, o TALOS chiuso, ferma il comando in primo piano con lui) e si toglie all'uscita della shell o alla riga `sfondo`
            // (vedi `sgancia`). Il ritorno non si ignora (giro 3, come Codex `codex-rs/utils/pty/src/win/job.rs:136`).
            // giro g4: da qui «Ferma» si ascolta (le maniglie passano al filo come numeri: restano aperte fino all'uscita di questo processo)
            if let Some(e) = entrata {
                let (e, j, s, c) = (e as usize, job.map(|j| j as usize), pi.hProcess as usize, uscita_canale.map(|h| h as usize));
                std::thread::spawn(move || ascolta_ferma(e as HANDLE, j.map(|j| j as HANDLE), appoggio, s as HANDLE, &Canale(c.map(|h| h as HANDLE))));
            }
            CloseHandle(pi.hThread);
            // i tubi sono della shell: questo processo non li tiene aperti (altrimenti si chiuderebbero solo alla sua uscita)
            for h in ereditate {
                CloseHandle(h);
            }

            WaitForSingleObject(pi.hProcess, INFINITE);
            // strada Codex: uscita la shell, i programmi che il comando ha lasciato accesi sopravvivono al lanciatore (`preserve_descendants`)
            if let Some(j) = job {
                sgancia(j, appoggio, &canale);
            }
            let mut codice = 0u32;
            GetExitCodeProcess(pi.hProcess, &mut codice);
            if job.is_none() {
                aspetta_ferma(); // senza Job «ferma» chiude prima la shell, poi i presi: l'albero è vuoto solo dopo
                canale.scrivi(&format!("{{\"uscita\":{codice},\"albero\":\"vuoto\"}}"));
                esci_dopo_ferma(codice);
            }
            let aspetta_vuoto = |ms: u32| -> bool {
                let mut tipo = 0u32;
                let mut chiave = 0usize;
                let mut sovrapposto: *mut OVERLAPPED = null_mut();
                GetQueuedCompletionStatus(porta, &mut tipo, &mut chiave, &mut sovrapposto, ms) != 0 && tipo == MSG_ALBERO_VUOTO
            };
            let inizio = Instant::now();
            let mut vuoto = false;
            while !vuoto {
                let passati = inizio.elapsed();
                if passati >= Duration::from_millis(ATTESA_ALBERO_MS) {
                    break;
                }
                vuoto = aspetta_vuoto((ATTESA_ALBERO_MS as u128 - passati.as_millis()) as u32);
            }
            if vuoto {
                canale.scrivi(&format!("{{\"uscita\":{codice},\"albero\":\"vuoto\"}}"));
            } else {
                canale.scrivi(&format!("{{\"uscita\":{codice}}}"));
                while !aspetta_vuoto(INFINITE) {}
                canale.scrivi("{\"albero\":\"vuoto\"}");
            }
            esci_dopo_ferma(codice);
        }
    }
}

#[cfg(windows)]
fn main() {
    win::principale()
}

#[cfg(not(windows))]
fn main() {
    eprintln!("talos-lanciatore: only for Windows");
    std::process::exit(2);
}

#[cfg(all(test, windows))]
mod prove {
    use super::win::{leggi_riga, maniglia_del_runtime_c, riga_avvio, RIGA_SGANCIO_RIFIUTATO};
    fn w(s: &str) -> Vec<u16> {
        s.encode_utf16().collect()
    }
    #[test]
    fn la_riga_della_shell_resta_byte_per_byte() {
        let Some((shell, riga)) = leggi_riga(&w("\"C:\\a b\\l.exe\" \"C:\\W\\cmd.exe\" C:\\W\\cmd.exe /d /s /c \"  x  \"  ")) else { panic!("lancia") };
        assert_eq!(shell, w("C:\\W\\cmd.exe"));
        assert_eq!(riga, w("C:\\W\\cmd.exe /d /s /c \"  x  \"  "));
    }
    #[test]
    fn nessun_nome_e_nessun_modo_ferma() {
        // giro g4: niente più `--ferma "<nome>"` (non è fra virgolette: riga rotta) e niente nome di Job davanti alla shell
        assert!(leggi_riga(&w("\"l.exe\" --ferma \"Local\\talos-x\"")).is_none());
        let Some((shell, _)) = leggi_riga(&w("\"l.exe\" \"Local\\talos-x\" \"cmd.exe\" x")) else { panic!("lancia") };
        assert_eq!(shell, w("Local\\talos-x"), "il primo pezzo fra virgolette è la shell: un nome non fa più partire niente");
    }
    #[test]
    fn la_riga_avvio_dice_l_appoggio_solo_quando_manca() {
        assert_eq!(riga_avvio(7, None, true), "{\"avvio\":7,\"nipoti\":true}", "con l'appoggio: la riga di prima");
        assert_eq!(riga_avvio(7, None, false), "{\"avvio\":7,\"nipoti\":true,\"appoggio\":false}", "appoggio rifiutato: si dice");
        for appoggio in [true, false] {
            assert_eq!(riga_avvio(7, Some("nome"), appoggio), "{\"avvio\":7,\"nipoti\":false,\"motivo\":\"nome\"}", "senza Job: niente appoggio da dire");
        }
    }
    #[test]
    fn la_riga_dello_sgancio_rifiutato() {
        // giro 3: la legge il nucleo (`lanciatore-windows.mjs`, `m.sgancio === false`): il campo e il valore esatti
        assert_eq!(RIGA_SGANCIO_RIFIUTATO, "{\"sgancio\":false}");
    }
    #[test]
    fn righe_rotte() {
        assert!(leggi_riga(&w("l.exe cmd.exe /c x")).is_none());
        assert!(leggi_riga(&w("l.exe \"\" x")).is_none());
        assert!(leggi_riga(&w("l.exe \"cmd.exe\"")).is_none());
        assert!(leggi_riga(&w("l.exe \"cmd.exe\" ")).is_none());
    }
    #[test]
    fn il_blocco_del_runtime_c() {
        let mut b: Vec<u8> = Vec::new();
        b.extend_from_slice(&5i32.to_le_bytes());
        b.extend_from_slice(&[1, 1, 1, 1, 0]);
        for k in 10usize..15 {
            b.extend_from_slice(&k.to_le_bytes());
        }
        unsafe {
            assert_eq!(maniglia_del_runtime_c(b.as_ptr(), b.len(), 3).map(|h| h as usize), Some(13));
            assert_eq!(maniglia_del_runtime_c(b.as_ptr(), b.len(), 4), None, "senza FOPEN");
            assert_eq!(maniglia_del_runtime_c(b.as_ptr(), b.len(), 5), None, "oltre n");
            assert_eq!(maniglia_del_runtime_c(b.as_ptr(), b.len() - 1, 3), None, "blocco corto");
        }
    }
}
