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

pub(super) fn apply(path: &Path, descriptor: &Local) -> Result<()> {
    // An executable labelled Low silently lowers even the non-AppContainer
    // control's process token (MIC process-creation rule). Code is immutable
    // input, not writable scratch: keep it Medium, with exactly the same DACL.
    let policy = format!("{}{}", sddl(descriptor.0, 4)?, fixture_label(path));
    let effective = super::descriptor(&policy)?;
    unsafe { check(SetFileSecurityW(wide(path.as_os_str())?.as_ptr(), 4 | 0x10,
        effective.0), "set fixture ACL")?; }
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
    fn executable_and_scratch_have_distinct_integrity_roles() {
        assert_eq!(fixture_label(Path::new("bin/probe.exe")), "S:(ML;;NW;;;ME)");
        assert_eq!(fixture_label(Path::new("scratch")), "S:(ML;OICI;NW;;;LW)");
    }
}
