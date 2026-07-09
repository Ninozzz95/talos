<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\Cli\GuidedShell;

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testGuidedWelcomeGivesBeginnerMenu(): void
{
    $output = GuidedShell::welcome();

    assertTrue(str_contains($output, 'Kadmos Guided Shell'), 'Welcome should name the guided shell.');
    assertTrue(str_contains($output, '1. Run AVM comparison'), 'Welcome should offer a first-run comparison path.');
    assertTrue(str_contains($output, '2. Ingest a file'), 'Welcome should offer file ingestion as a visible path.');
    assertTrue(str_contains($output, 'kadmos --expert'), 'Welcome should point advanced users to expert mode.');
}

function testExpertHelpDocumentsSlashCommands(): void
{
    $output = GuidedShell::expertHelp();

    foreach (['/help', '/tutorial', '/read', '/search', '/validate', '/execute', '/compare', '/trace', '/fault', '/recover', '/doctor', '/export', '/json', '/expert', '/exit'] as $command) {
        assertTrue(str_contains($output, $command), "Expert help should document {$command}.");
    }

    assertTrue(str_contains($output, '/mode ask|semi|auto|lab|enterprise'), 'Expert help should document all execution modes.');
}

function testTutorialExplainsFirstUsefulRun(): void
{
    $output = GuidedShell::tutorial();

    assertTrue(str_contains($output, 'Step 1'), 'Tutorial should be staged for first-time users.');
    assertTrue(str_contains($output, 'upload'), 'Tutorial should explain file ingestion in plain terms.');
    assertTrue(str_contains($output, 'AVM ON'), 'Tutorial should explain the AVM comparison path.');
    assertTrue(str_contains($output, 'replay'), 'Tutorial should point to trace replay as proof.');
    assertTrue(str_contains($output, 'enterprise'), 'Tutorial should explain enterprise-safe mode.');
}

function testChatReplDocumentsAllExecutionModes(): void
{
    $repl = (string) file_get_contents(__DIR__ . '/../kadmos-chat-repl.php');

    assertTrue(str_contains($repl, "['ask', 'semi', 'auto', 'lab', 'enterprise']"), 'Chat REPL should accept all Phase 13 modes.');
    assertTrue(str_contains($repl, '/mode <ask|semi|auto|lab|enterprise>'), 'Chat REPL help should document all modes.');
}

function testCliRoutesGuidedFlags(): void
{
    $phpBin = getenv('KADMOS_TEST_PHP') ?: PHP_BINARY;
    $cli = __DIR__ . '/../kadmos';

    $expertOutput = [];
    $expertCode = 0;
    exec(escapeshellarg($phpBin) . ' ' . escapeshellarg($cli) . ' --expert 2>&1', $expertOutput, $expertCode);
    $expertText = implode(PHP_EOL, $expertOutput);

    assertTrue($expertCode === 0, 'kadmos --expert should exit 0. Output: ' . $expertText);
    assertTrue(str_contains($expertText, '/compare'), 'kadmos --expert should render slash-command help.');

    $tutorialOutput = [];
    $tutorialCode = 0;
    exec(escapeshellarg($phpBin) . ' ' . escapeshellarg($cli) . ' --tutorial 2>&1', $tutorialOutput, $tutorialCode);
    $tutorialText = implode(PHP_EOL, $tutorialOutput);

    assertTrue($tutorialCode === 0, 'kadmos --tutorial should exit 0. Output: ' . $tutorialText);
    assertTrue(str_contains($tutorialText, 'Step 1'), 'kadmos --tutorial should render the guided tutorial.');
}

function testDefaultCliRoutesToBootAnimationShell(): void
{
    $cli = (string) file_get_contents(__DIR__ . '/../kadmos');
    $defaultStart = strpos($cli, "case '':");
    $nextCase = strpos($cli, "case '--expert':");
    $defaultBlock = substr($cli, $defaultStart, $nextCase - $defaultStart);

    assertTrue($defaultStart !== false && $nextCase !== false, 'Main CLI should handle the empty command before explicit flags.');
    assertTrue(str_contains($defaultBlock, "kadmos-boot-anim.php"), 'Default Kadmos startup should route through the boot animation shell.');
    assertTrue(!str_contains($defaultBlock, "--no-shell"), 'Default Kadmos startup should keep the shell after boot animation.');
    assertTrue(str_contains($cli, "GuidedShell::welcome()") && str_contains($cli, "case '--tutorial':"), 'Guided text should remain available through explicit tutorial/expert paths.');
}

function testDashboardCommandTargetsTalosControlPlaneByDefault(): void
{
    $cli = (string) file_get_contents(__DIR__ . '/../kadmos');

    assertTrue(str_contains($cli, "../control-plane"), 'Dashboard command should target the Laravel control-plane by default.');
    assertTrue(str_contains($cli, 'http://127.0.0.1:8000/'), 'Dashboard command should advertise the canonical Talos workspace URL.');
    assertTrue(!str_contains($cli, 'http://127.0.0.1:8001/chat'), 'Dashboard command should not advertise the retired 8001 chat route.');
    assertTrue(str_contains($cli, "--validator"), 'Dashboard command should keep the legacy validator dashboard behind an explicit flag.');
    assertTrue(str_contains($cli, 'Validator telemetry') && str_contains($cli, 'legacy'), 'Validator dashboard should be described as legacy telemetry, not primary Talos.');
}

function testCompareAndEvidenceAliasesEmitJsonReports(): void
{
    $phpBin = getenv('KADMOS_TEST_PHP') ?: PHP_BINARY;
    $cli = __DIR__ . '/../kadmos';
    $scenario = __DIR__ . '/benchmarks/scenarios/01_simple_http.json';

    foreach (['compare', 'evidence'] as $alias) {
        $output = [];
        $code = 0;
        $command = escapeshellarg($phpBin)
            . ' ' . escapeshellarg($cli)
            . ' ' . $alias
            . ' --scenario=' . escapeshellarg($scenario)
            . ' --runs=1 --json 2>&1';

        exec($command, $output, $code);
        $text = implode(PHP_EOL, $output);
        $report = json_decode($text, true);

        assertTrue($code === 0, "kadmos {$alias} should exit 0. Output: {$text}");
        assertTrue(is_array($report), "kadmos {$alias} --json should emit JSON. Output: {$text}");
        assertTrue(($report['scenario']['name'] ?? null) === 'simple_http_call', "kadmos {$alias} should preserve benchmark compare output.");
    }
}

$tests = [
    'testGuidedWelcomeGivesBeginnerMenu',
    'testExpertHelpDocumentsSlashCommands',
    'testTutorialExplainsFirstUsefulRun',
    'testChatReplDocumentsAllExecutionModes',
    'testCliRoutesGuidedFlags',
    'testDefaultCliRoutesToBootAnimationShell',
    'testDashboardCommandTargetsTalosControlPlaneByDefault',
    'testCompareAndEvidenceAliasesEmitJsonReports',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All CLI guided shell tests passed" . PHP_EOL;
