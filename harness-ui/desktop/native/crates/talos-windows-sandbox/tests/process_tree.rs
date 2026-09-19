#![cfg(windows)]

use std::{
    env,
    ffi::OsString,
    fs,
    io,
    path::{Path, PathBuf},
    process::{Child, Command, ExitStatus},
    sync::atomic::{AtomicU64, Ordering},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use talos_windows_sandbox::{ContainedProcess, Job, ObservedProcess, ShutdownOutcome};

static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

struct TempTree(PathBuf);

impl TempTree {
    fn new(label: &str) -> io::Result<Self> {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(io::Error::other)?
            .as_nanos();
        let sequence = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
        let path = env::temp_dir().join(format!(
            "talos-e1-4-{label}-{}-{nonce}-{sequence}",
            std::process::id()
        ));
        fs::create_dir_all(&path)?;
        Ok(Self(path))
    }

    fn path(&self) -> &Path {
        &self.0
    }

    fn file(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for TempTree {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_talos-windows-sandbox-fixture"))
}

fn explicit_environment() -> Vec<(OsString, OsString)> {
    ["SystemRoot", "TEMP", "TMP"]
        .into_iter()
        .filter_map(|key| env::var_os(key).map(|value| (OsString::from(key), value)))
        .collect()
}

fn read_pid(path: &Path, timeout: Duration) -> io::Result<u32> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if let Ok(text) = fs::read_to_string(path)
            && let Ok(pid) = text.trim().parse::<u32>()
            && pid != 0
        {
            return Ok(pid);
        }
        thread::sleep(Duration::from_millis(20));
    }
    Err(io::Error::new(
        io::ErrorKind::TimedOut,
        format!("timed out waiting for pid in {}", path.display()),
    ))
}

fn read_pid_pair(path: &Path, timeout: Duration) -> io::Result<(u32, u32)> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if let Ok(text) = fs::read_to_string(path) {
            let values: Vec<u32> = text
                .lines()
                .filter_map(|line| line.trim().parse::<u32>().ok())
                .collect();
            if values.len() == 2 && values.iter().all(|value| *value != 0) {
                return Ok((values[0], values[1]));
            }
        }
        thread::sleep(Duration::from_millis(20));
    }
    Err(io::Error::new(
        io::ErrorKind::TimedOut,
        format!("timed out waiting for pid pair in {}", path.display()),
    ))
}

fn wait_child(child: &mut Child, timeout: Duration) -> io::Result<ExitStatus> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if let Some(status) = child.try_wait()? {
            return Ok(status);
        }
        thread::sleep(Duration::from_millis(20));
    }
    let _ = child.kill();
    let _ = child.wait();
    Err(io::Error::new(
        io::ErrorKind::TimedOut,
        "fixture owner did not exit in time",
    ))
}

fn spawn_tree(job: &Job, tree: &TempTree, mode: &str) -> io::Result<(ContainedProcess, ObservedProcess)> {
    let pid_file = tree.file("grandchild.pid");
    let parent = job.spawn(
        &fixture(),
        &[OsString::from(mode), pid_file.as_os_str().to_os_string()],
        tree.path(),
        &explicit_environment(),
    )?;
    let grandchild_pid = read_pid(&pid_file, Duration::from_secs(5))?;
    let grandchild = ObservedProcess::open(grandchild_pid)?;
    Ok((parent, grandchild))
}

#[test]
fn job_close_terminates_parent_and_grandchild() -> io::Result<()> {
    let tree = TempTree::new("close")?;
    let job = Job::new(None)?;
    let (parent, grandchild) = spawn_tree(&job, &tree, "--parent")?;

    assert!(job.contains(&parent)?);
    assert!(job.contains_observed(&grandchild)?);
    assert!(!parent.wait(Duration::ZERO)?);
    assert!(!grandchild.wait(Duration::ZERO)?);

    drop(job);

    assert!(parent.wait(Duration::from_secs(5))?);
    assert!(grandchild.wait(Duration::from_secs(5))?);
    Ok(())
}

#[test]
fn explicit_terminate_job_object_ends_tree() -> io::Result<()> {
    let tree = TempTree::new("terminate")?;
    let job = Job::new(None)?;
    let (parent, grandchild) = spawn_tree(&job, &tree, "--parent")?;

    job.terminate(125)?;

    assert!(parent.wait(Duration::from_secs(5))?);
    assert!(grandchild.wait(Duration::from_secs(5))?);
    Ok(())
}

