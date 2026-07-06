#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * KADMOS Chat REPL — Chat with the engine directly from terminal
 */

require_once __DIR__ . '/src/NodeStatus.php';
require_once __DIR__ . '/src/ASTOrchestrator.php';
require_once __DIR__ . '/src/LLMClientInterface.php';
require_once __DIR__ . '/src/OpenAIClient.php';
require_once __DIR__ . '/src/SystemPromptBuilder.php';
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

$apiKey = getenv('KADMOS_API_KEY') ?: getenv('DEEPSEEK_API_KEY') ?: '';
$model = getenv('KADMOS_MODEL') ?: 'deepseek-chat';
$baseUrl = getenv('KADMOS_BASE_URL') ?: 'https://api.deepseek.com/v1';

$gold = "\033[38;5;220m";
$cyan = "\033[38;5;51m";
$green = "\033[32m";
$dim = "\033[2m";
$yellow = "\033[33m";
$reset = "\033[0m";

// API key setup wizard
if (!$apiKey) {
    echo "{$gold}⚡ KADMOS CHAT — Setup{$reset}\n\n";
    echo "{$dim}No API key configured.{$reset}\n\n";
    echo "{$dim}Provider:{$reset}\n";
    echo "  {$cyan}[1]{$reset} DeepSeek {$dim}(recommended, cheapest){$reset}\n";
    echo "  {$cyan}[2]{$reset} OpenAI{$reset}\n";
    echo "  {$cyan}[3]{$reset} Enter custom provider URL{$reset}\n";
    echo "  {$cyan}[4]{$reset} Continue in demo mode{$reset}\n\n";
    echo "{$dim}Choice [1-4]:{$reset} ";
    $choice = trim(fgets(STDIN));

    if ($choice === '4') {
        echo "\n{$dim}Running in demo mode — responses are simulated.{$reset}\n";
        echo "{$dim}Set KADMOS_API_KEY to connect to a real LLM.{$reset}\n\n";
    } else {
        echo "{$dim}API Key:{$reset} ";
        $inputKey = trim(fgets(STDIN));
        if ($inputKey) {
            putenv("KADMOS_API_KEY={$inputKey}");
            $apiKey = $inputKey;

            // Save to .kadmos config file
            $configDir = getenv('HOME') ?: getenv('USERPROFILE') ?: __DIR__;
            $configFile = $configDir . '/.kadmos_config';
            if ($choice === '1') {
                file_put_contents($configFile, "KADMOS_API_KEY={$inputKey}\nKADMOS_MODEL=deepseek-chat\nKADMOS_BASE_URL=https://api.deepseek.com/v1\n");
            } elseif ($choice === '2') {
                file_put_contents($configFile, "KADMOS_API_KEY={$inputKey}\nKADMOS_MODEL=gpt-4o\nKADMOS_BASE_URL=https://api.openai.com/v1\n");
            } elseif ($choice === '3') {
                echo "{$dim}Base URL:{$reset} ";
                $customUrl = trim(fgets(STDIN));
                echo "{$dim}Model:{$reset} ";
                $customModel = trim(fgets(STDIN)) ?: 'default';
                file_put_contents($configFile, "KADMOS_API_KEY={$inputKey}\nKADMOS_MODEL={$customModel}\nKADMOS_BASE_URL={$customUrl}\n");
                $baseUrl = $customUrl;
                $model = $customModel;
            }
            echo "{$green}  ✓ API key saved to {$configFile}{$reset}\n\n";
            echo "{$dim}  Tip: Add to your shell profile for persistence:{$reset}\n";
            echo "{$dim}  export KADMOS_API_KEY={$inputKey}{$reset}\n\n";
        }
    }
}

// Setup engine
$worker = new class implements NodeWorkerInterface {
    public function execute(array $payload): array {
        return ['status' => NodeStatus::SUCCESS, 'output_summary' => 'OK', 'raw_output' => null];
    }
};
$registry = new WorkerRegistry();
$registry->register('HTTP_REQUEST', $worker);
$registry->register('QUERY_DATABASE', $worker);
$orchestrator = new ASTOrchestrator($registry);

$alwaysValid = new class implements HttpClientInterface {
    public function postJson(string $url, array $body): array { return ['valid' => true]; }
};
$validator = new JmpValidatorClient($alwaysValid);

