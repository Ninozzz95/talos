//! Read back security on synthetic fixtures before interpreting an access denial.
//! No host files, environment values, or credentials are inspected here.
use super::{check, current_owner, ensure, ffi::*, io_result, is_container, sid_string,
    token, token_info, wide, Fixture, Local, Result, CONTENT};
use std::{ffi::c_void, fs::{self, OpenOptions}, io::Write, path::Path, ptr::null_mut};

const OWNER_DACL_LABEL: u32 = 1 | 4 | 0x10;
#[link(name = "advapi32")]
extern "system" {
    fn GetNamedSecurityInfoW(name: *const u16, kind: i32, information: u32,
        owner: *mut *mut c_void, group: *mut *mut c_void, dacl: *mut *mut c_void,
        sacl: *mut *mut c_void, descriptor: *mut *mut c_void) -> u32;
    fn ConvertSecurityDescriptorToStringSecurityDescriptorW(descriptor: *const c_void,
        revision: u32, information: u32, text: *mut *mut u16, length: *mut u32) -> i32;
}

fn sddl(descriptor: *const c_void, information: u32) -> Result<String> {
    let mut raw = null_mut();
    let mut length = 0;
    unsafe { check(ConvertSecurityDescriptorToStringSecurityDescriptorW(
        descriptor, 1, information, &mut raw, &mut length), "serialize fixture security")?; }
    let _memory = Local(raw.cast());
    ensure(!raw.is_null() && length > 0 && length <= 65536, "security string size invalid")?;
    let text = unsafe { std::slice::from_raw_parts(raw, length as usize) };
    let end = text.iter().position(|ch| *ch == 0).ok_or("security string not terminated")?;
    String::from_utf16(&text[..end]).map_err(|e| e.to_string())
}

fn file_sddl(path: &Path) -> Result<String> {
    let mut raw = null_mut();
    let result = unsafe { GetNamedSecurityInfoW(wide(path.as_os_str())?.as_ptr(),
        1, OWNER_DACL_LABEL, null_mut(), null_mut(), null_mut(), null_mut(), &mut raw) };
    ensure(result == 0, &format!("read fixture security: Win32 {result}"))?;
    let memory = Local(raw);
    sddl(memory.0, OWNER_DACL_LABEL)
}

fn fixture_label(path: &Path) -> &'static str {
    if path.extension().is_some_and(|ext| ext == "exe") {
        "S:(ML;;NW;;;ME)"
    } else {
        "S:(ML;OICI;NW;;;LW)"
    }
}

fn apply_security_parts(mut set: impl FnMut(u32) -> Result<()>) -> Result<()> {
    set(4)?; // DACL_SECURITY_INFORMATION: WRITE_DAC / object ownership.
    set(0x10) // LABEL_SECURITY_INFORMATION: WRITE_OWNER under the final DACL.
}

pub(super) fn apply(path: &Path, descriptor: &Local) -> Result<()> {
    // An executable labelled Low silently lowers even the non-AppContainer
    // control's process token (MIC process-creation rule). Code is immutable
    // input, not writable scratch: keep it Medium, with exactly the same DACL.
    let policy = format!("{}{}", sddl(descriptor.0, 4)?, fixture_label(path));
    let effective = super::descriptor(&policy)?;
    // A newly created fixture may inherit Modify but not WRITE_OWNER. The
    // owner can set its DACL, while setting the label requires WRITE_OWNER.
    // Apply the SAME requested DACL first, then the SAME mandatory label.
    // Both steps must succeed before any candidate process can be launched.
    let native_path = wide(path.as_os_str())?;
    apply_security_parts(|part| unsafe {
        check(SetFileSecurityW(native_path.as_ptr(), part, effective.0),
            if part == 4 { "set fixture DACL" } else { "set fixture integrity label" })
    })?;
    let owner = current_owner()?;
    let expected = sddl(effective.0, 4 | 0x10)?.replace(&owner, "<OWNER>");
    let actual = file_sddl(path)?.replace(&owner, "<OWNER>");
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    println!("{{\"diagnostic\":\"fixture_security\",\"object\":{name:?},\"requested\":{expected:?},\"actual\":{actual:?}}}");
    Ok(())
}

