//! Non-production launch/measurement harness. All objects and permissions are
//! temporary and per-run; no firewall, loopback exemptions, accounts or services.
mod ffi;
use ffi::*;
use crate::protocol::{peer_matches, Report, FRAME_BYTES};
use std::{ffi::{c_void, OsStr, OsString}, fs::{self, File, OpenOptions}, io::{self, Write},
    mem::{size_of, zeroed}, net::{SocketAddr, TcpListener, TcpStream}, os::windows::{ffi::OsStrExt, fs::OpenOptionsExt},
    path::{Path, PathBuf}, ptr::{null, null_mut}, thread, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};

type Result<T> = std::result::Result<T, String>;
const DEADLINE_MS: u32 = 5000;
const SYNTHETIC: &str = "TALOS_SPIKE_SYNTHETIC_SECRET";
const CONTENT: &[u8] = b"synthetic fixture only\n";
const KILL_ON_CLOSE: u32 = 0x2000;
// JOB_OBJECT_LIMIT_ACTIVE_PROCESS is required: setting basic.active alone
// does not enforce a cap. Keep the SDK flags named and test the actual limit.
const ACTIVE_PROCESS_LIMIT: u32 = 0x8;
const LIMIT_FLAGS: u32 = KILL_ON_CLOSE | ACTIVE_PROCESS_LIMIT | 0x100 | 0x200 | 0x400;
// FILE_WRITE_DATA | SYNCHRONIZE, not GENERIC_WRITE: the latter also grants
// FILE_CREATE_PIPE_INSTANCE. The client needs to send a frame, not host a pipe.
const PIPE_CLIENT_ACCESS: u32 = 0x00100002;

