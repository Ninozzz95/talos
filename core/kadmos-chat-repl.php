#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * KADMOS Chat v2 — Tool-augmented with streaming, permissions, and real-time tokens
 * 
 * Usage: kadmos chat [--allow <path>]
 */

require_once __DIR__ . '/src/NodeStatus.php';
require_once __DIR__ . '/src/ASTOrchestrator.php';
require_once __DIR__ . '/src/LLMClientInterface.php';
require_once __DIR__ . '/src/OpenAIClient.php';
require_once __DIR__ . '/src/AnthropicClient.php';
require_once __DIR__ . '/src/SystemPromptBuilder.php';
require_once __DIR__ . '/src/ValidationFault.php';
require_once __DIR__ . '/src/ValidationResult.php';
require_once __DIR__ . '/src/HttpClientInterface.php';
require_once __DIR__ . '/src/JmpValidatorClient.php';
require_once __DIR__ . '/src/Workers/NodeWorkerInterface.php';
require_once __DIR__ . '/src/Workers/WorkerRegistry.php';

use Kadmos\ASTOrchestrator;
use Kadmos\NodeStatus;
use Kadmos\OpenAIClient;
use Kadmos\JmpValidatorClient;
use Kadmos\HttpClientInterface;
use Kadmos\Workers\WorkerRegistry;
use Kadmos\Workers\NodeWorkerInterface;

// ═══════════════════════════════════════
// Config
// ═══════════════════════════════════════

$gold = "\033[38;5;220m"; $cyan = "\033[38;5;51m"; $green = "\033[32m";
$dim = "\033[2m"; $yellow = "\033[33m"; $red = "\033[31m"; $reset = "\033[0m";
$bold = "\033[1m";

// Status bar helpers
function statusBar(int $tokens, int $turns, string $mode, string $model): string {
    global $dim, $green, $yellow, $red, $reset, $cyan;
    $tokDisplay = $tokens > 1000 ? round($tokens / 1000, 1) . 'k' : $tokens;
    $modeColor = match($mode) { 'auto' => $red, 'semi' => $yellow, default => $cyan };
    $modeLabel = strtoupper($mode);
    return "{$dim}⏺{$tokDisplay} tok · {$turns} turns · {$model} · {$modeColor}{$modeLabel}{$reset}{$dim} · /help{$reset}";
}

$apiKey = getenv('KADMOS_API_KEY') ?: getenv('DEEPSEEK_API_KEY') ?: '';
$model = getenv('KADMOS_MODEL') ?: 'deepseek-chat';
$baseUrl = getenv('KADMOS_BASE_URL') ?: 'https://api.deepseek.com/v1';
$allowedPath = null;
$sessionTokens = 0; $turnCount = 0;
$mode = 'semi'; // ask | semi | auto

// Parse flags
$args = $GLOBALS['argv'] ?? [];
foreach ($args as $i => $arg) {
    if ($arg === '--allow' && isset($args[$i + 1])) {
        $allowedPath = realpath($args[$i + 1]) ?: $args[$i + 1];
    }
    if ($arg === '--mode' && isset($args[$i + 1])) {
        $mode = in_array($args[$i + 1], ['ask', 'semi', 'auto']) ? $args[$i + 1] : 'semi';
    }
}

// ═══════════════════════════════════════
// Setup wizard (if no key)
// ═══════════════════════════════════════

if (!$apiKey) {
    echo "{$gold}⚡ KADMOS CHAT — Setup{$reset}\n\n";
    echo "{$dim}No API key configured.{$reset}\n\n";
    echo "{$dim}[1]{$reset} DeepSeek {$dim}(recommended){$reset}\n";
    echo "{$dim}[2]{$reset} OpenAI\n";
    echo "{$dim}[3]{$reset} Demo mode{$reset}\n";
    echo "{$dim}Choice:{$reset} ";
    $choice = trim(fgets(STDIN));
    if ($choice === '3') {
        echo "{$dim}Demo mode active.{$reset}\n\n";
    } else {
        echo "{$dim}API Key:{$reset} ";
        $apiKey = trim(fgets(STDIN));
        if ($apiKey) putenv("KADMOS_API_KEY={$apiKey}");
    }
}

// ═══════════════════════════════════════
// Permission System
// ═══════════════════════════════════════

