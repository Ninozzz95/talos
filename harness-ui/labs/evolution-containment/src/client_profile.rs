//! Opt-in native preflight for the client experiment. This is not authority.
//! An environment marker selects the experiment; OS APIs supply all facts.
use std::{ffi::c_void, mem::{size_of, zeroed}, ptr::{null_mut, read_unaligned}};

type Handle = *mut c_void;
type Result<T> = std::result::Result<T, String>;
const AMD64: u16 = 0x8664;
const ARM64: u16 = 0xaa64;
const CLIENT_SELECTION: &str = "TALOS_LAB_CLIENT_PROFILE";

#[repr(C)]
struct Version {
    size: u32, major: u32, minor: u32, build: u32, platform: u32,
    service_pack: [u16; 128], sp_major: u16, sp_minor: u16, suite: u16,
    product_type: u8, reserved: u8,
}
#[repr(C)]
struct SidAttributes { sid: *mut c_void, attributes: u32 }
#[repr(C)]
struct MachineInformation { machine: u16, reserved: u16, attributes: u32 }
#[link(name = "ntdll")]
extern "system" { fn RtlGetVersion(version: *mut Version) -> i32; }
#[link(name = "kernel32")]
extern "system" {
    fn GetCurrentProcess() -> Handle;
    fn GetLastError() -> u32;
    fn CloseHandle(handle: Handle) -> i32;
    fn LocalFree(memory: *mut c_void) -> *mut c_void;
    fn IsWow64Process2(process: Handle, process_machine: *mut u16, native_machine: *mut u16) -> i32;
    fn GetProcessInformation(process: Handle, class: i32, information: *mut c_void, size: u32) -> i32;
}
#[link(name = "advapi32")]
extern "system" {
    fn OpenProcessToken(process: Handle, access: u32, token: *mut Handle) -> i32;
    fn GetTokenInformation(token: Handle, class: i32, data: *mut c_void, size: u32, returned: *mut u32) -> i32;
    fn ConvertStringSidToSidW(text: *const u16, sid: *mut *mut c_void) -> i32;
    fn EqualSid(first: *const c_void, second: *const c_void) -> i32;
    fn GetSidSubAuthorityCount(sid: *const c_void) -> *mut u8;
    fn GetSidSubAuthority(sid: *const c_void, index: u32) -> *mut u32;
    fn IsValidSid(sid: *const c_void) -> i32;
}
struct Token(Handle);
impl Drop for Token { fn drop(&mut self) { unsafe { CloseHandle(self.0); } } }
struct Sid(*mut c_void);
impl Drop for Sid { fn drop(&mut self) { unsafe { LocalFree(self.0); } } }
fn checked(ok: i32, context: &str) -> Result<()> {
    if ok != 0 { Ok(()) } else { Err(format!("{context}: Win32 {}", unsafe { GetLastError() })) }
}
fn information(token: Handle, class: i32) -> Result<(Vec<usize>, usize)> {
    let mut needed = 0;
    unsafe { GetTokenInformation(token, class, null_mut(), 0, &mut needed); }
    if needed == 0 || needed > 65536 { return Err("invalid token information size".into()); }
    let capacity = needed;
    let mut words = vec![0usize; (needed as usize).div_ceil(size_of::<usize>())];
    unsafe { checked(GetTokenInformation(token, class, words.as_mut_ptr().cast(), capacity, &mut needed), "token read")?; }
    if needed == 0 || needed > capacity { return Err("token information changed size".into()); }
    Ok((words, needed as usize))
}
fn scalar(token: Handle, class: i32) -> Result<u32> {
    let (data, bytes) = information(token, class)?;
    if bytes < 4 { return Err("short token scalar".into()); }
    // SAFETY: token buffer is OS-produced, aligned and contains at least a DWORD.
    Ok(unsafe { *data.as_ptr().cast::<u32>() })
}
fn administrators_present(token: Handle) -> Result<bool> {
    let mut pointer = null_mut();
    let text: Vec<u16> = "S-1-5-32-544\0".encode_utf16().collect();
    unsafe { checked(ConvertStringSidToSidW(text.as_ptr(), &mut pointer), "Administrators SID")?; }
    let admin = Sid(pointer);
    let (data, bytes) = information(token, 2)?; // TokenGroups
    if bytes < 8 { return Err("short token groups".into()); }
    let count = unsafe { *data.as_ptr().cast::<u32>() } as usize;
    let stride = size_of::<SidAttributes>();
    if count > (bytes - 8) / stride { return Err("token groups exceed buffer".into()); }
    for index in 0..count {
        // x64 TOKEN_GROUPS: DWORD count, padding, SID_AND_ATTRIBUTES array.
        // The buffer stays live for every OS-owned SID comparison.
        let group = unsafe { &*data.as_ptr().cast::<u8>().add(8 + index * stride).cast::<SidAttributes>() };
        if unsafe { EqualSid(group.sid, admin.0) } != 0 { return Ok(true); }
    }
    Ok(false) // Deny-only membership is deliberately not accepted either.
}
fn integrity_rid(token: Handle) -> Result<u32> {
    let (data, bytes) = information(token, 25)?; // TokenIntegrityLevel
    if bytes < size_of::<SidAttributes>() { return Err("short integrity information".into()); }
    let sid = unsafe { *data.as_ptr().cast::<*mut c_void>() };
    if sid.is_null() || unsafe { IsValidSid(sid) } == 0 { return Err("invalid integrity SID".into()); }
    let count = unsafe { *GetSidSubAuthorityCount(sid) };
    if count == 0 { return Err("empty integrity SID".into()); }
    Ok(unsafe { read_unaligned(GetSidSubAuthority(sid, u32::from(count - 1))) })
}

