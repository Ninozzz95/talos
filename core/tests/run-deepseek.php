<?php

declare(strict_types=1);

// KADMOS Main Loop with DeepSeek — real LLM driving the DAG
// Usage: DEEPSEEK_API_KEY=sk-... php tests/run-deepseek.php

require_once __DIR__ . '/../src/NodeStatus.php';
require_once __DIR__ . '/../src/ASTOrchestrator.php';
require_once __DIR__ . '/../src/LLMClientInterface.php';
require_once __DIR__ . '/../src/MockLLM.php';
require_once __DIR__ . '/../src/OpenAIClient.php';
require_once __DIR__ . '/../src/SystemPromptBuilder.php';
require_once __DIR__ . '/../src/ValidationFault.php';
require_once __DIR__ . '/../src/ValidationResult.php';
require_once __DIR__ . '/../src/HttpClientInterface.php';
require_once __DIR__ . '/../src/JmpValidatorClient.php';
require_once __DIR__ . '/../src/MainLoopController.php';
require_once __DIR__ . '/../src/Workers/NodeWorkerInterface.php';
require_once __DIR__ . '/../src/Workers/WorkerRegistry.php';
require_once __DIR__ . '/../src/Workers/HttpRequestWorker.php';

use Kadmos\ASTOrchestrator;
use Kadmos\NodeStatus;
use Kadmos\OpenAIClient;
use Kadmos\JmpValidatorClient;
use Kadmos\HttpClientInterface;
use Kadmos\MainLoopController;
use Kadmos\Workers\WorkerRegistry;
use Kadmos\Workers\NodeWorkerInterface;

$apiKey = getenv('DEEPSEEK_API_KEY');
if (!$apiKey) {
    fwrite(STDERR, "Error: set DEEPSEEK_API_KEY environment variable\n");
    fwrite(STDERR, "  cmd: set DEEPSEEK_API_KEY=sk-...\n");
    fwrite(STDERR, "  bash: export DEEPSEEK_API_KEY=sk-...\n");
    exit(1);
}

// Stub workers that don't make real HTTP calls (for demo)
$stubWorker = new class implements NodeWorkerInterface {
    public function execute(array $payload): array {
        $url = $payload['url'] ?? '?';
        return [
            'status' => NodeStatus::SUCCESS,
            'output_summary' => "200 OK ($url)",
            'raw_output' => '{"ok":true}',
        ];
    }
};

$registry = new WorkerRegistry();
$registry->register('HTTP_REQUEST', $stubWorker);
$registry->register('QUERY_DATABASE', $stubWorker);

$orchestrator = new ASTOrchestrator($registry);

// DeepSeek LLM client
$llm = new OpenAIClient(
    apiKey: $apiKey,
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
);

// Stub HTTP for validator (we don't run a separate Node.js process for this demo)
$alwaysValid = new class implements HttpClientInterface {
    public function postJson(string $url, array $body): array {
        return ['valid' => true];
    }
};

$validator = new JmpValidatorClient($alwaysValid);
$broadcastUrl = 'http://127.0.0.1:3000/broadcast';

echo "╔══════════════════════════════════════╗\n";
echo "║   KADMOS Main Loop — DeepSeek          ║\n";
echo "╠══════════════════════════════════════╣\n";
echo "║ Dashboard: http://127.0.0.1:3000/dashboard\n";
echo "║ Model: deepseek-chat\n";
echo "║ Max cycles: 10\n";
echo "╚══════════════════════════════════════╝\n\n";

echo "Starting in 5 seconds — open the dashboard now!\n";
sleep(5);

$controller = new MainLoopController($orchestrator, $llm, $validator, 10, $broadcastUrl);
$log = $controller->run();

echo "\n╔══════════════════════════════════════╗\n";
echo "║   DONE — " . $controller->getCycleCount() . " cycles run                    ║\n";
echo "╚══════════════════════════════════════╝\n\n";

echo $orchestrator->serializeDagState() . "\n";
