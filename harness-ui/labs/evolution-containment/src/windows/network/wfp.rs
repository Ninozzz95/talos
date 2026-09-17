//! Read-only OS diagnostics for the synthetic image and parent-owned listener.
//! No collection enabling, firewall changes, or diagnostic-to-PASS conversion.
use super::super::{checks::json_string, current_owner, ensure, io_result, set_acl, Result};
use std::{ffi::OsString, fs::{self, File}, io::Read,
    os::windows::{ffi::OsStringExt, process::CommandExt}, path::{Path, PathBuf},
    process::{Command, Stdio}, thread, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};

#[link(name = "kernel32")]
extern "system" { fn GetSystemDirectoryW(buffer: *mut u16, size: u32) -> u32; }

fn system_netsh() -> Result<PathBuf> {
    let mut buffer = [0u16; 32768];
    let length = unsafe { GetSystemDirectoryW(buffer.as_mut_ptr(), buffer.len() as u32) };
    ensure(length > 0 && (length as usize) < buffer.len(), "System32 path unavailable")?;
    Ok(PathBuf::from(OsString::from_wide(&buffer[..length as usize])).join("netsh.exe"))
}

fn decode_xml(bytes: &[u8]) -> Result<String> {
    if let Some(body) = bytes.strip_prefix(&[0xff, 0xfe]) {
        ensure(body.len() % 2 == 0, "truncated WFP UTF-16")?;
        let words: Vec<u16> = body.chunks_exact(2).map(|b| u16::from_le_bytes([b[0], b[1]])).collect();
        return String::from_utf16(&words).map_err(|_| "WFP XML is not valid UTF-16".into());
    }
    let body = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
    String::from_utf8(body.to_vec()).map_err(|_| "WFP XML is not UTF-8 or UTF-16LE".into())
}

fn execute(directory: &Path, args: &[OsString], output: &Path, redirected: bool) -> Result<String> {
    ensure(!output.exists(), "WFP output already exists")?;
    let system_root = std::env::var_os("SystemRoot").ok_or("SystemRoot unavailable")?;
    let mut command = Command::new(system_netsh()?);
    command.args(args).current_dir(directory).env_clear().env("SystemRoot", system_root)
        .stdin(Stdio::null()).stderr(Stdio::null()).creation_flags(0x08000000);
    if redirected {
        let file = io_result(fs::OpenOptions::new().write(true).create_new(true).open(output))?;
        command.stdout(Stdio::from(file));
    } else { command.stdout(Stdio::null()); }
    // Fixed read-only OS utility, not a candidate execution/fallback path.
    // The outer runner also owns this process tree and its hard deadline.
    let mut child = io_result(command.spawn())?;
    let deadline = Instant::now() + Duration::from_secs(5);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(10)),
            result => {
                let _ = child.kill(); let _ = child.wait();
                return Err(format!("read-only WFP query did not complete: {result:?}"));
            }
        }
    };
    ensure(status.success(), &format!("read-only WFP query failed: {status}"))?;
    let mut bytes = Vec::new();
    io_result(io_result(File::open(output))?.take(262145).read_to_end(&mut bytes))?;
    ensure(bytes.len() <= 262144, "WFP report exceeds diagnostic limit")?;
    decode_xml(&bytes)
}

fn event_args(output: &Path) -> Vec<OsString> {
    let mut file_arg = OsString::from("file="); file_arg.push(output);
    let mut args: Vec<OsString> = ["wfp", "show", "netevents"].map(OsString::from).into();
    args.push(file_arg);
    args.extend(["protocol=6", "localaddr=127.0.0.1", "remoteaddr=127.0.0.1", "timewindow=60"].map(OsString::from));
    args
}