pub(super) fn describe_process(process: Handle, role: &str) -> Result<()> {
    let token = token(process)?;
    let user = token_info(token.0, 1)?; // TOKEN_USER
    let integrity = token_info(token.0, 25)?; // TOKEN_MANDATORY_LABEL
    let elevation = token_info(token.0, 20)?;
    let restricted = token_info(token.0, 11)?; // TOKEN_GROUPS (TokenRestrictedSids)
    let restricted_count = unsafe { *restricted.as_ptr().cast::<u32>() };
    let user_attributes = unsafe { *user.as_ptr().cast::<u8>().add(std::mem::size_of::<usize>()).cast::<u32>() };
    let user_matches_owner = sid_string(user[0] as Sid)? == current_owner()?;
    let integrity_sid = sid_string(integrity[0] as Sid)?;
    let elevated = unsafe { *elevation.as_ptr().cast::<u32>() } != 0;
    let container = is_container(process)?;
    println!("{{\"diagnostic\":\"process_token\",\"role\":{role:?},\"user_matches_owner\":{user_matches_owner},\"integrity_sid\":{integrity_sid:?},\"elevated\":{elevated},\"appcontainer\":{container},\"user_attributes\":{user_attributes},\"restricted_sid_count\":{restricted_count}}}");
    Ok(())
}

pub(super) fn parent_control(fixture: &Fixture) -> Result<()> {
    describe_process(unsafe { GetCurrentProcess() }, "parent")?;
    let path = fixture.scratch.join("parent-control.txt");
    let mut file = OpenOptions::new().write(true).create_new(true).open(&path)
        .map_err(|e| format!("parent scratch control: {e}"))?;
    io_result(file.write_all(CONTENT))?;
    io_result(file.sync_all())?;
    drop(file);
    ensure(io_result(fs::read(&path))? == CONTENT, "parent scratch bytes differ")?;
    io_result(fs::remove_file(path))?;
    super::pass("parent_scratch_positive_control");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fixture_security_applies_dacl_before_the_required_label() {
        let mut parts = Vec::new();
        assert_eq!(apply_security_parts(|part| { parts.push(part); Ok(()) }), Ok(()));
        assert_eq!(parts, [4, 0x10]);
    }
    #[test]
    fn failed_dacl_prevents_the_label_step() {
        let mut parts = Vec::new();
        let result = apply_security_parts(|part| { parts.push(part); Err("dacl denied".into()) });
        assert_eq!(result, Err("dacl denied".into())); assert_eq!(parts, [4]);
    }
    #[test]
    fn failed_label_never_authorizes_fixture_use() {
        let mut parts = Vec::new();
        let result = apply_security_parts(|part| {
            parts.push(part); if part == 0x10 { Err("label denied".into()) } else { Ok(()) }
        });
        assert_eq!(result, Err("label denied".into())); assert_eq!(parts, [4, 0x10]);
    }
    #[test]
    fn executable_and_scratch_have_distinct_integrity_roles() {
        assert_eq!(fixture_label(Path::new("bin/probe.exe")), "S:(ML;;NW;;;ME)");
        assert_eq!(fixture_label(Path::new("scratch")), "S:(ML;OICI;NW;;;LW)");
    }
}

#[link(name = "advapi32")]
extern "system" {
    fn GetSecurityInfo(handle: Handle, kind: i32, information: u32,
        owner: *mut *mut c_void, group: *mut *mut c_void, dacl: *mut *mut c_void,
        sacl: *mut *mut c_void, descriptor: *mut *mut c_void) -> u32;
}

