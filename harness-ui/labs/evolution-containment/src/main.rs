mod protocol;
#[cfg(all(windows, target_arch = "x86_64"))]
mod windows;

// Workers intentionally inherit no console handles. Their retained process
// handle still exposes an exit code, so distinguish bootstrap/argument errors
// from I/O failures without granting another communication capability.
fn failure_code(error: &str) -> i32 {
    if error == "use --run-synthetic-probes; lab only" { return 64; }
    if error == "invalid probe arguments" { return 65; }
    if error.starts_with("scratch open:") { return 66; }
    if error.starts_with("report pipe open:") { return 67; }
    if error == "invalid port" || error == "invalid probe mode" { return 68; }
    1
}

fn main() {
    #[cfg(all(windows, target_arch = "x86_64"))]
    if let Err(error) = windows::run() {
        eprintln!("SPIKE_FAILED: {error}");
        std::process::exit(failure_code(&error));
    }
    #[cfg(not(all(windows, target_arch = "x86_64")))]
    {
        eprintln!("UNSUPPORTED: this executable measures Windows x64 only; no permissive fallback");
        std::process::exit(2);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn diagnostic_exit_codes_never_mean_success() {
        assert_eq!(failure_code("use --run-synthetic-probes; lab only"), 64);
        assert_eq!(failure_code("invalid probe arguments"), 65);
        assert_eq!(failure_code("scratch open: access denied"), 66);
        assert_eq!(failure_code("report pipe open: not found"), 67);
        assert_eq!(failure_code("invalid port"), 68);
        assert_eq!(failure_code("unknown failure"), 1);
    }
}
