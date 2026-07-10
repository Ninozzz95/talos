<?php

declare(strict_types=1);

namespace Kadmos\Browser;

final readonly class BrowserPlanBatch
{
    /** @param array<string, mixed> $commandPayload */
    private function __construct(
        public string $nodeId,
        public array $commandPayload,
        public BrowserReadCommand $command,
        public array $mutations,
    ) {
    }

    /** @param list<array<string, mixed>> $mutations */
    public static function fromMutations(array $mutations, ?string $runId = null, ?string $browserSessionId = null): self
    {
        if (! array_is_list($mutations) || count($mutations) !== 2) {
            throw new \InvalidArgumentException('Browse mode requires exactly one browser spawn and one command payload.');
        }

        $spawn = null;
        $payloadMutation = null;
        foreach ($mutations as $mutation) {
            if (! is_array($mutation)) {
                throw new \InvalidArgumentException('Browser plan mutations must be objects.');
            }

            if (($mutation['action'] ?? null) === 'SPAWN_NODE') {
                if ($spawn !== null || ($mutation['node_type'] ?? null) !== 'BROWSER_COMMAND') {
                    throw new \InvalidArgumentException('Browse mode accepts only one BROWSER_COMMAND spawn.');
                }
                $spawn = $mutation;
                continue;
            }

            if (($mutation['action'] ?? null) === 'MUTATE_PAYLOAD') {
                if ($payloadMutation !== null) {
                    throw new \InvalidArgumentException('Browse mode accepts only one browser command payload.');
                }
                $payloadMutation = $mutation;
                continue;
            }

            throw new \InvalidArgumentException('Browse mode rejects non-browser DAG mutations.');
        }

        $nodeId = $spawn['node_id'] ?? null;
        $payloadNodeId = $payloadMutation['node_id'] ?? null;
        $payload = $payloadMutation['payload'] ?? null;
        if (! is_string($nodeId) || $nodeId === '' || $payloadNodeId !== $nodeId || ! is_array($payload)) {
            throw new \InvalidArgumentException('Browser spawn and command payload must target the same node.');
        }

        if (($runId === null) !== ($browserSessionId === null)) {
            throw new \InvalidArgumentException('Browser plan authority must include both run and browser session IDs.');
        }
        if ($runId !== null && $browserSessionId !== null) {
            $payload['run_id'] = $runId;
            $payload['browser_session_id'] = $browserSessionId;
        }

        $payload['schema_version'] = 'talos_browser_command_v1';
        $payload['node_id'] = $nodeId;
        $payload['observation_request'] ??= [];
        $payload['risk'] = 'read';
        if (($payload['operation'] ?? null) !== 'read') {
            $payload['expected_evidence_hash'] = null;
        }

        $fingerprintJson = json_encode([
            'schema_version' => $payload['schema_version'],
            'run_id' => $payload['run_id'] ?? null,
            'node_id' => $payload['node_id'],
            'browser_session_id' => $payload['browser_session_id'] ?? null,
            'operation' => $payload['operation'] ?? null,
            'arguments' => $payload['arguments'] ?? null,
            'observation_request' => $payload['observation_request'],
            'risk' => $payload['risk'],
            'expected_evidence_hash' => $payload['expected_evidence_hash'] ?? null,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $fingerprint = hash('sha256', is_string($fingerprintJson) ? $fingerprintJson : serialize($payload));
        $payload['command_id'] = 'bc_'.substr($fingerprint, 0, 24);
        $payload['idempotency_key'] = 'sha256:'.$fingerprint;

        foreach ($mutations as $index => $mutation) {
            if (is_array($mutation) && ($mutation['action'] ?? null) === 'MUTATE_PAYLOAD') {
                $mutations[$index]['payload'] = $payload;
                break;
            }
        }

        $command = BrowserReadCommand::fromArray($payload);
        if ($command->nodeId !== $nodeId) {
            throw new \InvalidArgumentException('Browser command payload node ID must match its mutation node.');
        }

        return new self($nodeId, $payload, $command, $mutations);
    }
}