function checkPermission(string $tool, array $params, string $mode): bool {
    $dangerous = ['exec', 'write_file'];
    $safe = ['read_file', 'list_dir', 'search'];

    if ($mode === 'auto') return true;
    if ($mode === 'semi' && in_array($tool, $safe)) return true;

    // Ask mode or semi with dangerous tool
    global $yellow, $cyan, $dim, $reset;
    $desc = match($tool) {
        'exec' => "Shell: {$params[0]}",
        'write_file' => "Write: {$params[0]}",
        'read_file' => "Read: {$params[0]}",
        default => "$tool: " . implode(', ', $params)
    };
    echo "{$yellow}  ⚡ {$desc}{$reset}\n";
    echo "{$dim}  Allow? [y/N]:{$reset} ";
    $answer = trim(fgets(STDIN));
    return strtolower($answer) === 'y';
}

function tool_read_file(string $path): string {
    if (!file_exists($path)) return "Error: file not found: $path";
    $content = file_get_contents($path);
    $lines = count(explode("\n", $content));
    return "File: $path ({$lines} lines)\n```\n$content\n```";
}

function tool_write_file(string $path, string $content): string {
    $dir = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0777, true);
    file_put_contents($path, $content);
    return "Written to $path";
}

function tool_list_dir(string $path): string {
    if (!is_dir($path)) return "Not a directory: $path";
    $items = scandir($path);
    $out = "Directory: $path\n";
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $full = "$path/$item";
        $out .= is_dir($full) ? "📁 $item/\n" : "📄 $item\n";
    }
    return $out;
}

function tool_exec(string $cmd): string {
    return shell_exec($cmd) ?: '(no output)';
}

function tool_search(string $path, string $pattern): string {
    $cmd = 'grep -rn ' . escapeshellarg($pattern) . ' ' . escapeshellarg($path) . ' 2>/dev/null';
    return shell_exec($cmd) ?: "No matches for '$pattern'";
}

$tools = [
    'read_file' => ['desc' => 'Read a file', 'fn' => 'tool_read_file', 'params' => ['path']],
    'write_file' => ['desc' => 'Write/create a file', 'fn' => 'tool_write_file', 'params' => ['path', 'content']],
    'list_dir' => ['desc' => 'List directory contents', 'fn' => 'tool_list_dir', 'params' => ['path']],
    'exec' => ['desc' => 'Execute shell command', 'fn' => 'tool_exec', 'params' => ['cmd']],
    'search' => ['desc' => 'Search codebase', 'fn' => 'tool_search', 'params' => ['path', 'pattern']],
];

// ═══════════════════════════════════════
// System Prompt
// ═══════════════════════════════════════

$systemPrompt = "You are KADMOS, an AI coding assistant running in the terminal. You are part of the Kadmos Engine ecosystem.\n\n";

// Load self-documentation (always exists)
$docFile = __DIR__ . '/KADMOS.md';
if (file_exists($docFile)) {
    $systemPrompt .= file_get_contents($docFile);
}

$systemPrompt .= "\n\n---\n\nCURRENT SESSION:\n";
$cwd = getcwd();
$systemPrompt .= "You are running in: $cwd\n";

if ($allowedPath) {
    $systemPrompt .= "Working directory: $allowedPath (full read/write access)\n";
} else {
    $systemPrompt .= "File tools are READ-ONLY. Tell user to restart with --allow <path> for write access.\n";
}

$systemPrompt .= "Permission mode: $mode\n";
$systemPrompt .= "IMPORTANT: All file paths are relative to the working directory above. Do NOT add extra parent directories like 'AVM/' — the files are directly in this directory.\n";
$systemPrompt .= "\nTOOL USAGE: Use tools PROACTIVELY. Format:\n```tool\ntool_name\nparam1: value1\n```\n";

// ═══════════════════════════════════════
// Engine setup
// ═══════════════════════════════════════

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

// ═══════════════════════════════════════
// Streaming LLM call
// ═══════════════════════════════════════

