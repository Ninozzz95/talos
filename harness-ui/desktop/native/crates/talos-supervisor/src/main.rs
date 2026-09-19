#![forbid(unsafe_code)]

use std::env;
use std::process::ExitCode;

fn version_line() -> String {
    format!(
        "TALOS Supervisor {} (Evolution Protocol {})",
        env!("CARGO_PKG_VERSION"),
        evolution_wire::protocol_version_string()
    )
}

fn main() -> ExitCode {
    let mut args = env::args_os();
    let _program = args.next();

    match (args.next(), args.next()) {
        (Some(flag), None) if flag == "--version" => {
            println!("{}", version_line());
            ExitCode::SUCCESS
        }
        _ => {
            eprintln!("Usage: talos-supervisor --version");
            ExitCode::from(2)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_declares_supervisor_and_protocol() {
        let line = version_line();
        assert!(line.starts_with("TALOS Supervisor "));
        assert!(line.contains("Evolution Protocol 1.0"));
    }
}
