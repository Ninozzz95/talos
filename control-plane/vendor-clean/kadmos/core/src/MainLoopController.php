<?php

declare(strict_types=1);

namespace Kadmos;

use Kadmos\Validator\JmpValidatorInterface;

final class MainLoopController
{
    private ASTOrchestrator $orchestrator;
    private LLMClientInterface $llm;
    private JmpValidatorInterface $validator;
    private int $maxCycles;
    private int $cycleCount = 0;
    private int $faultCount = 0;
    private int $recoveryCycles = 0;
    private bool $inFault = false;
    private ?string $broadcastUrl;
    private bool $demoThrottle;
    private int $throttleMs;

    /** @var array<string, string> */
    private array $previousNodeStates = [];

    /** @var list<array{status: string, output_summary: string, raw_output: mixed}> */
    private array $executionLog = [];

    public function __construct(
        ASTOrchestrator $orchestrator,
        LLMClientInterface $llm,
        JmpValidatorInterface $validator,
        int $maxCycles = 100,
        ?string $broadcastUrl = null,
        bool $demoThrottle = false,
        int $throttleMs = 600,
    ) {
        $this->orchestrator = $orchestrator;
        $this->llm = $llm;
        $this->validator = $validator;
        $this->maxCycles = $maxCycles;
        $this->broadcastUrl = $broadcastUrl;
        $this->demoThrottle = $demoThrottle;
        $this->throttleMs = $throttleMs;
    }

    /**
     * Runs the main event loop.
     *
     * @return list<array{status: string, output_summary: string, raw_output: mixed}>
     */
    public function run(): array
    {
        while ($this->cycleCount < $this->maxCycles) {
            $this->cycleCount++;

            // 1. READ: Serialize DAG state for the LLM
            $prompt = $this->orchestrator->serializeDagState();

            // 2. THINK: Get JMP mutations from LLM
            $rawJmp = $this->llm->generate($prompt);

            /** @var list<array<string, mixed>> */
            $batch = \json_decode($rawJmp, true);

            if (!\is_array($batch)) {
                // Malformed LLM output
                if (!$this->inFault) { $this->faultCount++; $this->inFault = true; }
                $this->recoveryCycles++;
                $this->llm->injectFault([[
                    'field' => 'jmp_response',
                    'expected' => 'valid JSON array',
                    'received' => \gettype($batch),
                    'message' => 'LLM response is not a valid JSON array.',
                ]]);
                continue;
            }

            // 3. ACT: Validate via IPC
            $context = $this->orchestrator->buildContext($batch);
            $validation = $this->validator->validate($batch, $context);

            if (!$validation->valid) {
                if (!$this->inFault) { $this->faultCount++; $this->inFault = true; }
                $this->recoveryCycles++;
                $this->llm->injectFault(\array_map(
                    fn(ValidationFault $f) => [
                        'field' => $f->field,
                        'expected' => $f->expected,
                        'received' => $f->received,
                        'message' => $f->message,
                    ],
                    $validation->errors,
                ));
                continue;
            }

            // Validation passed — reset fault tracking
            $this->inFault = false;

            // 4. APPLY: Process validated mutations
            $this->applyMutations($batch);

            // 5. EXECUTE: Run all ready nodes
            $this->executeReadyNodes();

            // 6. BROADCAST: Push DAG state to HMI via WebSocket
            $this->broadcastDag();
        }

        return $this->executionLog;
    }

    /**
     * @param list<array<string, mixed>> $batch
     */
    private function applyMutations(array $batch): void
    {
        foreach ($batch as $mutation) {
            $action = $mutation['action'] ?? '';

            switch ($action) {
                case 'SPAWN_NODE':
                    $nodeId = (string) ($mutation['node_id'] ?? '');
                    $nodeType = (string) ($mutation['node_type'] ?? 'UNKNOWN');
                    $deps = isset($mutation['dependencies']) && \is_array($mutation['dependencies'])
                        ? \array_map('strval', $mutation['dependencies'])
                        : [];

                    $this->orchestrator->addNode($nodeId, $deps, $nodeType);
                    if ($this->demoThrottle) { usleep($this->throttleMs * 1000); $this->broadcastDag(); }
                    break;

                case 'MUTATE_PAYLOAD':
                    $nodeId = (string) ($mutation['node_id'] ?? '');
                    $payload = isset($mutation['payload']) && \is_array($mutation['payload'])
                        ? $mutation['payload']
                        : [];

                    $this->orchestrator->setPayload($nodeId, $payload);
                    if ($this->demoThrottle) { usleep($this->throttleMs * 1000); $this->broadcastDag(); }
                    break;

                case 'YIELD_EXECUTION':
                    // Handled by executeReadyNodes after all mutations applied
                    break;
            }
        }
    }

    private function executeReadyNodes(): void
    {
        $queue = $this->orchestrator->getExecutionQueue();

        while ($queue !== []) {
            $executedAny = false;
            foreach ($queue as $nodeId) {
                try {
                    $this->orchestrator->executeNode($nodeId);
                    $executedAny = true;
                    if ($this->demoThrottle) { usleep($this->throttleMs * 1000); $this->broadcastDag(); }
                } catch (\RuntimeException $e) {
                    // Node not in executable state (PENDING without payload) — skip
                    continue;
                }
            }
            if (!$executedAny) {
                // No nodes could be executed — avoid infinite loop
                break;
            }
            $queue = $this->orchestrator->getExecutionQueue();
        }
    }

    public function getCycleCount(): int
    {
        return $this->cycleCount;
    }

    public function getCTR(): float
    {
        return $this->faultCount > 0
            ? round($this->recoveryCycles / $this->faultCount, 2)
            : 0;
    }

    public function getFaultCount(): int
    {
        return $this->faultCount;
    }

    private function broadcastDag(): void
    {
        if ($this->broadcastUrl === null) {
            return;
        }

        try {
            $dag = $this->orchestrator->serializeDagState();

            // Build structured delta from previous state
            $state = $this->orchestrator->exportState();
            $deltas = [];
            foreach ($state['nodes'] as $nodeId => $node) {
                $currentStatus = $node['status'];
                $previousStatus = $this->previousNodeStates[$nodeId] ?? null;
                if ($previousStatus !== null && $previousStatus !== $currentStatus) {
                    $deltas[] = [
                        'node_id' => $nodeId,
                        'previous_state' => $previousStatus,
                        'new_state' => $currentStatus,
                        'output_summary' => $node['output_summary'] ?? null,
                    ];
                }
                $this->previousNodeStates[$nodeId] = $currentStatus;
            }

            $payload = json_encode([
                'type' => 'dag-update',
                'timestamp' => microtime(true),
                'deltas' => $deltas,
                'full_dag' => $dag,
            ]);

            $ch = \curl_init($this->broadcastUrl);
            \curl_setopt_array($ch, [
                \CURLOPT_RETURNTRANSFER => true,
                \CURLOPT_POST => true,
                \CURLOPT_POSTFIELDS => $payload,
                \CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                \CURLOPT_TIMEOUT_MS => 1000,
            ]);
            \curl_exec($ch);
        } catch (\Throwable) {
            // Broadcast is best-effort
        }
    }
}
