mod protocol;
#[cfg(all(windows, target_arch = "x86_64"))]
mod windows;

fn main() {
    #[cfg(all(windows, target_arch = "x86_64"))]
    if let Err(error) = windows::run() {
        eprintln!("SPIKE_FAILED: {error}");
        std::process::exit(1);
    }
    #[cfg(not(all(windows, target_arch = "x86_64")))]
    {
        eprintln!("UNSUPPORTED: this executable measures Windows x64 only; no permissive fallback");
        std::process::exit(2);
    }
}
