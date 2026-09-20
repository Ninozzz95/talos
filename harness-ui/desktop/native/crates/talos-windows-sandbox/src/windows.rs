#![allow(non_snake_case, dead_code)]

use std::{
    ffi::{OsStr, OsString, c_void},
    io,
    mem::{size_of, size_of_val},
    os::windows::ffi::OsStrExt,
    path::Path,
    ptr::{null, null_mut},
    time::Duration,
};

type Handle = *mut c_void;

const JOB_OBJECT_LIMIT_ACTIVE_PROCESS: u32 = 0x0000_0008;
const JOB_OBJECT_LIMIT_BREAKAWAY_OK: u32 = 0x0000_0800;
const JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK: u32 = 0x0000_1000;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;
const BASE_LIMIT_FLAGS: u32 = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

const JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION: i32 = 1;
const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: i32 = 9;
const PROC_THREAD_ATTRIBUTE_JOB_LIST: usize = 0x0002_000d;

const CREATE_SUSPENDED: u32 = 0x0000_0004;
const CREATE_UNICODE_ENVIRONMENT: u32 = 0x0000_0400;
const EXTENDED_STARTUPINFO_PRESENT: u32 = 0x0008_0000;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const SYNCHRONIZE: u32 = 0x0010_0000;
const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x0000_1000;

const WAIT_OBJECT_0: u32 = 0;
const WAIT_TIMEOUT: u32 = 258;
const WAIT_FAILED: u32 = u32::MAX;
const STILL_ACTIVE: u32 = 259;

#[repr(C)]
#[derive(Default)]
struct StartupInfoW {
    cb: u32,
    reserved: *mut u16,
    desktop: *mut u16,
    title: *mut u16,
    x: u32,
    y: u32,
    x_size: u32,
    y_size: u32,
    x_chars: u32,
    y_chars: u32,
    fill: u32,
    flags: u32,
    show_window: u16,
    reserved2_size: u16,
    reserved2: *mut u8,
    stdin: Handle,
    stdout: Handle,
    stderr: Handle,
}

#[repr(C)]
#[derive(Default)]
struct StartupInfoExW {
    startup: StartupInfoW,
    attribute_list: *mut c_void,
}

#[repr(C)]
#[derive(Default)]
struct ProcessInformation {
    process: Handle,
    thread: Handle,
    process_id: u32,
    thread_id: u32,
}

#[repr(C)]
#[derive(Default)]
struct JobObjectBasicLimitInformation {
    per_process_user_time_limit: i64,
    per_job_user_time_limit: i64,
    limit_flags: u32,
    minimum_working_set_size: usize,
    maximum_working_set_size: usize,
    active_process_limit: u32,
    affinity: usize,
    priority_class: u32,
    scheduling_class: u32,
}

#[repr(C)]
#[derive(Default)]
struct IoCounters {
    read_operation_count: u64,
    write_operation_count: u64,
    other_operation_count: u64,
    read_transfer_count: u64,
    write_transfer_count: u64,
    other_transfer_count: u64,
}

#[repr(C)]
#[derive(Default)]
struct JobObjectExtendedLimitInformation {
    basic_limit_information: JobObjectBasicLimitInformation,
    io_info: IoCounters,
    process_memory_limit: usize,
    job_memory_limit: usize,
    peak_process_memory_used: usize,
    peak_job_memory_used: usize,
}

