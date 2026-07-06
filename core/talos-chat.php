#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Talos Chat Server — HTTP endpoint for interactive LLM chat
 * 
 * Usage: php talos-chat.php
 * Listens on stdin for JSON lines: { "message": "user message", "api_key": "sk-..." }
 * Responds with JSON: { "reply": "...", "dag": "...", "mutations": [...] }
 */

require_once __DIR__ . '/src/NodeStatus.php';
require_once __DIR__ . '/src/ASTOrchestrator.php';
require_once __DIR__ . '/src/LLMClientInterface.php';
require_once __DIR__ . '/src/SystemPromptBuilder.php';
require_once __DIR__ . '/src/OpenAIClient.php';
require_once __DIR__ . '/src/ValidationFault.php';
require_once __DIR__ . '/src/ValidationResult.php';
require_once __DIR__ . '/src/HttpClientInterface.php';
require_once __DIR__ . '/src/JmpValidatorClient.php';
require_once __DIR__ . '/src/Workers/NodeWorkerInterface.php';
require_once __DIR__ . '/src/Workers/WorkerRegistry.php';

use AVM\ASTOrchestrator;
use AVM\NodeStatus;
use AVM\OpenAIClient;
use AVM\JmpValidatorClient;
use AVM\HttpClientInterface;
use AVM\Workers\WorkerRegistry;
use AVM\Workers\NodeWorkerInterface;

// Persistent state
$stubWorker = new class implements NodeWorkerInterface {
    public function execute(array $payload): array {
        $url = $payload['url'] ?? $payload['query'] ?? '?';
        return ['status' => NodeStatus::SUCCESS, 'output_summary' => "OK: " . substr($url, 0, 50), 'raw_output' => null];
    }
};

$registry = new WorkerRegistry();
$registry->register('HTTP_REQUEST', $stubWorker);
$registry->register('QUERY_DATABASE', $stubWorker);

$orchestrator = new ASTOrchestrator($registry);

$alwaysValid = new class implements HttpClientInterface {
    public function postJson(string $url, array $body): array { return ['valid' => true]; }
};

$validator = new JmpValidatorClient($alwaysValid);
$llm = null;

// Chat loop: read JSON line, process, respond JSON line
while (true) {
    $line = fgets(STDIN);
    if ($line === false || trim($line) === '') break;
    
    $input = json_decode($line, true);
    if (!$input || !isset($input['message'])) {
        echo json_encode(['error' => 'invalid input']) . "\n";
        continue;
    }

    $message = $input['message'];
    $apiKey = $input['api_key'] ?? getenv('DEEPSEEK_API_KEY') ?: '';

    // Init LLM on first message
    if ($llm === null) {
        $llm = new OpenAIClient($apiKey, 'deepseek-chat', 'https://api.deepseek.com/v1');
    }

    // Build prompt: user message + current DAG state
    $dagState = $orchestrator->serializeDagState();
    $prompt = "User request: {$message}\n\nCurrent DAG State:\n{$dagState}\n\nReply with a JMP JSON array of commands to fulfill the request. Include YIELD_EXECUTION when you want nodes to execute.";

    // Get LLM response
    $rawJmp = $llm->generate($prompt);
    $batch = json_decode($rawJmp, true);

    if (!is_array($batch)) {
        echo json_encode(['reply' => $rawJmp, 'dag' => $dagState, 'mutations' => [], 'error' => 'Invalid JMP']) . "\n";
        continue;
    }

    // Validate
    $context = $orchestrator->buildContext($batch);
    $validation = $validator->validate($batch, $context);

    if (!$validation->valid) {
        $errors = array_map(fn($f) => "{$f->field}: {$f->message}", $validation->errors);
        echo json_encode(['reply' => $rawJmp, 'dag' => $dagState, 'mutations' => $batch, 'errors' => $errors]) . "\n";
        continue;
    }

    // Apply mutations
    foreach ($batch as $mutation) {
        $action = $mutation['action'] ?? '';
        switch ($action) {
            case 'SPAWN_NODE':
                $nodeId = (string)($mutation['node_id'] ?? '');
                $nodeType = (string)($mutation['node_type'] ?? 'UNKNOWN');
                $deps = isset($mutation['dependencies']) && is_array($mutation['dependencies'])
                    ? array_map('strval', $mutation['dependencies']) : [];
                $orchestrator->addNode($nodeId, $deps, $nodeType);
                break;
            case 'MUTATE_PAYLOAD':
                $nodeId = (string)($mutation['node_id'] ?? '');
                $payload = isset($mutation['payload']) && is_array($mutation['payload'])
                    ? $mutation['payload'] : [];
                $orchestrator->setPayload($nodeId, $payload);
                break;
        }
    }

    // Execute ready nodes
    $queue = $orchestrator->getExecutionQueue();
    foreach ($queue as $nodeId) {
        try { $orchestrator->executeNode($nodeId); } catch (\Throwable) {}
    }

    // Re-check queue after execution (dependencies may have been satisfied)
    $queue = $orchestrator->getExecutionQueue();
    foreach ($queue as $nodeId) {
        try { $orchestrator->executeNode($nodeId); } catch (\Throwable) {}
    }

    $finalDag = $orchestrator->serializeDagState();
    echo json_encode(['reply' => $rawJmp, 'dag' => $finalDag, 'mutations' => $batch]) . "\n";
}