function streamGenerate(string $apiKey, string $model, string $baseUrl, string $systemPrompt, array $messages, int &$tokens): string {
    $body = json_encode([
        'model' => $model,
        'messages' => array_merge(
            [['role' => 'system', 'content' => $systemPrompt]],
            $messages
        ),
        'temperature' => 0.0,
        'max_tokens' => 4096,
        'stream' => true,
    ]);

    $ch = curl_init("$baseUrl/chat/completions");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            "Authorization: Bearer $apiKey",
        ],
        CURLOPT_TIMEOUT_MS => 60000,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_WRITEFUNCTION => function($ch, $data) use (&$tokens, &$fullResponse) {
            $lines = explode("\n", $data);
            foreach ($lines as $line) {
                if (str_starts_with($line, 'data: ')) {
                    $json = substr($line, 6);
                    if ($json === '[DONE]') continue;
                    $chunk = json_decode($json, true);
                    $content = $chunk['choices'][0]['delta']['content'] ?? '';
                    if ($content) {
                        echo $content;
                        $fullResponse .= $content;
                    }
                    // Count tokens from usage if present (final chunk)
                    if (isset($chunk['usage']['total_tokens'])) {
                        $tokens += $chunk['usage']['total_tokens'];
                    }
                }
            }
            return strlen($data);
        },
    ]);

    $fullResponse = '';
    curl_exec($ch);
    // Don't call curl_close() — deprecated in PHP 8.5

    // Estimate tokens if not provided by API
    if ($tokens === 0) {
        $tokens = (int)(strlen($fullResponse) / 3.5);
    }
    return $fullResponse;
}

// ═══════════════════════════════════════
// Chat REPL
// ═══════════════════════════════════════

$modeLabel = match($mode) { 'auto' => "{$red}FULL AUTO{$reset}", 'semi' => "{$yellow}SEMI{$reset}", default => "{$cyan}ASK{$reset}" };
echo "{$gold}⚡ KADMOS CHAT{$reset} {$dim}[{$modeLabel}{$dim}]{$reset}";
if ($allowedPath) echo " {$dim}[{$allowedPath}]{$reset}";
echo "  {$dim}/help{$reset}\n\n";

$messages = [];

