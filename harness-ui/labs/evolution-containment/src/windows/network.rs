//! Keep transport outcome separate from Windows capability diagnostics.
//! A missing capability is NOT proof that a particular packet was blocked.
//! Nothing here changes a firewall rule, exemption or process capability.
mod wfp;
mod observer;
use super::{checks::json_string, ensure, io_result, w, Result};
use std::{fs::{File, OpenOptions}, io::{self, Read, Write}, net::{SocketAddr, TcpListener, TcpStream},
    path::Path, thread, time::{Duration, Instant}};

// The Windows SDK runner does not ship FirewallAPI.lib. Resolve the documented
// export from the OS DLL; never search the workspace or PATH for a replacement.
const SYSTEM32_ONLY: u32 = 0x00000800;
#[link(name = "kernel32")]
extern "system" {
    fn LoadLibraryExW(name: *const u16, file: super::ffi::Handle, flags: u32) -> super::ffi::Handle;
    fn GetProcAddress(module: super::ffi::Handle, name: *const u8) -> *const std::ffi::c_void;
    fn FreeLibrary(module: super::ffi::Handle) -> i32;
}
struct Module(super::ffi::Handle);
impl Drop for Module { fn drop(&mut self) { unsafe { FreeLibrary(self.0); } } }

fn diagnose(server: &[u16], missing: &mut i32) -> (u32, Option<u32>) {
    let name: Vec<u16> = "Firewallapi.dll\0".encode_utf16().collect();
    // SAFETY: fixed terminated name, no file handle; SYSTEM32_ONLY excludes
    // current-directory/PATH search. The module remains live through the call.
    let handle = unsafe { LoadLibraryExW(name.as_ptr(), std::ptr::null_mut(), SYSTEM32_ONLY) };
    if handle.is_null() { return (unsafe { super::ffi::GetLastError() }, None); }
    let module = Module(handle);
    let symbol = b"NetworkIsolationDiagnoseConnectFailureAndGetInfo\0";
    let address = unsafe { GetProcAddress(module.0, symbol.as_ptr()) };
    if address.is_null() { return (unsafe { super::ffi::GetLastError() }, None); }
    type Diagnose = unsafe extern "system" fn(*const u16, *mut i32) -> u32;
    // SAFETY: exact documented Windows export/signature, x64-only module,
    // terminated server from w(), and live NETISO_ERROR_TYPE output storage.
    let function: Diagnose = unsafe { std::mem::transmute(address) };
    (0, Some(unsafe { function(server.as_ptr(), missing) }))
}

fn kind_name(kind: io::ErrorKind) -> &'static str {
    match kind {
        io::ErrorKind::TimedOut => "timed_out",
        io::ErrorKind::PermissionDenied => "permission_denied",
        io::ErrorKind::ConnectionRefused => "connection_refused",
        io::ErrorKind::WouldBlock => "would_block",
        _ => "other",
    }
}

pub(super) fn probe(port: u16, scratch_file: &Path) -> Result<u32> {
    ensure(port != 0, "network probe requires an assigned loopback port")?;
    let start = Instant::now();
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    // Preserve the original one-second test and its actual error. In particular,
    // do not translate a timeout or diagnostic API result into WSAEACCES.
    let (raw, kind) = match TcpStream::connect_timeout(&address, Duration::from_millis(1000)) {
        Ok(stream) => { drop(stream); (Some(0), "connected") }
        Err(error) => (error.raw_os_error(), kind_name(error.kind())),
    };
    let elapsed = start.elapsed().as_millis();
    let mut missing_capability = 4i32; // NETISO_ERROR_TYPE_MAX: no valid observation yet.
    let (loader_status, diagnostic_status) = if raw == Some(0) { (None, None) } else {
        let server = w("127.0.0.1")?;
        let (loader, diagnostic) = diagnose(&server, &mut missing_capability);
        (Some(loader), diagnostic)
    };
    let raw_text = raw.map_or_else(|| "null".into(), |value| value.to_string());
    let loader_text = loader_status.map_or_else(|| "null".into(), |value| value.to_string());
    let status_text = diagnostic_status.map_or_else(|| "null".into(), |value| value.to_string());
    let missing_text = if diagnostic_status == Some(0) { missing_capability.to_string() } else { "null".into() };
    let text = format!("{{\"schema\":\"talos.network-diagnostic.v1\",\"target\":\"127.0.0.1\",\"port\":{port},\"raw_os_error\":{raw_text},\"kind\":\"{kind}\",\"elapsed_ms\":{elapsed},\"diagnose_loader_status\":{loader_text},\"diagnose_status\":{status_text},\"missing_capability\":{missing_text}}}\n");
    let mut file = io_result(OpenOptions::new().write(true).create_new(true)
        .open(scratch_file.with_extension("network.json")))?;
    io_result(file.write_all(text.as_bytes()))?;
    io_result(file.sync_all())?;
    Ok(raw.map(|value| value as u32).unwrap_or(u32::MAX))
}