#[repr(C)]
#[derive(Default)]
struct JobObjectBasicAccountingInformation {
    total_user_time: i64,
    total_kernel_time: i64,
    this_period_total_user_time: i64,
    this_period_total_kernel_time: i64,
    total_page_fault_count: u32,
    total_processes: u32,
    active_processes: u32,
    total_terminated_processes: u32,
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetLastError() -> u32;
    fn CloseHandle(handle: Handle) -> i32;
    fn CreateJobObjectW(attributes: *const c_void, name: *const u16) -> Handle;
    fn SetInformationJobObject(job: Handle, class: i32, data: *const c_void, length: u32) -> i32;
    fn QueryInformationJobObject(
        job: Handle,
        class: i32,
        data: *mut c_void,
        length: u32,
        returned: *mut u32,
    ) -> i32;
    fn IsProcessInJob(process: Handle, job: Handle, result: *mut i32) -> i32;
    fn InitializeProcThreadAttributeList(
        list: *mut c_void,
        count: u32,
        flags: u32,
        size: *mut usize,
    ) -> i32;
    fn UpdateProcThreadAttribute(
        list: *mut c_void,
        flags: u32,
        attribute: usize,
        value: *mut c_void,
        size: usize,
        previous: *mut c_void,
        returned: *mut usize,
    ) -> i32;
    fn DeleteProcThreadAttributeList(list: *mut c_void);
    fn CreateProcessW(
        application: *const u16,
        command_line: *mut u16,
        process_attributes: *const c_void,
        thread_attributes: *const c_void,
        inherit_handles: i32,
        creation_flags: u32,
        environment: *const c_void,
        current_directory: *const u16,
        startup_info: *const StartupInfoW,
        process_information: *mut ProcessInformation,
    ) -> i32;
    fn ResumeThread(thread: Handle) -> u32;
    fn TerminateProcess(process: Handle, exit_code: u32) -> i32;
    fn TerminateJobObject(job: Handle, exit_code: u32) -> i32;
    fn WaitForSingleObject(handle: Handle, milliseconds: u32) -> u32;
    fn GetExitCodeProcess(process: Handle, exit_code: *mut u32) -> i32;
    fn OpenProcess(access: u32, inherit_handle: i32, process_id: u32) -> Handle;
}

fn invalid_input(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message.into())
}

fn invariant(message: impl Into<String>) -> io::Error {
    io::Error::other(message.into())
}

fn win32_error(operation: &str) -> io::Error {
    // SAFETY: GetLastError has no pointer arguments and only reads thread-local Win32 state.
    let code = unsafe { GetLastError() };
    io::Error::other(format!("{operation}: Win32 {code}"))
}

fn check_bool(value: i32, operation: &str) -> io::Result<()> {
    if value == 0 {
        Err(win32_error(operation))
    } else {
        Ok(())
    }
}

#[derive(Debug)]
struct OwnedHandle(Handle);

impl OwnedHandle {
    fn new(handle: Handle, operation: &str) -> io::Result<Self> {
        if handle.is_null() {
            Err(win32_error(operation))
        } else {
            Ok(Self(handle))
        }
    }

    fn raw(&self) -> Handle {
        self.0
    }
}

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        // SAFETY: OwnedHandle is constructed only from a live owned Win32 handle
        // and never cloned, so this is the unique close of that handle.
        let _ = unsafe { CloseHandle(self.0) };
    }
}

struct AttributeList {
    storage: Vec<usize>,
    initialized: bool,
}

impl AttributeList {
    fn new(count: u32) -> io::Result<Self> {
        let mut bytes = 0usize;
        // SAFETY: the documented sizing call requires a null buffer and writes
        // only the required byte count into bytes.
        let _ = unsafe { InitializeProcThreadAttributeList(null_mut(), count, 0, &mut bytes) };
        if bytes == 0 {
            return Err(win32_error("InitializeProcThreadAttributeList(size)"));
        }

        let words = bytes.div_ceil(size_of::<usize>());
        let mut value = Self {
            storage: vec![0usize; words],
            initialized: false,
        };
        // SAFETY: storage is writable, pointer-aligned memory of at least bytes
        // bytes and remains alive until DeleteProcThreadAttributeList in Drop.
        let initialized =
            unsafe { InitializeProcThreadAttributeList(value.ptr(), count, 0, &mut bytes) };
        check_bool(initialized, "InitializeProcThreadAttributeList")?;
        value.initialized = true;
        Ok(value)
    }

    fn ptr(&mut self) -> *mut c_void {
        self.storage.as_mut_ptr().cast()
    }