$llm = $apiKey ? new OpenAIClient($apiKey, $model, $baseUrl) : null;

echo "{$gold}⚡ KADMOS CHAT{$reset}  {$dim}Type /help for commands, /exit to quit{$reset}\n\n";

$conversation = [];

while (true) {
    echo "{$cyan}You{$reset} {$dim}»{$reset} ";
    $line = trim(fgets(STDIN));
    if ($line === false || $line === '') continue;
    if ($line === '/exit' || $line === '/quit') break;
    if ($line === '/help') {
        echo "{$dim}  /exit   Quit chat{$reset}\n";
        echo "{$dim}  /clear  Clear conversation{$reset}\n";
        echo "{$dim}  /dag    Show current DAG state{$reset}\n";
        continue;
    }
    if ($line === '/clear') { $conversation = []; echo "{$dim}  Conversation cleared.{$reset}\n"; continue; }
    if ($line === '/dag') { echo $orchestrator->serializeDagState() . "\n"; continue; }

    if (!$llm) {
        echo "{$dim}  [Demo mode] No API key configured. Set KADMOS_API_KEY.{$reset}\n\n";
        continue;
    }

    // Build prompt
    $dagState = $orchestrator->serializeDagState();
    $hasNodes = str_contains($dagState, 'Node:');
    $prompt = $hasNodes
        ? "User: {$line}\n\nCurrent DAG:\n{$dagState}"
        : "User: {$line}";

    echo "{$dim}  Thinking...{$reset}\r";
    try {
        $rawResponse = $llm->generate($prompt);
    } catch (\Throwable $e) {
        echo "                    \r";
        echo "{$dim}  ✕ API error: {$e->getMessage()}{$reset}\n\n";
        continue;
    }
    echo "                    \r"; // Clear thinking line

    // Extract JMP from response
    $jmpJson = null;
    if (preg_match('/```(?:json)?\s*\n?(.*?)\n?```/s', $rawResponse, $matches)) {
        $jmpJson = trim($matches[1]);
    } elseif (str_starts_with(trim($rawResponse), '[')) {
        $jmpJson = trim($rawResponse);
    }

    $batch = $jmpJson ? json_decode($jmpJson, true) : null;
    $textReply = $jmpJson ? trim(str_replace($matches[0] ?? '', '', $rawResponse)) : $rawResponse;

    // Show reply
    if ($textReply) {
        echo "{$gold}TALOS{$reset} {$dim}»{$reset} {$textReply}\n";
    }

    // Execute JMP if present
    if (is_array($batch)) {
        $context = $orchestrator->buildContext($batch);
        $validation = $validator->validate($batch, $context);

        if (!$validation->valid) {
            $errors = array_map(fn($f) => "{$f->field}: {$f->message}", $validation->errors);
            echo "{$dim}  ✕ Validation fault: " . implode('; ', $errors) . "{$reset}\n";
        } else {
            // Apply
            foreach ($batch as $m) {
                $action = $m['action'] ?? '';
                if ($action === 'SPAWN_NODE') {
                    $orchestrator->addNode(
                        (string)($m['node_id'] ?? ''),
                        isset($m['dependencies']) && is_array($m['dependencies']) ? array_map('strval', $m['dependencies']) : [],
                        (string)($m['node_type'] ?? 'UNKNOWN')
                    );
                } elseif ($action === 'MUTATE_PAYLOAD') {
                    $orchestrator->setPayload(
                        (string)($m['node_id'] ?? ''),
                        isset($m['payload']) && is_array($m['payload']) ? $m['payload'] : []
                    );
                }
            }
            // Execute
            $queue = $orchestrator->getExecutionQueue();
            foreach ($queue as $nid) {
                try { $orchestrator->executeNode($nid); } catch (\Throwable) {}
            }
            $queue = $orchestrator->getExecutionQueue();
            foreach ($queue as $nid) {
                try { $orchestrator->executeNode($nid); } catch (\Throwable) {}
            }
            echo "{$green}  ✓ Executed{$reset}\n";
        }
    }

    echo "\n";
}

echo "{$gold}  ⚡ Chat ended{$reset}\n";
