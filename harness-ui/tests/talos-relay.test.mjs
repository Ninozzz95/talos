/*
 * 18/10/2026 — R5.9: le prove del pacchetto `talos-relay` (harness-ui/relay) girano insieme a quelle del server, in CI e nei
 * cancelli della release, senza toccare i workflow: node:test registra le prove all'import.
 */
import '../relay/tests/talos-relay.test.mjs';