fn inspect_image(scratch_file: &Path) -> Result<String> {
    // Trusted parent-supplied fixture path, never a child report field.
    let root = scratch_file.parent().and_then(Path::parent).ok_or("fixture root missing")?;
    let image = root.join("bin").join("probe.exe");
    ensure(image.is_file(), "synthetic probe no longer exists for WFP query")?;
    let directory = root.join("broker-diagnostics");
    match fs::create_dir(&directory) {
        Ok(()) => set_acl(&directory, &current_owner()?, &[], "", true)?,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {},
        Err(error) => return Err(error.to_string()),
    }
    let mut filename = scratch_file.file_stem().ok_or("fixture name missing")?.to_os_string();
    filename.push(".wfp.xml");
    let output = directory.join(filename);
    let mut args = event_args(&output);
    let mut image_arg = OsString::from("appid="); image_arg.push(image); args.push(image_arg);
    execute(&directory, &args, &output, false)
}

fn diagnostic(kind: &str, value: Result<String>) {
    match value {
        Ok(text) => println!("{{\"diagnostic\":{},\"used_for_verdict\":false,\"collection_modified\":false,\"text\":{}}}", json_string(kind), json_string(&text)),
        Err(error) => println!("{{\"diagnostic\":{},\"used_for_verdict\":false,\"collection_modified\":false,\"error\":{}}}", json_string(kind), json_string(&error)),
    }
}

pub(super) fn record_existing_events(scratch_file: &Path) {
    diagnostic("broker_wfp_image_events", inspect_image(scratch_file));
}

struct Temporary(PathBuf);
impl Drop for Temporary { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }

pub(super) fn record_listener_events(port: u16) -> Result<()> {
    // This port comes from the parent's live TcpListener, not child-authored
    // data. The recipient may own the dropping WFP layer, so image-only
    // filtering is insufficient. These are separate, fixed endpoint queries,
    // not an automatic retry against unfiltered machine-wide network events.
    ensure(port != 0, "listener diagnostic requires an assigned port")?;
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let path = std::env::temp_dir().join(format!("TALOS.Wfp.{}.{port}.{nonce}", std::process::id()));
    io_result(fs::create_dir(&path))?;
    let directory = Temporary(path);
    set_acl(&directory.0, &current_owner()?, &[], "", true)?;
    println!("{{\"diagnostic\":\"broker_listener_binding\",\"address\":\"127.0.0.1\",\"port\":{port},\"used_for_verdict\":false}}");
    let options = directory.0.join("collection.txt");
    diagnostic("broker_wfp_collection_setting", execute(&directory.0,
        &["wfp", "show", "options", "optionsfor=NETEVENTS"].map(OsString::from), &options, true));
    for direction in ["localport", "remoteport"] {
        let output = directory.0.join(format!("{direction}.xml"));
        let mut args = event_args(&output); args.push(format!("{direction}={port}").into());
        diagnostic(&format!("broker_wfp_{direction}_events"), execute(&directory.0, &args, &output, false));
    }
    // Query unavailability is diagnostic; a leaked temporary directory is a
    // cleanup failure and must propagate to the outer collector.
    io_result(fs::remove_dir_all(&directory.0))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn native_xml_encodings_are_decoded_without_lossy_replacement() {
        assert_eq!(decode_xml(b"<root/>").unwrap(), "<root/>");
        assert_eq!(decode_xml(b"\xef\xbb\xbf<root/>").unwrap(), "<root/>");
        let mut utf16 = vec![0xff, 0xfe];
        for unit in "<r>\u{00e8}</r>".encode_utf16() { utf16.extend(unit.to_le_bytes()); }
        assert_eq!(decode_xml(&utf16).unwrap(), "<r>\u{00e8}</r>");
        assert!(decode_xml(&[0xff, 0xfe, 65]).is_err());
        assert!(decode_xml(&[0xff, 0xfe, 0, 0xd8]).is_err());
        assert!(decode_xml(&[0xff]).is_err());
    }
    #[test] fn every_event_query_is_read_only_tcp_loopback_and_time_bounded() {
        let args = event_args(Path::new("C:\\synthetic\\events.xml"));
        let strings: Vec<_> = args.iter().map(|s| s.to_str().unwrap()).collect();
        assert_eq!(&strings[..3], &["wfp", "show", "netevents"]);
        for required in ["protocol=6", "localaddr=127.0.0.1", "remoteaddr=127.0.0.1", "timewindow=60"] {
            assert!(strings.contains(&required));
        }
        assert!(!strings.iter().any(|arg| ["set", "capture", "add", "delete"].contains(arg)));
    }
}
