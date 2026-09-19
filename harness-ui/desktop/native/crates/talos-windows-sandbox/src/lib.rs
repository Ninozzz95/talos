#![deny(unsafe_op_in_unsafe_fn)]

//! Windows enforcement boundary for TALOS.
//!
//! M1-D / E1-4 introduces only process-tree lifecycle containment. A Windows
//! Job Object owns Supervisor-spawned process trees and kills them when the
//! authoritative handle closes. This is not filesystem, network, credential,
//! AppContainer, or extension sandboxing.

#[cfg(windows)]
mod windows;

#[cfg(windows)]
pub use windows::{ContainedProcess, Job, ObservedProcess, ShutdownOutcome};

#[must_use]
pub const fn backend_name() -> &'static str {
    if cfg!(windows) {
        "windows-job-object-containment"
    } else {
        "windows-job-object-unavailable"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backend_name_does_not_claim_full_sandboxing() {
        assert!(backend_name().contains("job-object"));
        assert!(!backend_name().contains("appcontainer"));
    }
}