#[derive(Clone, Copy, Debug)]
struct Profile {
    major: u32, minor: u32, build: u32, product_type: u8,
    process_machine: u16, native_machine: u16, machine_type: u16,
    elevated: bool, elevation_type: u32, integrity: u32,
    administrators_present: bool, appcontainer: bool, restricted_sids: u32,
}
impl Profile {
    fn scope(&self) -> Option<&'static str> {
        if self.major != 10 || self.minor != 0 || self.product_type != 1 || self.build < 19041 { return None; }
        // IsWow64Process2 can report UNKNOWN for x64 emulation on ARM64.
        // Keep its raw result; use the independent process-machine query.
        if self.machine_type != AMD64 || ![0, AMD64].contains(&self.process_machine) { return None; }
        match (self.build >= 22000, self.native_machine) {
            (true, AMD64) => Some("windows11-x64-native"),
            (false, AMD64) => Some("windows10-x64-native"),
            (true, ARM64) => Some("windows11-arm64-x64-emulated"),
            _ => None,
        }
    }
    fn standard_user(&self) -> bool {
        !self.elevated && self.elevation_type == 1 && self.integrity == 8192
            && !self.administrators_present && !self.appcontainer && self.restricted_sids == 0
    }
    fn accepted(&self) -> bool { self.scope().is_some() && self.standard_user() }
    fn emit(&self) {
        println!("{{\"schema\":\"talos.client-host-profile.v1\",\"os_major\":{},\"os_minor\":{},\"build\":{},\"product_type\":{},\"process_machine\":{},\"native_machine\":{},\"machine_type\":{},\"elevated\":{},\"elevation_type\":{},\"integrity_rid\":{},\"administrators_sid_present\":{},\"appcontainer\":{},\"restricted_sid_count\":{},\"scope\":\"{}\",\"standard_user\":{},\"accepted\":{},\"full_containment_verified\":false}}",
            self.major, self.minor, self.build, self.product_type, self.process_machine,
            self.native_machine, self.machine_type, self.elevated, self.elevation_type, self.integrity,
            self.administrators_present, self.appcontainer, self.restricted_sids,
            self.scope().unwrap_or("unsupported"), self.standard_user(), self.accepted());
    }
}
fn observe() -> Result<Profile> {
    let mut version: Version = unsafe { zeroed() };
    version.size = size_of::<Version>() as u32;
    let status = unsafe { RtlGetVersion(&mut version) };
    if status != 0 { return Err(format!("RtlGetVersion: NTSTATUS {status:#x}")); }
    let mut raw = null_mut();
    unsafe { checked(OpenProcessToken(GetCurrentProcess(), 8, &mut raw), "profile token")?; }
    let token = Token(raw);
    let mut process_machine = 0;
    let mut native_machine = 0;
    unsafe { checked(IsWow64Process2(GetCurrentProcess(), &mut process_machine, &mut native_machine), "architecture")?; }
    // ProcessMachineTypeInfo is documented starting at build 22000. On older
    // native x64 Windows use the original WOW64 mapping; ARM64 client <22000
    // is not an accepted scope. Failure of the new API is never a fallback.
    let machine_type = if version.build >= 22000 {
        let mut machine: MachineInformation = unsafe { zeroed() };
        unsafe { checked(GetProcessInformation(GetCurrentProcess(), 9,
            (&mut machine as *mut MachineInformation).cast(), size_of::<MachineInformation>() as u32),
            "GetProcessInformation(ProcessMachineTypeInfo)")?; }
        machine.machine
    } else if process_machine == 0 { native_machine } else { process_machine };
    Ok(Profile {
        major: version.major, minor: version.minor, build: version.build, product_type: version.product_type,
        process_machine, native_machine, machine_type, elevated: scalar(token.0, 20)? != 0,
        elevation_type: scalar(token.0, 18)?, integrity: integrity_rid(token.0)?,
        administrators_present: administrators_present(token.0)?, appcontainer: scalar(token.0, 29)? != 0,
        restricted_sids: scalar(token.0, 11)?,
    })
}