    fn set_job_list(&mut self, jobs: &mut [Handle]) -> io::Result<()> {
        if jobs.is_empty() {
            return Err(invalid_input("job list cannot be empty"));
        }
        // SAFETY: the attribute list is initialized, jobs remains live through
        // CreateProcessW, and the byte count matches the HANDLE slice.
        let updated = unsafe {
            UpdateProcThreadAttribute(
                self.ptr(),
                0,
                PROC_THREAD_ATTRIBUTE_JOB_LIST,
                jobs.as_mut_ptr().cast(),
                size_of_val(jobs),
                null_mut(),
                null_mut(),
            )
        };
        check_bool(updated, "UpdateProcThreadAttribute(JOB_LIST)")
    }
}

impl Drop for AttributeList {
    fn drop(&mut self) {
        if self.initialized {
            // SAFETY: ptr refers to the initialized attribute list owned by self
            // and the API requires exactly one matching deletion.
            unsafe { DeleteProcThreadAttributeList(self.ptr()) };
        }
    }
}

fn wide_z(value: &OsStr) -> io::Result<Vec<u16>> {
    let mut encoded: Vec<u16> = value.encode_wide().collect();
    if encoded.contains(&0) {
        return Err(invalid_input("Windows string contains NUL"));
    }
    encoded.push(0);
    Ok(encoded)
}

fn quote_argument(value: &OsStr) -> io::Result<Vec<u16>> {
    let encoded: Vec<u16> = value.encode_wide().collect();
    if encoded.contains(&0) {
        return Err(invalid_input("Windows argument contains NUL"));
    }

    let mut output = vec![34u16];
    let mut slashes = 0usize;
    for character in encoded {
        if character == 92 {
            slashes += 1;
            continue;
        }
        let emitted = if character == 34 {
            slashes * 2 + 1
        } else {
            slashes
        };
        output.extend(std::iter::repeat_n(92u16, emitted));
        output.push(character);
        slashes = 0;
    }
    output.extend(std::iter::repeat_n(92u16, slashes * 2));
    output.push(34);
    Ok(output)
}

fn command_line(executable: &Path, args: &[OsString]) -> io::Result<Vec<u16>> {
    let mut output = quote_argument(executable.as_os_str())?;
    for argument in args {
        output.push(32);
        output.extend(quote_argument(argument.as_os_str())?);
    }
    output.push(0);
    Ok(output)
}

fn environment_block(environment: &[(OsString, OsString)]) -> io::Result<Vec<u16>> {
    if environment.is_empty() {
        return Ok(vec![0, 0]);
    }

    let mut entries = environment.to_vec();
    entries.sort_by_key(|(key, _)| key.to_string_lossy().to_ascii_uppercase());

    for (index, (key, value)) in entries.iter().enumerate() {
        let key_wide: Vec<u16> = key.encode_wide().collect();
        if key_wide.is_empty() || key_wide.contains(&0) || key_wide.contains(&61) {
            return Err(invalid_input("invalid Windows environment key"));
        }
        if value.encode_wide().any(|unit| unit == 0) {
            return Err(invalid_input("Windows environment value contains NUL"));
        }
        if index > 0
            && entries[index - 1]
                .0
                .to_string_lossy()
                .eq_ignore_ascii_case(&key.to_string_lossy())
        {
            return Err(invalid_input("duplicate Windows environment key"));
        }
    }

    let mut output = Vec::new();
    for (key, value) in entries {
        output.extend(key.encode_wide());
        output.push(61);
        output.extend(value.encode_wide());
        output.push(0);
    }
    output.push(0);
    Ok(output)
}

fn timeout_milliseconds(timeout: Duration) -> u32 {
    timeout
        .as_millis()
        .min(u128::from(u32::MAX - 1))
        .try_into()
        .expect("bounded to u32")
}

fn wait_handle(handle: Handle, timeout: Duration) -> io::Result<bool> {
    // SAFETY: handle is a retained live process handle and timeout is finite.
    match unsafe { WaitForSingleObject(handle, timeout_milliseconds(timeout)) } {
        WAIT_OBJECT_0 => Ok(true),
        WAIT_TIMEOUT => Ok(false),
        WAIT_FAILED => Err(win32_error("WaitForSingleObject")),
        other => Err(invariant(format!(
            "WaitForSingleObject returned unexpected status {other}"
        ))),
    }
}