fn check(ok: i32, context: &str) -> Result<()> {
    if ok != 0 { Ok(()) } else { Err(format!("{context}: Win32 {}", unsafe { GetLastError() })) }
}
fn ensure(ok: bool, context: &str) -> Result<()> { if ok { Ok(()) } else { Err(context.into()) } }
fn io_result<T>(result: io::Result<T>) -> Result<T> { result.map_err(|e| e.to_string()) }
fn wide(value: &OsStr) -> Result<Vec<u16>> {
    let mut text: Vec<u16> = value.encode_wide().collect();
    ensure(!text.contains(&0), "NUL in Windows argument")?; text.push(0); Ok(text)
}
fn w(value: &str) -> Result<Vec<u16>> { wide(OsStr::new(value)) }
fn pass(name: &str) { println!("{{\"check\":\"{name}\",\"passed\":true}}"); }
struct Owned(Handle);
impl Owned {
    fn new(handle: Handle, context: &str) -> Result<Self> {
        if handle.is_null() || handle as isize == -1 { Err(format!("{context}: Win32 {}", unsafe { GetLastError() })) }
        else { Ok(Self(handle)) }
    }
}
impl Drop for Owned { fn drop(&mut self) { unsafe { CloseHandle(self.0); } } }
struct Local(*mut c_void);
impl Drop for Local { fn drop(&mut self) { unsafe { LocalFree(self.0); } } }
fn descriptor(sddl: &str) -> Result<Local> {
    let mut pointer = null_mut();
    unsafe { check(ConvertStringSecurityDescriptorToSecurityDescriptorW(w(sddl)?.as_ptr(), 1, &mut pointer, null_mut()), "parse DACL")?; }
    Ok(Local(pointer))
}
fn token(process: Handle) -> Result<Owned> {
    let mut raw = null_mut(); unsafe { check(OpenProcessToken(process, 8, &mut raw), "OpenProcessToken")?; }
    Owned::new(raw, "token")
}
fn token_info(token: Handle, class: i32) -> Result<Vec<usize>> {
    let mut bytes = 0;
    unsafe { GetTokenInformation(token, class, null_mut(), 0, &mut bytes); }
    ensure(bytes > 0 && bytes < 65536, "token information size invalid")?;
    let mut data = vec![0usize; (bytes as usize).div_ceil(size_of::<usize>())];
    unsafe { check(GetTokenInformation(token, class, data.as_mut_ptr().cast(), bytes, &mut bytes), "GetTokenInformation")?; }
    Ok(data)
}
fn sid_string(sid: Sid) -> Result<String> {
    let mut raw = null_mut(); unsafe { check(ConvertSidToStringSidW(sid, &mut raw), "SID string")?; }
    let _memory = Local(raw.cast());
    let mut len = 0; unsafe { while *raw.add(len) != 0 { len += 1; } }
    String::from_utf16(unsafe { std::slice::from_raw_parts(raw, len) }).map_err(|e| e.to_string())
}
fn current_owner() -> Result<String> {
    let token = token(unsafe { GetCurrentProcess() })?;
    let data = token_info(token.0, 1)?; sid_string(data[0] as Sid)
}
fn is_container(process: Handle) -> Result<bool> {
    let token = token(process)?; let data = token_info(token.0, 29)?;
    Ok(unsafe { *(data.as_ptr().cast::<u32>()) } != 0)
}
fn same_container(process: Handle, expected: Sid) -> Result<bool> {
    if !is_container(process)? { return Ok(false); }
    let token = token(process)?; let data = token_info(token.0, 31)?;
    Ok(unsafe { EqualSid(data[0] as Sid, expected) } != 0)
}
struct Profile { name: Vec<u16>, sid: Sid, deleted: bool }
impl Profile {
    fn new(name: &str) -> Result<Self> {
        let name = w(name)?; let mut sid = null_mut();
        let hr = unsafe { CreateAppContainerProfile(name.as_ptr(), name.as_ptr(), name.as_ptr(), null(), 0, &mut sid) };
        // Never reuse an existing profile: it could carry earlier grants.
        ensure(hr >= 0, &format!("CreateAppContainerProfile HRESULT {hr:#x}"))?;
        Ok(Self { name, sid, deleted: false })
    }
    fn cleanup(&mut self) -> Result<()> {
        let hr = unsafe { DeleteAppContainerProfile(self.name.as_ptr()) };
        ensure(hr >= 0, &format!("DeleteAppContainerProfile HRESULT {hr:#x}"))?;
        self.deleted = true; Ok(())
    }
}
impl Drop for Profile {
    fn drop(&mut self) { unsafe {
        if !self.deleted { DeleteAppContainerProfile(self.name.as_ptr()); }
        FreeSid(self.sid);
    } }
}
fn set_acl(path: &Path, owner: &str, packages: &[&str], access: &str, inherit: bool) -> Result<()> {
    let propagation = if inherit { "OICI" } else { "" };
    let mut sddl = format!("D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;{owner})");
    for sid in packages { sddl.push_str(&format!("(A;{propagation};{access};;;{sid})")); }
    sddl.push_str("S:(ML;OICI;NW;;;LW)");
    let sd = descriptor(&sddl)?;
    unsafe { check(SetFileSecurityW(wide(path.as_os_str())?.as_ptr(), 4 | 0x10, sd.0), "set fixture ACL") }
}
struct Fixture { root: PathBuf, exe: PathBuf, private: PathBuf, immutable: PathBuf, scratch: PathBuf }
impl Fixture {
    fn new(name: &str, owner: &str, packages: &[&str]) -> Result<Self> {
        let root = std::env::temp_dir().join(name);
        io_result(fs::create_dir(&root))?; // create_new semantics: never adopt an existing tree.
        let result = (|| {
            set_acl(&root, owner, packages, "GRGX", false)?;
            let bin = root.join("bin"); io_result(fs::create_dir(&bin))?;
            set_acl(&bin, owner, packages, "GRGX", true)?;
            let scratch = root.join("scratch"); io_result(fs::create_dir(&scratch))?;
            set_acl(&scratch, owner, packages, "GRGWGX", true)?;
            let private = root.join("private.txt"); io_result(fs::write(&private, CONTENT))?;
            set_acl(&private, owner, &[], "", false)?;
            let immutable = bin.join("immutable.txt"); io_result(fs::write(&immutable, CONTENT))?;
            let exe = bin.join("probe.exe"); io_result(fs::copy(io_result(std::env::current_exe())?, &exe))?;
            // CopyFile may copy source security; set the intended destination ACL explicitly.
            set_acl(&exe, owner, packages, "GRGX", false)?;
            set_acl(&immutable, owner, packages, "GRGX", false)?;
            Ok(Self { root: root.clone(), exe, private, immutable, scratch })
        })();
        if result.is_err() { let _ = fs::remove_dir_all(&root); }
        result
    }
    fn cleanup(&self) -> Result<()> { io_result(fs::remove_dir_all(&self.root)) }
}
impl Drop for Fixture { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.root); } }