pub(crate) fn before_run() -> Result<()> {
    let Some(selection) = std::env::var_os(CLIENT_SELECTION) else { return Ok(()); };
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if selection != "1" || args.len() != 1 || args[0] != "--run-synthetic-probes" {
        return Err("CLIENT_PREFLIGHT: invalid opt-in selection or arguments".into());
    }
    let profile = observe().map_err(|error| format!("CLIENT_PREFLIGHT: {error}"))?;
    profile.emit();
    if !profile.accepted() { return Err("CLIENT_PREFLIGHT: standard user on a supported Windows client required".into()); }
    // Nothing is launched, no ACL/profile is changed before this predicate.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn good() -> Profile { Profile { major: 10, minor: 0, build: 22631, product_type: 1,
        process_machine: 0, native_machine: AMD64, machine_type: AMD64, elevated: false, elevation_type: 1,
        integrity: 8192, administrators_present: false, appcontainer: false, restricted_sids: 0 } }
    #[test] fn native_layouts_match_sdk() {
        assert_eq!(size_of::<Version>(), 284); assert_eq!(size_of::<SidAttributes>(), 16);
        assert_eq!(size_of::<MachineInformation>(), 8);
    }
    #[test] fn supported_client_scopes_are_not_interchangeable() {
        let mut p = good(); assert_eq!(p.scope(), Some("windows11-x64-native"));
        p.build = 19045; assert_eq!(p.scope(), Some("windows10-x64-native"));
        p.build = 26100; p.process_machine = AMD64; p.native_machine = ARM64;
        assert_eq!(p.scope(), Some("windows11-arm64-x64-emulated")); assert!(p.accepted());
    }
    #[test] fn server_domain_controller_and_unknown_os_are_rejected() {
        for product_type in [0, 2, 3, 255] { let mut p=good(); p.product_type=product_type; assert!(!p.accepted()); }
        for build in [0, 19040] { let mut p=good(); p.build=build; assert!(!p.accepted()); }
        let mut p=good(); p.major=11; assert!(!p.accepted());
    }
    #[test] fn unsupported_process_architectures_are_rejected() {
        for machine in [0x014c, ARM64, 0xffff] { let mut p=good(); p.process_machine=machine; assert!(!p.accepted()); }
        let mut p=good(); p.native_machine=ARM64; p.machine_type=ARM64; assert!(!p.accepted());
    }
    #[test] fn wow64_unknown_does_not_mean_native_arm64_execution() {
        let mut p=good(); p.process_machine=0; p.native_machine=ARM64; p.machine_type=AMD64;
        assert_eq!(p.scope(), Some("windows11-arm64-x64-emulated"));
        p.machine_type=ARM64; assert_eq!(p.scope(), None);
        p.machine_type=0; assert_eq!(p.scope(), None);
    }
    #[test] fn every_privilege_factor_is_required() {
        for mask in 0..64 {
            let mut p=good(); p.elevated=mask & 1 != 0; p.elevation_type=if mask & 2 != 0 {3} else {1};
            p.integrity=if mask & 4 != 0 {12288} else {8192}; p.administrators_present=mask & 8 != 0;
            p.appcontainer=mask & 16 != 0; p.restricted_sids=u32::from(mask & 32 != 0);
            assert_eq!(p.accepted(),mask==0);
        }
    }
    #[test] fn filtered_admin_and_low_integrity_are_not_standard_user() {
        for kind in [0, 2, 3, 99] { let mut p=good(); p.elevation_type=kind; assert!(!p.accepted()); }
        for rid in [0, 4096, 8448, 12288, 16384] { let mut p=good(); p.integrity=rid; assert!(!p.accepted()); }
    }
    #[test] fn live_host_is_observed_not_assumed_from_runner_name() {
        let p=observe().unwrap(); assert!(p.build>0); assert!(p.native_machine != 0); assert_eq!(p.machine_type, AMD64);
    }
}