fn exit_code(handle: Handle) -> io::Result<Option<u32>> {
    let mut code = 0u32;
    // SAFETY: code is writable and handle is a retained process handle.
    let ok = unsafe { GetExitCodeProcess(handle, &mut code) };
    check_bool(ok, "GetExitCodeProcess")?;
    if code == STILL_ACTIVE {
        Ok(None)
    } else {
        Ok(Some(code))
    }
}

fn terminate_single_process(handle: Handle, exit_code: u32) {
    // SAFETY: best-effort cleanup of a process handle returned by CreateProcessW.
    let _ = unsafe { TerminateProcess(handle, exit_code) };
    // SAFETY: same retained process handle; bounded wait prevents an unbounded Drop path.
    let _ = unsafe { WaitForSingleObject(handle, 5_000) };
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShutdownOutcome {
    Exited(u32),
    Forced,
}

#[derive(Debug)]
pub struct Job {
    handle: OwnedHandle,
    active_process_limit: Option<u32>,
}

impl Job {
    pub fn new(active_process_limit: Option<u32>) -> io::Result<Self> {
        if active_process_limit == Some(0) {
            return Err(invalid_input(
                "active process limit must be greater than zero",
            ));
        }

        // SAFETY: null security attributes and null name create a private unnamed Job.
        let raw = unsafe { CreateJobObjectW(null(), null()) };
        let handle = OwnedHandle::new(raw, "CreateJobObjectW")?;

        let mut limits = JobObjectExtendedLimitInformation::default();
        limits.basic_limit_information.limit_flags = BASE_LIMIT_FLAGS;
        if let Some(limit) = active_process_limit {
            limits.basic_limit_information.limit_flags |= JOB_OBJECT_LIMIT_ACTIVE_PROCESS;
            limits.basic_limit_information.active_process_limit = limit;
        }

        // SAFETY: limits is a valid initialized structure for the documented
        // JobObjectExtendedLimitInformation information class.
        let set = unsafe {
            SetInformationJobObject(
                handle.raw(),
                JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                (&limits as *const JobObjectExtendedLimitInformation).cast(),
                size_of::<JobObjectExtendedLimitInformation>() as u32,
            )
        };
        check_bool(set, "SetInformationJobObject")?;

        let mut actual = JobObjectExtendedLimitInformation::default();
        // SAFETY: actual is writable and correctly sized for this information class.
        let queried = unsafe {
            QueryInformationJobObject(
                handle.raw(),
                JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                (&mut actual as *mut JobObjectExtendedLimitInformation).cast(),
                size_of::<JobObjectExtendedLimitInformation>() as u32,
                null_mut(),
            )
        };
        check_bool(queried, "QueryInformationJobObject(limits)")?;

        let flags = actual.basic_limit_information.limit_flags;
        if flags & JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE == 0 {
            return Err(invariant("Job lost KILL_ON_JOB_CLOSE during read-back"));
        }
        if flags & (JOB_OBJECT_LIMIT_BREAKAWAY_OK | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK) != 0 {
            return Err(invariant("Job unexpectedly permits process breakaway"));
        }
        if let Some(expected) = active_process_limit
            && (flags & JOB_OBJECT_LIMIT_ACTIVE_PROCESS == 0
                || actual.basic_limit_information.active_process_limit != expected)
        {
            return Err(invariant(
                "Job active-process limit differs from requested policy",
            ));
        }

        Ok(Self {
            handle,
            active_process_limit,
        })
    }

    pub fn active_process_limit(&self) -> Option<u32> {
        self.active_process_limit
    }

    pub fn active_process_count(&self) -> io::Result<u32> {
        let mut accounting = JobObjectBasicAccountingInformation::default();
        // SAFETY: accounting is writable and correctly sized for the basic
        // accounting information class.
        let queried = unsafe {
            QueryInformationJobObject(
                self.handle.raw(),
                JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION,
                (&mut accounting as *mut JobObjectBasicAccountingInformation).cast(),
                size_of::<JobObjectBasicAccountingInformation>() as u32,
                null_mut(),
            )
        };
        check_bool(queried, "QueryInformationJobObject(accounting)")?;
        Ok(accounting.active_processes)
    }

    pub fn spawn(
        &self,
        executable: &Path,
        args: &[OsString],
        current_directory: &Path,
        environment: &[(OsString, OsString)],
    ) -> io::Result<ContainedProcess> {
        if !executable.is_absolute() {
            return Err(invalid_input("absolute executable path required"));
        }
        if !current_directory.is_absolute() {
            return Err(invalid_input("absolute current directory required"));
        }

        let application = wide_z(executable.as_os_str())?;
        let mut command = command_line(executable, args)?;
        let directory = wide_z(current_directory.as_os_str())?;
        let environment = environment_block(environment)?;

        let mut attributes = AttributeList::new(1)?;
        let mut job_list = [self.handle.raw()];
        attributes.set_job_list(&mut job_list)?;

        let mut startup = StartupInfoExW::default();
        startup.startup.cb = size_of::<StartupInfoExW>() as u32;
        startup.attribute_list = attributes.ptr();
        let mut information = ProcessInformation::default();

        let creation_flags = CREATE_SUSPENDED
            | CREATE_UNICODE_ENVIRONMENT
            | EXTENDED_STARTUPINFO_PRESENT
            | CREATE_NO_WINDOW;

        // SAFETY: every pointer references initialized storage that remains live
        // through the call; handles are not inherited; application is absolute;
        // the Job list binds the child to this Job during process creation.
        let created = unsafe {
            CreateProcessW(
                application.as_ptr(),
                command.as_mut_ptr(),
                null(),
                null(),
                0,
                creation_flags,
                environment.as_ptr().cast(),
                directory.as_ptr(),
                &startup.startup,
                &mut information,
            )
        };
        check_bool(created, "CreateProcessW")?;

        if information.process.is_null() || information.thread.is_null() {
            if !information.process.is_null() {
                terminate_single_process(information.process, 125);
                // SAFETY: CreateProcessW returned this process handle to us.
                let _ = unsafe { CloseHandle(information.process) };
            }
            if !information.thread.is_null() {
                // SAFETY: CreateProcessW returned this thread handle to us.
                let _ = unsafe { CloseHandle(information.thread) };
            }
            return Err(invariant(
                "CreateProcessW returned incomplete process information",
            ));
        }

        let process = OwnedHandle(information.process);
        let thread = OwnedHandle(information.thread);

        let mut inside = 0i32;
        // SAFETY: process and Job handles are live; inside is writable.
        let checked = unsafe { IsProcessInJob(process.raw(), self.handle.raw(), &mut inside) };
        if let Err(error) = check_bool(checked, "IsProcessInJob") {
            terminate_single_process(process.raw(), 125);
            return Err(error);
        }
        if inside == 0 {
            terminate_single_process(process.raw(), 125);
            return Err(invariant("child was not attached to the authoritative Job"));
        }

        // SAFETY: the primary thread is still suspended and the handle is live.
        let previous_suspend_count = unsafe { ResumeThread(thread.raw()) };
        if previous_suspend_count == u32::MAX {
            let error = win32_error("ResumeThread");
            terminate_single_process(process.raw(), 125);
            return Err(error);
        }

        drop(thread);
        Ok(ContainedProcess {
            process,
            pid: information.process_id,
        })
    }

    pub fn contains(&self, process: &ContainedProcess) -> io::Result<bool> {
        self.contains_handle(process.process.raw())
    }

    pub fn contains_observed(&self, process: &ObservedProcess) -> io::Result<bool> {
        self.contains_handle(process.process.raw())
    }

    fn contains_handle(&self, process: Handle) -> io::Result<bool> {
        let mut inside = 0i32;
        // SAFETY: both handles are retained and inside is writable.
        let checked = unsafe { IsProcessInJob(process, self.handle.raw(), &mut inside) };
        check_bool(checked, "IsProcessInJob")?;
        Ok(inside != 0)
    }

    pub fn terminate(&self, exit_code: u32) -> io::Result<()> {
        // SAFETY: the Job handle is live and owned by self.
        let terminated = unsafe { TerminateJobObject(self.handle.raw(), exit_code) };
        check_bool(terminated, "TerminateJobObject")
    }

    pub fn wait_or_terminate(
        &self,
        process: &ContainedProcess,
        graceful_timeout: Duration,
        forced_wait: Duration,
        forced_exit_code: u32,
    ) -> io::Result<ShutdownOutcome> {
        if !self.contains(process)? {
            return Err(invariant("shutdown target is not a member of this Job"));
        }

        if process.wait(graceful_timeout)? {
            let code = process
                .exit_code()?
                .ok_or_else(|| invariant("signalled process still reports STILL_ACTIVE"))?;
            return Ok(ShutdownOutcome::Exited(code));
        }

        self.terminate(forced_exit_code)?;
        if !process.wait(forced_wait)? {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "process survived TerminateJobObject beyond forced wait",
            ));
        }
        Ok(ShutdownOutcome::Forced)
    }
}

