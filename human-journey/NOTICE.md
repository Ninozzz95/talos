# Third-Party Notice

The TALOS Human Journey adaptive evaluation sidecar directly integrates
`sierra-research/tau2-bench` at commit
`58e5e1ace69302e6982d27014569c03e0ffccdd2`, distributed under the MIT
License.

The upstream file
`data/tau2/user_simulator/simulation_guidelines.md` is vendored unchanged at
`upstream/tau2/user_simulator/simulation_guidelines.md`. Its exact byte count
and SHA-256 digest are recorded in `upstream/tau2/manifest.json`.

AVM owns the bounded process, policy, evidence, replay and wire-contract
adapters. Conversation generation remains the upstream
`UserSimulator.generate_next_message` implementation; TALOS does not reproduce
that simulator loop.

Upstream source and license:
<https://github.com/sierra-research/tau2-bench/tree/58e5e1ace69302e6982d27014569c03e0ffccdd2>