pub(super) fn show_diagnostic(scratch_file: &Path) -> Result<()> {
    observer::remember_fixture(scratch_file)?;
    // The sidecar is child-authored, bounded and diagnostic-only. It is never
    // used by the acceptance predicate or by peer authentication.
    let file = io_result(File::open(scratch_file.with_extension("network.json")))?;
    let mut bytes = Vec::new();
    io_result(file.take(4097).read_to_end(&mut bytes))?;
    ensure(bytes.len() <= 4096, "network diagnostic exceeds limit")?;
    let text = String::from_utf8(bytes).map_err(|_| "network diagnostic is not UTF-8".to_string())?;
    println!("{{\"diagnostic\":\"child_network_report\",\"trusted_for_verdict\":false,\"text\":{}}}", json_string(&text));
    wfp::record_existing_events(scratch_file);
    Ok(())
}

pub(super) fn observe_control_connection(listener: &TcpListener) -> Result<()> {
    io_result(listener.set_nonblocking(true))?;
    let deadline = Instant::now() + Duration::from_secs(1);
    loop {
        match listener.accept() {
            Ok((stream, address)) => {
                drop(stream); ensure(address.ip().is_loopback(), "control peer is not loopback")?;
                observer::start(listener)?; return Ok(());
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock && Instant::now() < deadline => thread::sleep(Duration::from_millis(5)),
            Err(error) => return Err(format!("control connection not independently observed: {error}")),
        }
    }
}

pub(super) fn no_extra_connection(listener: &TcpListener) -> Result<()> {
    observer::finish()?;
    wfp::record_listener_events(io_result(listener.local_addr())?.port())?;
    match listener.accept() {
        Err(error) if error.kind() == io::ErrorKind::WouldBlock => Ok(()),
        Err(error) => Err(format!("listener observation failed: {error}")),
        Ok(_) => Err("an unexpected connection reached the listener".into()),
    }
}

pub(super) fn require_explicit_denial(code: u32) -> Result<()> {
    ensure(code == 10013, &format!("loopback denial was not WSAEACCES (observed {code}); timeout/refusal is not evidence"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn timeout_and_missing_os_error_are_not_access_denial() {
        for code in [0, 5, 10060, 10061, u32::MAX] { assert!(require_explicit_denial(code).is_err()); }
        assert!(require_explicit_denial(10013).is_ok());
    }
    #[test] fn loader_does_not_search_workspace_or_environment() {
        assert_eq!(SYSTEM32_ONLY, 0x800);
        assert_eq!(SYSTEM32_ONLY & (0x100 | 0x200 | 0x400 | 0x1000), 0);
    }
    #[test] fn error_kinds_remain_distinct() {
        assert_eq!(kind_name(io::ErrorKind::TimedOut), "timed_out");
        assert_eq!(kind_name(io::ErrorKind::PermissionDenied), "permission_denied");
        assert_eq!(kind_name(io::ErrorKind::ConnectionRefused), "connection_refused");
    }
}