#[derive(Debug)]
pub struct ContainedProcess {
    process: OwnedHandle,
    pid: u32,
}

impl ContainedProcess {
    pub fn pid(&self) -> u32 {
        self.pid
    }

    pub fn wait(&self, timeout: Duration) -> io::Result<bool> {
        wait_handle(self.process.raw(), timeout)
    }

    pub fn exit_code(&self) -> io::Result<Option<u32>> {
        exit_code(self.process.raw())
    }
}

#[derive(Debug)]
pub struct ObservedProcess {
    process: OwnedHandle,
    pid: u32,
}

impl ObservedProcess {
    pub fn open(pid: u32) -> io::Result<Self> {
        if pid == 0 {
            return Err(invalid_input("process id must be non-zero"));
        }
        // SAFETY: OpenProcess receives a concrete PID and requests only
        // synchronize/query access; no inherited handle is requested.
        let handle =
            unsafe { OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        Ok(Self {
            process: OwnedHandle::new(handle, "OpenProcess")?,
            pid,
        })
    }

    pub fn pid(&self) -> u32 {
        self.pid
    }

    pub fn wait(&self, timeout: Duration) -> io::Result<bool> {
        wait_handle(self.process.raw(), timeout)
    }

    pub fn exit_code(&self) -> io::Result<Option<u32>> {
        exit_code(self.process.raw())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_policy_kills_on_close_and_never_allows_breakaway() {
        assert_ne!(BASE_LIMIT_FLAGS & JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, 0);
        assert_eq!(
            BASE_LIMIT_FLAGS
                & (JOB_OBJECT_LIMIT_BREAKAWAY_OK | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK),
            0
        );
    }

    #[test]
    fn quoting_rejects_nul_and_escapes_embedded_quote() {
        assert!(quote_argument(OsStr::new("a\0b")).is_err());
        let quoted = quote_argument(OsStr::new("a\"b")).expect("quote");
        assert_eq!(quoted.first(), Some(&34));
        assert_eq!(quoted.last(), Some(&34));
        assert!(quoted.windows(2).any(|pair| pair == [92u16, 34u16]));
    }

    #[test]
    fn environment_is_sorted_unique_and_double_terminated() {
        let block = environment_block(&[
            (OsString::from("z"), OsString::from("2")),
            (OsString::from("A"), OsString::from("1")),
        ])
        .expect("environment");
        assert!(block.ends_with(&[0, 0]));
        let text = String::from_utf16_lossy(&block);
        assert!(text.starts_with("A=1\0z=2\0"));
        assert!(
            environment_block(&[
                (OsString::from("Path"), OsString::from("a")),
                (OsString::from("PATH"), OsString::from("b")),
            ])
            .is_err()
        );
    }

    #[test]
    fn timeout_never_turns_into_infinite_wait() {
        assert_eq!(timeout_milliseconds(Duration::ZERO), 0);
        assert_eq!(
            timeout_milliseconds(Duration::from_millis(u64::MAX)),
            u32::MAX - 1
        );
    }
}