#[test]
fn breakaway_request_is_denied() -> io::Result<()> {
    let tree = TempTree::new("breakaway")?;
    let status_file = tree.file("breakaway.txt");
    let job = Job::new(None)?;
    let process = job.spawn(
        &fixture(),
        &[
            OsString::from("--attempt-breakaway"),
            status_file.as_os_str().to_os_string(),
        ],
        tree.path(),
        &explicit_environment(),
    )?;

    assert!(process.wait(Duration::from_secs(5))?);
    assert_eq!(process.exit_code()?, Some(0));
    let status = fs::read_to_string(status_file)?;
    assert!(
        status.starts_with("denied:"),
        "breakaway unexpectedly succeeded: {status}"
    );
    Ok(())
}

#[test]
fn active_process_limit_is_enforced() -> io::Result<()> {
    let tree = TempTree::new("cap")?;
    let job = Job::new(Some(2))?;
    assert_eq!(job.active_process_limit(), Some(2));

    let args = [OsString::from("--idle")];
    let first = job.spawn(&fixture(), &args, tree.path(), &explicit_environment())?;
    let second = job.spawn(&fixture(), &args, tree.path(), &explicit_environment())?;

    assert!(!first.wait(Duration::ZERO)?);
    assert!(!second.wait(Duration::ZERO)?);
    assert_eq!(job.active_process_count()?, 2);

    let third = job.spawn(&fixture(), &args, tree.path(), &explicit_environment());
    assert!(third.is_err(), "third process escaped active-process limit");
    assert_eq!(job.active_process_count()?, 2);

    drop(job);
    assert!(first.wait(Duration::from_secs(5))?);
    assert!(second.wait(Duration::from_secs(5))?);
    Ok(())
}

#[test]
fn child_crash_does_not_orphan_grandchild() -> io::Result<()> {
    let tree = TempTree::new("crash")?;
    let job = Job::new(None)?;
    let (parent, grandchild) = spawn_tree(&job, &tree, "--spawn-grandchild-then-crash")?;

    assert!(parent.wait(Duration::from_secs(5))?);
    assert_eq!(parent.exit_code()?, Some(86));
    assert!(!grandchild.wait(Duration::ZERO)?);

    drop(job);
    assert!(grandchild.wait(Duration::from_secs(5))?);
    Ok(())
}

#[test]
fn shutdown_timeout_escalates_to_job_termination() -> io::Result<()> {
    let tree = TempTree::new("timeout")?;
    let job = Job::new(None)?;
    let process = job.spawn(
        &fixture(),
        &[OsString::from("--idle")],
        tree.path(),
        &explicit_environment(),
    )?;

    let outcome = job.wait_or_terminate(
        &process,
        Duration::from_millis(50),
        Duration::from_secs(5),
        124,
    )?;
    assert_eq!(outcome, ShutdownOutcome::Forced);
    assert!(process.wait(Duration::ZERO)?);
    Ok(())
}

#[test]
fn abrupt_job_owner_exit_terminates_tree_without_destructors() -> io::Result<()> {
    let tree = TempTree::new("owner-crash")?;
    let ready_file = tree.file("ready.txt");
    let release_file = tree.file("release.txt");
    let grandchild_file = tree.file("grandchild.pid");

    let mut owner_command = Command::new(fixture());
    owner_command
        .arg("--owner-abrupt")
        .arg(&ready_file)
        .arg(&release_file)
        .arg(&grandchild_file)
        .current_dir(tree.path())
        .env_clear();
    for (key, value) in explicit_environment() {
        owner_command.env(key, value);
    }
    let mut owner = owner_command.spawn()?;

    let (parent_pid, grandchild_pid) = read_pid_pair(&ready_file, Duration::from_secs(5))?;
    let parent = ObservedProcess::open(parent_pid)?;
    let grandchild = ObservedProcess::open(grandchild_pid)?;

    fs::write(&release_file, b"go")?;
    let status = wait_child(&mut owner, Duration::from_secs(5))?;
    assert_eq!(status.code(), Some(91));

    assert!(parent.wait(Duration::from_secs(5))?);
    assert!(grandchild.wait(Duration::from_secs(5))?);
    Ok(())
}
