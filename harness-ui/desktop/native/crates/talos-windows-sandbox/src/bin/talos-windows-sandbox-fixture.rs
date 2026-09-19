#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(windows)]
mod real {
    use std::{
        env,
        ffi::{OsStr, OsString},
        fs, io,
        os::windows::process::CommandExt,
        path::{Path, PathBuf},
        process::Command,
        thread,
        time::{Duration, Instant},
    };
    use talos_windows_sandbox::Job;

    const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;

    fn child_environment() -> Vec<(OsString, OsString)> {
        ["SystemRoot", "TEMP", "TMP"]
            .into_iter()
            .filter_map(|key| env::var_os(key).map(|value| (OsString::from(key), value)))
            .collect()
    }

    fn idle() -> ! {
        loop {
            thread::sleep(Duration::from_secs(60));
        }
    }

    fn wait_for_file(path: &Path, timeout: Duration) -> io::Result<()> {
        let start = Instant::now();
        while start.elapsed() < timeout {
            if path.is_file() {
                return Ok(());
            }
            thread::sleep(Duration::from_millis(20));
        }
        Err(io::Error::new(
            io::ErrorKind::TimedOut,
            format!("timed out waiting for {}", path.display()),
        ))
    }

    fn spawn_grandchild(pid_file: &Path, crash_after_spawn: bool) -> io::Result<i32> {
        let executable = env::current_exe()?;
        let child = Command::new(executable).arg("--idle").spawn()?;
        fs::write(pid_file, child.id().to_string())?;
        drop(child);

        if crash_after_spawn {
            std::process::exit(86);
        }
        idle()
    }

    fn attempt_breakaway(status_file: &Path) -> io::Result<i32> {
        let executable = env::current_exe()?;
        let attempt = Command::new(executable)
            .arg("--idle")
            .creation_flags(CREATE_BREAKAWAY_FROM_JOB)
            .spawn();

        match attempt {
            Ok(mut escaped) => {
                let pid = escaped.id();
                let _ = escaped.kill();
                let _ = escaped.wait();
                fs::write(status_file, format!("escaped:{pid}"))?;
                Ok(70)
            }
            Err(error) => {
                fs::write(
                    status_file,
                    format!("denied:{}", error.raw_os_error().unwrap_or(-1)),
                )?;
                Ok(0)
            }
        }
    }

    fn owner_abrupt(
        ready_file: &Path,
        release_file: &Path,
        grandchild_file: &Path,
    ) -> io::Result<i32> {
        let executable = env::current_exe()?;
        let current_directory = ready_file
            .parent()
            .ok_or_else(|| io::Error::other("ready file has no parent"))?;
        let job = Job::new(None)?;
        let parent = job.spawn(
            &executable,
            &[
                OsString::from("--parent"),
                grandchild_file.as_os_str().to_os_string(),
            ],
            current_directory,
            &child_environment(),
        )?;

        wait_for_file(grandchild_file, Duration::from_secs(5))?;
        let grandchild_pid: u32 = fs::read_to_string(grandchild_file)?
            .trim()
            .parse()
            .map_err(|error| io::Error::other(format!("invalid grandchild pid: {error}")))?;
        fs::write(ready_file, format!("{}\n{grandchild_pid}\n", parent.pid()))?;

        wait_for_file(release_file, Duration::from_secs(10))?;
        let _keep_job_live = job;
        let _keep_parent_handle_live = parent;
        std::process::exit(91);
    }

    pub fn run() -> io::Result<i32> {
        let args: Vec<OsString> = env::args_os().skip(1).collect();
        match args.as_slice() {
            [mode] if mode == OsStr::new("--idle") => idle(),
            [mode, pid_file] if mode == OsStr::new("--parent") => {
                spawn_grandchild(&PathBuf::from(pid_file), false)
            }
            [mode, pid_file] if mode == OsStr::new("--spawn-grandchild-then-crash") => {
                spawn_grandchild(&PathBuf::from(pid_file), true)
            }
            [mode, status_file] if mode == OsStr::new("--attempt-breakaway") => {
                attempt_breakaway(&PathBuf::from(status_file))
            }
            [mode, ready_file, release_file, grandchild_file]
                if mode == OsStr::new("--owner-abrupt") =>
            {
                owner_abrupt(
                    &PathBuf::from(ready_file),
                    &PathBuf::from(release_file),
                    &PathBuf::from(grandchild_file),
                )
            }
            _ => Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid talos-windows-sandbox fixture arguments",
            )),
        }
    }
}

#[cfg(windows)]
fn main() {
    match real::run() {
        Ok(code) => std::process::exit(code),
        Err(_) => std::process::exit(1),
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("talos-windows-sandbox-fixture requires Windows");
    std::process::exit(2);
}