pub(super) fn create_report_pipe(name: &str, owner: &str, package: &str)
    -> Result<(super::Owned, std::ffi::OsString)> {
    let access = PIPE_CLIENT_GRANT;
    let requested = super::descriptor(&format!(
        "D:P(A;;FA;;;SY)(A;;FA;;;{owner})(A;;0x{access:08x};;;{package})S:(ML;;NW;;;LW)"))?;
    let attrs = SecurityAttributes { length: std::mem::size_of::<SecurityAttributes>() as u32,
        descriptor: requested.0, inherit: 0 };
    // LOCAL was measured separately and resolves to a different package namespace
    // for this unpackaged broker. Use the original broker name, not a fallback.
    let name = std::ffi::OsString::from(format!("\\\\.\\pipe\\{name}"));
    let handle = super::Owned::new(unsafe { CreateNamedPipeW(wide(&name)?.as_ptr(),
        1 | 0x40000000 | 0x00080000, 8, 1, 4096, 4096, super::DEADLINE_MS, &attrs) }, "CreateNamedPipe")?;
    let mut raw = null_mut();
    let error = unsafe { GetSecurityInfo(handle.0, 1, OWNER_DACL_LABEL,
        null_mut(), null_mut(), null_mut(), null_mut(), &mut raw) };
    ensure(error == 0, &format!("read actual pipe security: Win32 {error}"))?;
    let actual = Local(raw);
    let expected = sddl(requested.0, 4 | 0x10)?.replace(owner, "<OWNER>");
    let observed = sddl(actual.0, OWNER_DACL_LABEL)?.replace(owner, "<OWNER>");
    println!("{{\"diagnostic\":\"pipe_security\",\"requested\":{expected:?},\"actual\":{observed:?},\"client_access\":{access}}}");
    Ok((handle, name))
}

// CreateFile's file-object open may request FILE_READ_ATTRIBUTES in addition
// to the explicit mask. Grant only that read-only bit to the exact package SID.
const PIPE_CLIENT_GRANT: u32 = super::PIPE_CLIENT_ACCESS | 0x80;

#[link(name = "ntdll")]
extern "system" {
    fn NtQueryObject(handle: Handle, class: i32, information: *mut c_void,
        length: u32, returned: *mut u32) -> i32;
}

pub(super) fn open_report_pipe(name: &std::ffi::OsStr) -> std::io::Result<fs::File> {
    use std::os::windows::{fs::OpenOptionsExt, io::AsRawHandle};
    let file = OpenOptions::new().access_mode(super::PIPE_CLIENT_ACCESS).open(name)?;
    // PUBLIC_OBJECT_BASIC_INFORMATION: Attributes, GrantedAccess, handle/pointer
    // counts and ten reserved ULONGs. Observation only; not a production ABI.
    let mut basic = [0u32; 14];
    let mut returned = 0;
    let status = unsafe { NtQueryObject(file.as_raw_handle(), 0, basic.as_mut_ptr().cast(),
        std::mem::size_of_val(&basic) as u32, &mut returned) };
    if status < 0 || returned as usize > std::mem::size_of_val(&basic) {
        return Err(std::io::Error::other(format!("pipe access observation failed: NTSTATUS {status:#x}")));
    }
    // Prove the implicit bit rather than silently assuming a broader grant is
    // needed. The caller still requests only WRITE_DATA | SYNCHRONIZE.
    if basic[1] != PIPE_CLIENT_GRANT {
        return Err(std::io::Error::other(format!("unexpected granted pipe access: {:#x}", basic[1])));
    }
    Ok(file)
}

#[cfg(test)]
mod pipe_tests {
    use super::*;
    #[test]
    fn pipe_grant_adds_only_read_attributes_not_server_or_security_rights() {
        assert_eq!(PIPE_CLIENT_GRANT ^ super::super::PIPE_CLIENT_ACCESS, 0x80);
        assert_eq!(PIPE_CLIENT_GRANT & (0x4 | 0x10000 | 0x40000 | 0x80000), 0);
        assert_eq!(PIPE_CLIENT_GRANT, 0x00100082);
    }
}
