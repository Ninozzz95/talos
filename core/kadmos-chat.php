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

$autoload = __DIR__ . '/vendor/autoload.php';
if (!file_exists($autoload)) {
    fwrite(STDERR, "Run composer install in core/ first.\n");
    exit(1);
}
require_once $autoload;

use Kadmos\ASTOrchestrator;
use Kadmos\NodeStatus;
use Kadmos\OpenAIClient;
use Kadmos\Validator\ValidatorFactory;
use Kadmos\Workers\WorkerRegistry;
use Kadmos\Workers\NodeWorkerInterface;

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

try {
    $validator = ValidatorFactory::fromEnvironment()->create();
} catch (\RuntimeException $e) {
    echo json_encode(['error' => $e->getMessage()]) . "\n";
    exit(4);
}
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

    // Build prompt
    $dagState = $orchestrator->serializeDagState();
    $hasNodes = str_contains($dagState, 'Node:');
    $prompt = $hasNodes
        ? "User: {$message}\n\nCurrent DAG:\n{$dagState}"
        : "User: {$message}";

    $rawResponse = $llm->generate($prompt);

    // Try to extract JMP JSON from response
    $jmpJson = null;
    if (preg_match('/```(?:json)?\s*\n?(.*?)\n?```/s', $rawResponse, $matches)) {
        $jmpJson = trim($matches[1]);
    } elseif (str_starts_with(trim($rawResponse), '[')) {
        $jmpJson = trim($rawResponse);
    }

    $batch = $jmpJson ? json_decode($jmpJson, true) : null;
    $textReply = $jmpJson ? trim(str_replace($matches[0] ?? '', '', $rawResponse)) : $rawResponse;

    // No JMP — just a text reply
    if (!is_array($batch)) {
        echo json_encode(['text' => trim($rawResponse), 'dag' => $dagState, 'mutations' => []]) . "\n";
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
    echo json_encode(['text' => $textReply, 'dag' => $finalDag, 'mutations' => $batch]) . "\n";
}