while (true) {
    // Save cursor, move to bottom, print status bar, restore
    $modeLabel = match($mode) { 'auto' => "{$red}AUTO{$reset}", 'semi' => "{$yellow}SEMI{$reset}", default => "{$cyan}ASK{$reset}" };
    $tokShort = $sessionTokens > 1000 ? round($sessionTokens/1000,1).'k' : $sessionTokens;
    $statusText = $sessionTokens > 0
        ? "{$dim}[{$tokShort} tok | {$turnCount} turns | {$model} | {$modeLabel}{$dim}] /help{$reset}"
        : "{$dim}[/help]{$reset}";
    // Clear bottom line, print status
    echo "\0337\033[999B\033[K{$statusText}\0338";

    // Prompt
    echo "{$cyan}›{$reset} ";
    $line = trim(fgets(STDIN));
    if ($line === false || $line === '') continue;

    // Slash commands
    if (str_starts_with($line, '/')) {
        $parts = explode(' ', $line);
        $cmd = $parts[0];
        $rest = array_slice($parts, 1);

        switch ($cmd) {
            case '/exit': case '/quit':
                echo "{$gold}  ⚡ Session: {$turnCount} turns, {$sessionTokens} tokens{$reset}\n";
                break 2;
            case '/help':
                echo "{$gold}Commands:{$reset}\n";
                echo "  {$cyan}/read <file>{$reset}       {$dim}Read file{$reset}\n";
                echo "  {$cyan}/write <f> <txt>{$reset}   {$dim}Write file{$reset}\n";
                echo "  {$cyan}/ls [path]{$reset}         {$dim}List directory{$reset}\n";
                echo "  {$cyan}/run <cmd>{$reset}         {$dim}Execute shell command{$reset}\n";
                echo "  {$cyan}/search <path> <q>{$reset} {$dim}Search codebase{$reset}\n";
                echo "  {$cyan}/tokens{$reset}            {$dim}Token usage this session{$reset}\n";
                echo "  {$cyan}/dag{$reset}               {$dim}Current DAG state{$reset}\n";
                echo "  {$cyan}/mode <ask|semi|auto>{$reset}{$dim}Change permission mode{$reset}\n";
                echo "  {$cyan}/clear{$reset}             {$dim}Clear conversation{$reset}\n";
                echo "  {$cyan}/exit{$reset}              {$dim}Quit{$reset}\n";
                echo "\n{$dim}  AI also auto-invokes tools — just ask naturally.{$reset}\n";
                echo "{$dim}  Start with --mode auto --allow . for full power.{$reset}\n";
                continue 2;
            case '/read':
                $f = $rest[0] ?? null;
                echo $f ? tool_read_file($f) . "\n" : "Usage: /read <file>\n";
                continue 2;
            case '/write':
                $f = $rest[0] ?? null; $txt = implode(' ', array_slice($rest, 1));
                echo ($f && $txt) ? tool_write_file($f, $txt) . "\n" : "Usage: /write <file> <content>\n";
                continue 2;
            case '/ls':
                echo tool_list_dir($rest[0] ?? '.') . "\n";
                continue 2;
            case '/run':
                $c = implode(' ', $rest);
                echo $c ? "$ " . $c . "\n" . tool_exec($c) . "\n" : "Usage: /run <command>\n";
                continue 2;
            case '/search':
                echo tool_search($rest[0] ?? '.', $rest[1] ?? '') . "\n";
                continue 2;
            case '/mode':
                $newMode = $rest[0] ?? '';
                if (in_array($newMode, ['ask', 'semi', 'auto'])) {
                    $mode = $newMode;
                    $ml = match($mode) { 'auto' => "{$red}AUTO{$reset}", 'semi' => "{$yellow}SEMI{$reset}", default => "{$cyan}ASK{$reset}" };
                    echo "{$dim}Mode: {$ml}{$reset}\n";
                } else {
                    echo "{$dim}Usage: /mode ask|semi|auto{$reset}\n";
                }
                continue 2;
            case '/tokens':
                echo "{$dim}Session: {$sessionTokens} tokens across {$turnCount} turns{$reset}\n";
                continue 2;
            case '/dag':
                echo $orchestrator->serializeDagState() . "\n";
                continue 2;
            case '/clear':
                $messages = []; $turnCount = 0; $sessionTokens = 0;
                echo "{$dim}Cleared.{$reset}\n";
                continue 2;
            default:
                echo "{$dim}Unknown: $cmd — /help{$reset}\n";
                continue 2;
        }
    }

    // Normal chat message
    $messages[] = ['role' => 'user', 'content' => $line];
    $turnCount++;
    $turnTokens = 0;

    echo "{$gold}KADMOS{$reset} {$dim}»{$reset} ";

    if (!$apiKey) {
        echo "{$dim}[Demo] No API key. Set KADMOS_API_KEY.{$reset}\n\n";
        continue;
    }

    try {
        $response = streamGenerate($apiKey, $model, $baseUrl, $systemPrompt, $messages, $turnTokens);
        echo "\n";
    } catch (\Throwable $e) {
        echo "{$red}✕ {$e->getMessage()}{$reset}\n\n";
        continue;
    }

    $sessionTokens += $turnTokens;
    $messages[] = ['role' => 'assistant', 'content' => $response];

    // Check for tool calls in response
    if (preg_match_all('/```tool\n(.*?)```/s', $response, $toolMatches)) {
        foreach ($toolMatches[1] as $toolBlock) {
            $toolLines = explode("\n", trim($toolBlock));
            $toolName = $toolLines[0] ?? '';
            $toolParams = [];
            foreach (array_slice($toolLines, 1) as $tl) {
                if (str_contains($tl, ':')) {
                    [$k, $v] = explode(':', $tl, 2);
                    $toolParams[trim($k)] = trim($v);
                }
            }

            if (isset($tools[$toolName])) {
                $params = array_values($toolParams);
                if (checkPermission($toolName, $params, $mode)) {
                    $fn = $tools[$toolName]['fn'];
                    $result = $fn(...$params);
                    echo "{$dim}{$result}{$reset}\n\n";
                    $messages[] = ['role' => 'user', 'content' => "Tool result ($toolName):\n$result"];
                } else {
                    echo "{$dim}  ✕ Denied{$reset}\n\n";
                    $messages[] = ['role' => 'user', 'content' => "Tool call DENIED by user: $toolName"];
                }
            }
        }
    }

    // Check for JMP
    if (preg_match('/```json\s*\n?(.*?)\n?```/s', $response, $jmpMatches)) {
        $batch = json_decode(trim($jmpMatches[1]), true);
        if (is_array($batch)) {
            $context = $orchestrator->buildContext($batch);
            $validation = $validator->validate($batch, $context);
            if ($validation->valid) {
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
                $queue = $orchestrator->getExecutionQueue();
                foreach ($queue as $nid) {
                    try { $orchestrator->executeNode($nid); } catch (\Throwable) {}
                }
                echo "{$green}  ✓ DAG executed{$reset}\n";
            } else {
                echo "{$red}  ✕ Validation fault{$reset}\n";
            }
        }
    }

    echo "\n";
}

echo "\n{$gold}  ⚡ Session ended — {$turnCount} turns, {$sessionTokens} tokens{$reset}\n";