fn new_job() -> Result<Owned> { new_job_with_active_limit(4) }
fn new_job_with_active_limit(active: u32) -> Result<Owned> {
    ensure((1..=5).contains(&active), "lab process limit must be 1..=5")?;
    let job = Owned::new(unsafe { CreateJobObjectW(null(), null()) }, "CreateJobObject")?;
    let mut limits: ExtendedLimits = unsafe { zeroed() };
    limits.basic.flags = LIMIT_FLAGS; limits.basic.active = active;
    limits.process_memory = 64 * 1024 * 1024; limits.job_memory = 128 * 1024 * 1024;
    unsafe { check(SetInformationJobObject(job.0, 9, (&limits as *const ExtendedLimits).cast(), size_of::<ExtendedLimits>() as u32), "set Job limits")?; }
    let mut actual: ExtendedLimits = unsafe { zeroed() };
    unsafe { check(QueryInformationJobObject(job.0, 9, (&mut actual as *mut ExtendedLimits).cast(), size_of::<ExtendedLimits>() as u32, null_mut()), "read Job limits")?; }
    ensure(actual.basic.flags == LIMIT_FLAGS && actual.basic.active == active
        && actual.process_memory == limits.process_memory && actual.job_memory == limits.job_memory, "Job limits differ from request")?;
    Ok(job)
}
struct Attributes(Vec<usize>);
impl Attributes {
    fn new(count: u32) -> Result<Self> {
        let mut size = 0;
        unsafe { InitializeProcThreadAttributeList(null_mut(), count, 0, &mut size); }
        ensure(size > 0 && size < 65536, "attribute size invalid")?;
        let mut words = vec![0usize; size.div_ceil(size_of::<usize>())];
        unsafe { check(InitializeProcThreadAttributeList(words.as_mut_ptr().cast(), count, 0, &mut size), "init attributes")?; }
        Ok(Self(words))
    }
    fn pointer(&mut self) -> *mut c_void { self.0.as_mut_ptr().cast() }
    fn add<T>(&mut self, key: usize, value: &mut T) -> Result<()> {
        unsafe { check(UpdateProcThreadAttribute(self.pointer(), 0, key, (value as *mut T).cast(), size_of::<T>(), null_mut(), null_mut()), "set process attribute") }
    }
}
impl Drop for Attributes { fn drop(&mut self) { unsafe { DeleteProcThreadAttributeList(self.pointer()); } } }
struct Child { process: Owned, thread: Owned, pid: u32 }
impl Drop for Child {
    fn drop(&mut self) { unsafe {
        if WaitForSingleObject(self.process.0, 0) == 258 {
            TerminateProcess(self.process.0, 125); WaitForSingleObject(self.process.0, DEADLINE_MS);
        }
    } }
}
fn quote(arg: &OsStr) -> Result<Vec<u16>> {
    let raw = wide(arg)?; let mut out = vec![34]; let mut slashes = 0;
    for &ch in &raw[..raw.len() - 1] {
        if ch == 92 { slashes += 1; continue; }
        out.extend(std::iter::repeat_n(92, if ch == 34 { slashes * 2 + 1 } else { slashes }));
        out.push(ch); slashes = 0;
    }
    out.extend(std::iter::repeat_n(92, slashes * 2)); out.push(34); Ok(out)
}
fn command_line(exe: &Path, args: &[OsString]) -> Result<Vec<u16>> {
    let mut command = quote(exe.as_os_str())?;
    for arg in args { command.push(32); command.extend(quote(arg)?); }
    command.push(0); ensure(command.len() < 32767, "command too large")?; Ok(command)
}
fn environment(temp: &Path) -> Result<Vec<u16>> {
    let system_root = std::env::var_os("SystemRoot").ok_or("SystemRoot absent")?;
    let mut block = Vec::new();
    for (key, value) in [("SystemRoot", system_root), ("TEMP", temp.as_os_str().to_owned()), ("TMP", temp.as_os_str().to_owned())] {
        let mut pair = OsString::from(key); pair.push("="); pair.push(value); block.extend(wide(&pair)?);
    }
    block.push(0); Ok(block)
}
/// sid=None is used ONLY by the explicit unrestricted positive control/intruder
/// measurements. There is no failure fallback from Some(sid) to None.
fn launch(exe: &Path, args: &[OsString], temp: &Path, job: &Owned, sid: Option<Sid>) -> Result<Child> {
    let mut capabilities = SecurityCapabilities { sid: sid.unwrap_or(null_mut()), capabilities: null_mut(), count: 0, reserved: 0 };
    let mut jobs = [job.0];
    let mut attributes = Attributes::new(if sid.is_some() { 2 } else { 1 })?;
    // JOB_LIST assigns the job during creation: no parent-crash window between
    // CreateProcess and AssignProcessToJobObject. Handles are not inherited.
    attributes.add(0x0002000d, &mut jobs)?;
    if sid.is_some() { attributes.add(0x00020009, &mut capabilities)?; }
    let mut startup: StartupInfoEx = unsafe { zeroed() };
    startup.startup.cb = size_of::<StartupInfoEx>() as u32; startup.attributes = attributes.pointer();
    let mut information: ProcessInformation = unsafe { zeroed() };
    let mut command = command_line(exe, args)?; let env = environment(temp)?;
    unsafe { check(CreateProcessW(wide(exe.as_os_str())?.as_ptr(), command.as_mut_ptr(), null(), null(), 0,
        0x00080000 | 0x00000400 | 0x00000004 | 0x08000000, env.as_ptr().cast(), wide(temp.as_os_str())?.as_ptr(),
        &startup.startup, &mut information), "CreateProcess with mandatory job/container")?; }
    let child = Child { process: Owned::new(information.process, "child process")?,
        thread: Owned::new(information.thread, "child thread")?, pid: information.pid };
    let mut inside = 0;
    unsafe { check(IsProcessInJob(child.process.0, job.0, &mut inside), "child Job identity")?; }
    ensure(inside != 0, "child not in mandatory Job")?;
    if let Some(sid) = sid { ensure(same_container(child.process.0, sid)?, "child container identity mismatch")?; }
    ensure(unsafe { ResumeThread(child.thread.0) } != u32::MAX, "ResumeThread failed")?;
    Ok(child)
}

