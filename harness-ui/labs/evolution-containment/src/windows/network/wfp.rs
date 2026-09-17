//! Read-only, narrowly filtered OS diagnostic for the synthetic probe only.
//! This does not enable event collection and cannot alter the PASS predicate.
use super::super::{checks::json_string, current_owner, ensure, io_result, set_acl, Result};
use std::{ffi::OsString, fs::{self, File}, io::Read,
    os::windows::{ffi::OsStringExt, process::CommandExt}, path::{Path, PathBuf},
    process::{Command, Stdio}, thread, time::{Duration, Instant}};

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

fn inspect(scratch_file: &Path) -> Result<String> {
    // The caller is the trusted lab parent and supplies its own fixture path,
    // not a field read from the child's report. No host process enumeration.
    let root = scratch_file.parent().and_then(Path::parent).ok_or("fixture root missing")?;
    let image = root.join("bin").join("probe.exe");
    ensure(image.is_file(), "synthetic probe no longer exists for WFP query")?;
    let directory = root.join("broker-diagnostics");
    match fs::create_dir(&directory) {
        Ok(()) => set_acl(&directory, &current_owner()?, &[], "", true)?,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {},
        Err(error) => return Err(error.to_string()),
    }
    // This directory has no package grant and the fixture root is not writable
    // by the child. Never store an OS report in child-writable scratch.
    let filename = scratch_file.file_stem().ok_or("fixture name missing")?;
    let mut output_name = filename.to_os_string(); output_name.push(".wfp.xml");
    let output = directory.join(output_name);
    ensure(!output.exists(), "WFP output already exists")?;
    let mut file_arg = OsString::from("file="); file_arg.push(&output);
    let mut image_arg = OsString::from("appid="); image_arg.push(&image);
    let system_root = std::env::var_os("SystemRoot").ok_or("SystemRoot unavailable")?;
    let mut command = Command::new(system_netsh()?);
    command.args(["wfp", "show", "netevents"])
        .arg(file_arg).args(["protocol=6", "localaddr=127.0.0.1", "remoteaddr=127.0.0.1"])
        .arg(image_arg).arg("timewindow=60")
        .current_dir(&directory).env_clear().env("SystemRoot", system_root)
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .creation_flags(0x08000000);
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
    io_result(io_result(File::open(&output))?.take(262145).read_to_end(&mut bytes))?;
    ensure(bytes.len() <= 262144, "WFP report exceeds diagnostic limit")?;
    decode_xml(&bytes)
}

pub(super) fn record_existing_events(scratch_file: &Path) {
    // Preserve failure as diagnostic data. No retry with broader filters,
    // collection enabling, audit-policy changes, exemptions or alternate tools.
    match inspect(scratch_file) {
        Ok(xml) => println!("{{\"diagnostic\":\"broker_wfp_existing_events\",\"used_for_verdict\":false,\"collection_modified\":false,\"xml\":{}}}", json_string(&xml)),
        Err(error) => println!("{{\"diagnostic\":\"broker_wfp_existing_events\",\"used_for_verdict\":false,\"collection_modified\":false,\"error\":{}}}", json_string(&error)),
    }
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
}
