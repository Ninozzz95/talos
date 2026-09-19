#![deny(unsafe_op_in_unsafe_fn)]

//! Windows enforcement boundary for TALOS.
//!
//! This crate is intentionally empty in E0-3. A later researched slice may
//! introduce narrowly scoped Win32 FFI here. Unsafe code is structurally
//! forbidden in the other native TALOS crates.

#[must_use]
pub const fn backend_name() -> &'static str {
    "windows-sandbox-unimplemented"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scaffold_does_not_claim_an_active_sandbox() {
        assert_eq!(backend_name(), "windows-sandbox-unimplemented");
    }
}