struct Pipe { handle: Owned, name: OsString }
impl Pipe {
    fn new(name: &str, owner: &str, package: &str) -> Result<Self> {
        let sd = descriptor(&format!("D:P(A;;FA;;;SY)(A;;FA;;;{owner})(A;;0x{PIPE_CLIENT_ACCESS:08x};;;{package})S:(ML;;NW;;;LW)"))?;
        let attrs = SecurityAttributes { length: size_of::<SecurityAttributes>() as u32, descriptor: sd.0, inherit: 0 };
        // Broker-created, unpackaged named pipe. Do not broaden ACLs or enable
        // loopback exemptions to make a failing AppContainer test appear green.
        let name = OsString::from(format!("\\\\.\\pipe\\{name}"));
        let handle = Owned::new(unsafe { CreateNamedPipeW(wide(&name)?.as_ptr(), 1 | 0x40000000 | 0x00080000,
            8, 1, 4096, 4096, DEADLINE_MS, &attrs) }, "CreateNamedPipe")?;
        Ok(Self { handle, name })
    }
    fn connect(&self) -> Result<()> {
        let event = Owned::new(unsafe { CreateEventW(null(), 1, 0, null()) }, "connect event")?;
        let mut ov: Overlapped = unsafe { zeroed() }; ov.event = event.0;
        if unsafe { ConnectNamedPipe(self.handle.0, &mut ov) } != 0 { return Ok(()); }
        let error = unsafe { GetLastError() };
        if error == 535 { return Ok(()); } // ERROR_PIPE_CONNECTED, not a policy fallback.
        ensure(error == 997, &format!("ConnectNamedPipe Win32 {error}"))?;
        finish_io(self.handle.0, &mut ov, DEADLINE_MS).map(|_| ())
    }
    fn authenticate(&self, child: &Child, job: &Owned, sid: Sid) -> Result<bool> {
        let mut actual = 0; let mut inside = 0;
        unsafe {
            check(GetNamedPipeClientProcessId(self.handle.0, &mut actual), "OS pipe peer PID")?;
            check(IsProcessInJob(child.process.0, job.0, &mut inside), "OS peer Job")?;
        }
        ensure(unsafe { GetProcessId(child.process.0) } == child.pid, "retained process identity mismatch")?;
        let alive = unsafe { WaitForSingleObject(child.process.0, 0) } == 258;
        Ok(peer_matches(child.pid, actual, inside != 0 && alive,
            is_container(child.process.0)?, same_container(child.process.0, sid)?))
    }
    fn read_frame(&self) -> Result<Vec<u8>> {
        let deadline = Instant::now() + Duration::from_millis(DEADLINE_MS.into());
        let prefix = self.read_exact(4, deadline)?;
        let size = u32::from_le_bytes(prefix.try_into().unwrap()) as usize;
        ensure(size == FRAME_BYTES, "FRAME_SIZE_INVALID")?;
        self.read_exact(size, deadline)
    }
    fn read_exact(&self, size: usize, deadline: Instant) -> Result<Vec<u8>> {
        ensure(size <= FRAME_BYTES, "frame exceeds cap")?;
        let mut bytes = vec![0u8; size]; let mut offset = 0;
        while offset < size {
            let remaining = deadline.saturating_duration_since(Instant::now()).as_millis() as u32;
            ensure(remaining > 0, "IPC deadline expired")?;
            let event = Owned::new(unsafe { CreateEventW(null(), 1, 0, null()) }, "read event")?;
            let mut ov: Overlapped = unsafe { zeroed() }; ov.event = event.0;
            let mut count = 0;
            let ok = unsafe { ReadFile(self.handle.0, bytes[offset..].as_mut_ptr().cast(), (size - offset) as u32, &mut count, &mut ov) };
            if ok == 0 {
                let error = unsafe { GetLastError() };
                ensure(error == 997, &format!("ReadFile Win32 {error}"))?;
                count = finish_io(self.handle.0, &mut ov, remaining)?;
            }
            ensure(count > 0 && count as usize <= size - offset, "IPC closed or invalid count")?;
            offset += count as usize;
        }
        Ok(bytes)
    }
}
impl Drop for Pipe { fn drop(&mut self) { unsafe { DisconnectNamedPipe(self.handle.0); } } }
fn finish_io(file: Handle, ov: &mut Overlapped, timeout: u32) -> Result<u32> {
    let waited = unsafe { WaitForSingleObject(ov.event, timeout) }; let mut count = 0;
    if waited != 0 {
        // Drain cancelled I/O before stack buffers/OVERLAPPED can be dropped.
        unsafe { CancelIoEx(file, ov); GetOverlappedResult(file, ov, &mut count, 1); }
        return Err(format!("IPC wait failed/expired: {waited}"));
    }
    unsafe { check(GetOverlappedResult(file, ov, &mut count, 0), "complete IPC")?; }
    Ok(count)
}
fn raw_error<T>(result: io::Result<T>) -> u32 {
    match result { Ok(_) => 0, Err(error) => error.raw_os_error().map(|n| n as u32).unwrap_or(u32::MAX) }
}
fn idle() -> ! { loop { thread::sleep(Duration::from_secs(60)); } }
fn child(args: &[OsString]) -> Result<()> {
    ensure(args.len() == 8, "invalid probe arguments")?;
    let pipe = &args[1]; let private = &args[2]; let scratch = &args[3]; let immutable = &args[4];
    let port: u16 = args[5].to_str().ok_or("invalid port")?.parse().map_err(|_| "invalid port")?;
    let mode = args[6].to_str().ok_or("invalid probe mode")?;
    let make_descendant = args[7] == "tree";
    let mut report = Report { read_error: 0, write_error: 0, immutable_error: 0, network_error: 0,
        env_absent: u32::from(std::env::var_os(SYNTHETIC).is_none()), descendant: 0, scratch_written: 0 };
    if mode == "probe" {
        report.read_error = raw_error(File::open(private));
        report.write_error = raw_error(OpenOptions::new().write(true).open(private));
        report.immutable_error = raw_error(OpenOptions::new().write(true).open(immutable));
        let address = SocketAddr::from(([127, 0, 0, 1], port));
        report.network_error = raw_error(TcpStream::connect_timeout(&address, Duration::from_millis(1000)));
        let mut file = io_result(OpenOptions::new().write(true).create_new(true).open(scratch))?;
        io_result(file.write_all(CONTENT))?; io_result(file.sync_all())?;
        report.scratch_written = 1;
    }
    if make_descendant {
        let exe = io_result(std::env::current_exe())?;
        let mut command = command_line(&exe, &[OsString::from("--idle")])?;
        let mut si: StartupInfo = unsafe { zeroed() }; si.cb = size_of::<StartupInfo>() as u32;
        let mut pi: ProcessInformation = unsafe { zeroed() };
        unsafe { check(CreateProcessW(wide(exe.as_os_str())?.as_ptr(), command.as_mut_ptr(), null(), null(), 0,
            0x08000000, null(), null(), &si, &mut pi), "probe descendant")?; }
        // No breakaway flags; container token and Job membership are inherited.
        let _thread = Owned::new(pi.thread, "descendant thread")?;
        let _process = Owned::new(pi.process, "descendant process")?;
        report.descendant = pi.pid;
    }
    let mut frame = report.encode(); if mode == "bad-frame" { frame[3] = b'9'; }
    let mut file = io_result(OpenOptions::new().access_mode(PIPE_CLIENT_ACCESS).open(pipe))?;
    io_result(file.write_all(&(FRAME_BYTES as u32).to_le_bytes()))?;
    io_result(file.write_all(&frame))?;
    drop(file); idle()
}
fn probe_args(pipe: &Pipe, fixture: &Fixture, case: &str, port: u16, mode: &str, tree: bool) -> Vec<OsString> {
    vec!["--probe".into(), pipe.name.clone(), fixture.private.as_os_str().into(),
        fixture.scratch.join(format!("{case}.txt")).into_os_string(), fixture.immutable.as_os_str().into(),
        port.to_string().into(), mode.into(), if tree { "tree" } else { "single" }.into()]
}
fn sandbox_case(name: &str, owner: &str, profile: &Profile, expected_sid: Sid, fixture: &Fixture,
    port: u16, mode: &str, expect_auth: bool, sandboxed: bool, tree: bool) -> Result<Option<Report>> {
    let pipe = Pipe::new(name, owner, &sid_string(profile.sid)?)?;
    let job = new_job()?;
    let child = launch(&fixture.exe, &probe_args(&pipe, fixture, name, port, mode, tree), &fixture.scratch,
        &job, if sandboxed { Some(profile.sid) } else { None })?;
    pipe.connect().map_err(|error| {
        let mut exit = 0; unsafe { GetExitCodeProcess(child.process.0, &mut exit); }
        format!("{error}; child exit/status={exit:#x}")
    })?;
    ensure(pipe.authenticate(&child, &job, expected_sid)? == expect_auth, "peer authority assertion failed")?;
    if !expect_auth { pass(name); return Ok(None); }
    let frame = pipe.read_frame()?;
    if mode == "bad-frame" {
        ensure(Report::decode(&frame) == Err("FRAME_INVALID"), "malformed frame accepted")?;
        pass(name); return Ok(None);
    }
    let report = Report::decode(&frame).map_err(str::to_owned)?;
    println!("{{\"probe\":\"{name}\",\"read_error\":{},\"write_error\":{},\"immutable_error\":{},\"network_error\":{}}}",
        report.read_error, report.write_error, report.immutable_error, report.network_error);
    ensure(report.read_error == 5 && report.write_error == 5 && report.immutable_error == 5,
        "filesystem denial was not ERROR_ACCESS_DENIED")?;
    ensure(report.network_error == 10013, "loopback denial was not WSAEACCES; timeout/refusal is not evidence")?;
    ensure(report.env_absent == 1 && report.scratch_written == 1, "environment/scratch contract failed")?;
    ensure(io_result(fs::read(fixture.scratch.join(format!("{name}.txt"))))? == CONTENT, "scratch effect not observed")?;
    ensure(io_result(fs::read(&fixture.private))? == CONTENT && io_result(fs::read(&fixture.immutable))? == CONTENT, "protected fixture changed")?;
    if tree {
        ensure(report.descendant != 0 && report.descendant != child.pid, "descendant not reported")?;
        let descendant = Owned::new(unsafe { OpenProcess(0x00100000 | 0x1000, 0, report.descendant) }, "observe descendant")?;
        let mut inside = 0;
        unsafe { check(IsProcessInJob(descendant.0, job.0, &mut inside), "descendant Job")?; }
        ensure(inside != 0 && same_container(descendant.0, profile.sid)?, "descendant escaped Job/container")?;
        let mut accounting: Accounting = unsafe { zeroed() };
        unsafe { check(QueryInformationJobObject(job.0, 1, (&mut accounting as *mut Accounting).cast(), size_of::<Accounting>() as u32, null_mut()), "Job accounting")?; }
        ensure(accounting.active == 2, "expected exactly two live contained processes")?;
        drop(job); // Sole job handle. Observe both exits, do not infer from kill request.
        ensure(unsafe { WaitForSingleObject(child.process.0, DEADLINE_MS) } == 0, "parent still alive after Job close")?;
        ensure(unsafe { WaitForSingleObject(descendant.0, DEADLINE_MS) } == 0, "descendant still alive after Job close")?;
        pass("job_close_terminates_observed_tree");
    }
    pass(name); Ok(Some(report))
}
/// A read-back of ActiveProcessLimit is not an enforcement test. Prove that
/// identical fifth launches succeed with a cap of five and are refused with four.
/// Both controls stay in AppContainer, and at most five tiny idle probes coexist.
fn process_cap_probe(fixture: &Fixture, profile: &Profile) -> Result<()> {
    for cap in [5, 4] {
        let job = new_job_with_active_limit(cap)?;
        let mut children = Vec::new();
        for _ in 0..cap {
            children.push(launch(&fixture.exe, &[OsString::from("--idle")],
                &fixture.scratch, &job, Some(profile.sid))?);
        }
        for child in &children {
            ensure(unsafe { WaitForSingleObject(child.process.0, 0) } == 258,
                "process-cap positive control exited before observation")?;
        }
        if cap == 4 {
            match launch(&fixture.exe, &[OsString::from("--idle")],
                &fixture.scratch, &job, Some(profile.sid)) {
                Ok(_unexpected_child) => return Err("fifth process escaped active-process cap".into()),
                // This is the private launch wrapper's exact Win32 error envelope.
                // A missing file or unrelated setup failure is not a quota denial.
                Err(error) => ensure(error == "CreateProcess with mandatory job/container: Win32 1816",
                    &format!("expected ERROR_NOT_ENOUGH_QUOTA (1816), got {error}"))?,
            }
        }
        let mut accounting: Accounting = unsafe { zeroed() };
        unsafe { check(QueryInformationJobObject(job.0, 1, (&mut accounting as *mut Accounting).cast(),
            size_of::<Accounting>() as u32, null_mut()), "process-cap accounting")?; }
        ensure(accounting.active == cap, "process-cap active count changed unexpectedly")?;
        drop(job);
        for child in &children {
            ensure(unsafe { WaitForSingleObject(child.process.0, DEADLINE_MS) } == 0,
                "process-cap child survived Job close")?;
        }
        println!("{{\"check\":\"active_process_cap\",\"limit\":{cap},\"observed_active\":{},\"fifth_launch_denied\":{},\"passed\":true}}",
            accounting.active, cap == 4);
    }
    Ok(())
}
fn experiment() -> Result<()> {
    let owner = current_owner()?;
    let token = token(unsafe { GetCurrentProcess() })?;
    let elevation = token_info(token.0, 20)?;
    let elevated = unsafe { *(elevation.as_ptr().cast::<u32>()) } != 0;
    println!("{{\"schema\":\"talos.containment-spike.v1\",\"windows_x64\":true,\"launcher_elevated\":{elevated}}}");
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let name = format!("TALOS.Spike.{}.{nonce}", std::process::id());
    let mut profile = Profile::new(&name)?;
    let mut foreign = Profile::new(&format!("{name}.B"))?;
    let a = sid_string(profile.sid)?; let b = sid_string(foreign.sid)?;
    let fixture = Fixture::new(&name, &owner, &[&a, &b])?;
    let server = io_result(TcpListener::bind(("127.0.0.1.1", 0)))?;
    let port = io_result(server.local_addr())?.port();
    let original_env = std::env::var_os(SYNTHETIC);
    std::env::set_var(SYNTHETIC, "synthetic-not-a-real-secret");
    let measured: Result<()> = (|| {
        // Same executable and fixtures, no AppContainer. Positive control must
        // actually connect/read/open-for-write, or negative probes prove nothing.
        let control_name = format!("{name}.control");
        {
            let pipe = Pipe::new(&control_name, &owner, &a)?; let job = new_job()?;
            let child = launch(&fixture.exe, &probe_args(&pipe, &fixture, &control_name, port, "probe", false),
                &fixture.scratch, &job, None)?;
            pipe.connect()?;
            let mut actual = 0;
            unsafe { check(GetNamedPipeClientProcessId(pipe.handle.0, &mut actual), "control peer")?; }
            ensure(actual == child.pid && !is_container(child.process.0)?, "positive control unexpectedly sandboxed")?;
            let report = Report::decode(&pipe.read_frame()?).map_err(str::to_owned)?;
            ensure(report.read_error == 0 && report.write_error == 0 && report.immutable_error == 0
                && report.network_error == 0 && report.env_absent == 1 && report.scratch_written == 1, "positive control unavailable")?;
            pass("unrestricted_positive_control");
        }
        sandbox_case(&format!("{name}.contained"), &owner, &profile, profile.sid, &fixture, port, "probe", true, true, true)?;
        sandbox_case(&format!("{name}.uncontained-peer"), &owner, &profile, profile.sid, &fixture, port, "hello", false, false, false)?;
        sandbox_case(&format!("{name}.foreign-sid"), &owner, &foreign, profile.sid, &fixture, port, "hello", false, true, false)?;
        sandbox_case(&format!("{name}.bad-frame"), &owner, &profile, profile.sid, &fixture, port, "bad-frame", true, true, false)?;
        process_cap_probe(&fixture, &profile)?;
        Ok(())
    })();
    match original_env { Some(value) => std::env::set_var(SYNTHETIC, value), None => std::env::remove_var(SYNTHETIC) }
    measured?;
    fixture.cleanup()?; foreign.cleanup()?; profile.cleanup()?;
    pass("temporary_profiles_and_fixtures_removed");
    println!("{{\"result\":\"PASS\",\"scope\":\"synthetic-containment-probes-only\",\"standard_user_verified\":{}}}", !elevated);
    Ok(())
}
pub fn run() -> Result<()> {
    let args: Vec<OsString> = std::env::args_os().skip(1).collect();
    if args.first().is_some_and(|a| a == "--idle") { idle(); }
    if args.first().is_some_and(|a| a == "--probe") { return child(&args); }
    ensure(args.len() == 1 && args[0] == "--run-synthetic-probes", "use --run-synthetic-probes; lab only")?;
    experiment()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn active_process_limit_is_enabled() {
        assert_ne!(LIMIT_FLAGS & ACTIVE_PROCESS_LIMIT, 0);
        assert_ne!(LIMIT_FLAGS & KILL_ON_CLOSE, 0);
        assert_eq!(LIMIT_FLAGS & (0x800 | 0x1000), 0, "no breakaway flags");
    }
    #[test] fn pipe_client_cannot_request_a_server_instance() {
        assert_eq!(PIPE_CLIENT_ACCESS & 0x4, 0); // FILE_CREATE_PIPE_INSTANCE
        assert_eq!(PIPE_CLIENT_ACCESS, 0x00100002);
    }
    #[test] fn arguments_are_quoted_and_nul_rejected() {
        assert_eq!(String::from_utf16(&quote(OsStr::new("a b")).unwrap()).unwrap(), "\"a b\"");
        assert_eq!(String::from_utf16(&quote(OsStr::new("a\\")).unwrap()).unwrap(), "\"a\\\\\"");
        assert_eq!(String::from_utf16(&quote(OsStr::new("a\"b")).unwrap()).unwrap(), "\"a\\\"b\"");
        assert!(quote(OsStr::new("a\0b")).is_err());
    }
}
