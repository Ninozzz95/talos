//! Parent-side, read-only TCP ownership sampling for this laboratory only.
//! Child JSON is never used to select a port, PID, image or package identity.
use super::super::{checks::json_string, ensure, ffi::*, io_result, same_container,
    current_owner, sid_string, token, token_info, wide, Owned, Result};
use std::{cell::RefCell, ffi::c_void, mem::{size_of, offset_of}, net::TcpListener,
    path::{Path, PathBuf}, ptr::null_mut, sync::{Arc, atomic::{AtomicBool, Ordering}, mpsc},
    thread::{self, JoinHandle}, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};

const MAX_TABLE_BYTES: u32 = 1024 * 1024;
#[repr(C)]
#[derive(Clone, Copy, Debug)]
struct Row { state: u32, local_addr: u32, local_port: u32, remote_addr: u32, remote_port: u32, pid: u32 }
#[repr(C)]
struct Table { count: u32, first: Row }
#[repr(C)]
#[derive(Default)]
struct FileTime { low: u32, high: u32 }
#[link(name = "iphlpapi")]
extern "system" {
    fn GetExtendedTcpTable(table: *mut c_void, size: *mut u32, sorted: i32,
        family: u32, class: i32, reserved: u32) -> u32;
}
#[link(name = "kernel32")]
extern "system" {
    fn QueryFullProcessImageNameW(process: Handle, flags: u32, name: *mut u16, size: *mut u32) -> i32;
    fn K32GetProcessImageFileNameW(process: Handle, name: *mut u16, size: u32) -> u32;
    fn GetProcessTimes(process: Handle, created: *mut FileTime, exited: *mut FileTime,
        kernel: *mut FileTime, user: *mut FileTime) -> i32;
}
#[link(name = "userenv")]
extern "system" { fn DeriveAppContainerSidFromAppContainerName(name: *const u16, sid: *mut Sid) -> i32; }

fn now_ms() -> Result<u64> {
    let time = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?;
    u64::try_from(time.as_millis()).map_err(|e| e.to_string())
}
fn port(raw: u32) -> u16 { u16::from_be(raw as u16) }
fn loopback(raw: u32) -> bool { raw.to_ne_bytes() == [127, 0, 0, 1] }
fn image(process: Handle, native: bool) -> Result<String> {
    let mut name = [0u16; 32768]; let mut count = name.len() as u32;
    if native {
        count = unsafe { K32GetProcessImageFileNameW(process, name.as_mut_ptr(), count) };
        ensure(count > 0, "native process image unavailable")?;
    } else {
        super::super::check(unsafe { QueryFullProcessImageNameW(process, 0, name.as_mut_ptr(), &mut count) }, "TCP subject image")?;
    }
    ensure(count as usize <= name.len(), "process image exceeds buffer")?;
    String::from_utf16(&name[..count as usize]).map_err(|e| e.to_string())
}
fn normalized(path: &str) -> String { path.strip_prefix("\\\\?\\").unwrap_or(path).replace('/', "\\").to_lowercase() }
fn created_ms(process: Handle) -> Result<u64> {
    let mut c = FileTime::default(); let mut e = FileTime::default();
    let mut k = FileTime::default(); let mut u = FileTime::default();
    super::super::check(unsafe { GetProcessTimes(process, &mut c, &mut e, &mut k, &mut u) }, "TCP subject creation time")?;
    let ticks = ((c.high as u64) << 32) | c.low as u64;
    ticks.checked_sub(116444736000000000).map(|v| v / 10000).ok_or("invalid creation time".into())
}
fn rows_from_words(words: &[u32], bytes: usize) -> Result<Vec<Row>> {
    ensure(bytes <= words.len() * 4 && bytes >= offset_of!(Table, first), "TCP table size invalid")?;
    let count = words[0] as usize;
    let needed = count.checked_mul(size_of::<Row>()).and_then(|n| n.checked_add(offset_of!(Table, first))).ok_or("TCP table overflow")?;
    ensure(needed <= bytes, "truncated TCP table")?;
    // repr(C) DWORD-only rows; allocation is DWORD aligned; bounds checked above.
    let start = unsafe { words.as_ptr().cast::<u8>().add(offset_of!(Table, first)).cast::<Row>() };
    Ok(unsafe { std::slice::from_raw_parts(start, count) }.to_vec())
}
fn tcp_rows() -> Result<Vec<Row>> {
    let mut bytes = 0;
    let status = unsafe { GetExtendedTcpTable(null_mut(), &mut bytes, 0, 2, 5, 0) };
    ensure(status == 122 || status == 0, &format!("TCP size query failed: {status}"))?;
    for _ in 0..3 {
        ensure(bytes >= 4 && bytes <= MAX_TABLE_BYTES, "TCP table exceeds observation cap")?;
        let mut words = vec![0u32; (bytes as usize).div_ceil(4)];
        let status = unsafe { GetExtendedTcpTable(words.as_mut_ptr().cast(), &mut bytes, 0, 2, 5, 0) };
        if status == 122 { continue; }
        ensure(status == 0, &format!("TCP ownership query failed: {status}"))?;
        return rows_from_words(&words, bytes as usize);
    }
    Err("TCP table changed repeatedly".into())
}

struct Package(Sid);
impl Drop for Package { fn drop(&mut self) { unsafe { FreeSid(self.0); } } }
struct Sample { _process: Owned, pid: u32, source: u16, target: u16, created: u64, first: u64, last: u64, state: u32 }
struct Observer { stop: Arc<AtomicBool>, worker: Option<JoinHandle<Result<String>>> }
impl Drop for Observer {
    fn drop(&mut self) { self.stop.store(true, Ordering::Release); if let Some(worker) = self.worker.take() { let _ = worker.join(); } }
}
thread_local! {
    static ROOT: RefCell<Option<PathBuf>> = const { RefCell::new(None) };
    static OBSERVER: RefCell<Option<Observer>> = const { RefCell::new(None) };
}

pub(super) fn remember_fixture(scratch: &Path) -> Result<()> {
    let root = scratch.parent().and_then(Path::parent).ok_or("missing trusted fixture root")?.to_path_buf();
    ROOT.with(|stored| {
        let mut stored = stored.borrow_mut();
        if let Some(previous) = stored.as_ref() { ensure(previous == &root, "fixture identity changed") }
        else { *stored = Some(root); Ok(()) }
    })
}
pub(super) fn start(listener: &TcpListener) -> Result<()> {
    let address = io_result(listener.local_addr())?;
    ensure(address.ip() == std::net::Ipv4Addr::LOCALHOST, "observer requires the exact loopback listener")?;
    let port = address.port();
    let root = ROOT.with(|r| r.borrow().clone()).ok_or("fixture not registered by parent")?;
    OBSERVER.with(|slot| {
        let mut slot = slot.borrow_mut(); ensure(slot.is_none(), "observer already started")?;
        let stop = Arc::new(AtomicBool::new(false)); let signal = stop.clone();
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let worker = thread::spawn(move || collect(root, port, signal, ready_tx));
        let mut observer = Observer { stop, worker: Some(worker) };
        match ready_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => { *slot = Some(observer); Ok(()) }
            result => { observer.stop.store(true, Ordering::Release); let _ = observer.worker.take().unwrap().join(); Err(format!("observer startup failed: {result:?}")) }
        }
    })
}
pub(super) fn finish() -> Result<()> {
    OBSERVER.with(|slot| {
        let mut observer = slot.borrow_mut().take().ok_or("TCP observer never started")?;
        observer.stop.store(true, Ordering::Release);
        let text = observer.worker.take().unwrap().join().map_err(|_| "TCP observer panicked".to_string())??;
        println!("{text}"); Ok(())
    })
}

fn collect(root: PathBuf, target: u16, stop: Arc<AtomicBool>, ready: mpsc::SyncSender<Result<()>>) -> Result<String> {
    let started = now_ms()?;
    let owner = current_owner()?;
    let parent = std::process::id();
    let parent_image = image(unsafe { GetCurrentProcess() }, true)?;
    let expected_image = normalized(&io_result(std::fs::canonicalize(root.join("bin/probe.exe")))?.to_string_lossy());
    let profile = root.file_name().ok_or("profile name absent")?;
    let mut sid = null_mut();
    let hr = unsafe { DeriveAppContainerSidFromAppContainerName(wide(profile)?.as_ptr(), &mut sid) };
    ensure(hr >= 0 && !sid.is_null(), "cannot derive expected per-run package SID")?;
    let package = Package(sid); let package_text = sid_string(package.0)?;
    let initial = tcp_rows()?;
    ensure(initial.iter().filter(|r| r.pid == parent && r.state == 2 && loopback(r.local_addr) && port(r.local_port) == target).count() == 1,
        "TCP table does not independently confirm parent listener")?;
    ensure(!initial.iter().any(|r| loopback(r.remote_addr) && port(r.remote_port) == target && r.state == 3),
        "SYN already present before measured subject starts")?;
    ready.send(Ok(())).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(45);
    let mut samples: Vec<Sample> = Vec::new();
    while !stop.load(Ordering::Acquire) {
        ensure(Instant::now() < deadline, "TCP observation deadline exceeded")?;
        for row in tcp_rows()?.into_iter().filter(|r| r.state == 3 && loopback(r.local_addr) && loopback(r.remote_addr) && port(r.remote_port) == target) {
            let observed = now_ms()?;
            if let Some(sample) = samples.iter_mut().find(|s| s.pid == row.pid && s.source == port(row.local_port)) {
                if unsafe { WaitForSingleObject(sample._process.0, 0) } == 258 { sample.last = observed; }
                continue;
            }
            let process = Owned::new(unsafe { OpenProcess(0x00101000, 0, row.pid) }, "TCP subject handle")?;
            // Examine only owners of the exact synthetic loopback endpoint.
            ensure(normalized(&image(process.0, false)?) == expected_image, "unexpected image connected to synthetic listener")?;
            ensure(same_container(process.0, package.0)?, "TCP subject package does not match per-run profile")?;
            let user = token(process.0)?; let info = token_info(user.0, 1)?;
            ensure(sid_string(info[0] as Sid)? == owner, "TCP subject owner mismatch")?;
            let created = created_ms(process.0)?;
            ensure(created >= started && created <= observed, "TCP subject predates observation window")?;
            ensure(unsafe { GetProcessId(process.0) } == row.pid && unsafe { WaitForSingleObject(process.0, 0) } == 258, "TCP subject is not the retained live process")?;
            ensure(samples.len() < 8 && port(row.local_port) != 0, "too many or invalid observed endpoints")?;
            samples.push(Sample { _process: process, pid: row.pid, source: port(row.local_port), target, created, first: observed, last: observed, state: row.state });
        }
        thread::sleep(Duration::from_millis(10));
    }
    let finished = now_ms()?;
    let subjects = samples.iter().map(|s| format!("{{\"pid\":{},\"source_port\":{},\"target_port\":{},\"created_ms\":{},\"first_ms\":{},\"last_ms\":{},\"tcp_state\":{},\"image_match\":true,\"package_match\":true,\"owner_match\":true}}",
        s.pid, s.source, s.target, s.created, s.first, s.last, s.state)).collect::<Vec<_>>().join(",");
    Ok(format!("{{\"diagnostic\":\"broker_tcp_subjects\",\"schema\":\"talos.tcp-ownership.v1\",\"used_for_verdict\":false,\"address\":\"127.0.0.1\",\"listener_pid\":{parent},\"listener_port\":{target},\"listener_image_nt\":{},\"owner_sid\":{},\"package_sid\":{},\"started_ms\":{started},\"finished_ms\":{finished},\"subjects\":[{subjects}]}}",
        json_string(&parent_image), json_string(&owner), json_string(&package_text)))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn sdk_tcp_layouts_and_network_order() {
        assert_eq!(size_of::<Row>(), 24); assert_eq!(offset_of!(Table, first), 4);
        assert_eq!(port(80u16.to_be() as u32), 80); assert!(loopback(u32::from_ne_bytes([127,0,0,1])));
        assert!(!loopback(0));
    }
    #[test] fn table_bounds_are_checked_before_rows() {
        assert!(rows_from_words(&[], 0).is_err());
        assert!(rows_from_words(&[1], 4).is_err());
        assert!(rows_from_words(&[u32::MAX], 4).is_err());
        assert_eq!(rows_from_words(&[0], 4).unwrap().len(), 0);
        let row = [1, 3, 0x0100007f, 0x5000, 0x0100007f, 0x5000, 42];
        assert_eq!(rows_from_words(&row, 28).unwrap()[0].pid, 42);
    }
    #[test] fn image_normalization_preserves_the_full_identity() {
        assert_eq!(normalized("\\\\?\\C:\\Fixture\\probe.exe"), "c:\\fixture\\probe.exe");
        assert_ne!(normalized("C:\\A\\probe.exe"), normalized("C:\\B\\probe.exe"));
    }
}
