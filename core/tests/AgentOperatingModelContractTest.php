<?php

declare(strict_types=1);

function assertTrue(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function assertFileContains(string $path, array $needles): void
{
    assertTrue(is_file($path), "{$path} should exist.");

    $contents = (string) file_get_contents($path);
    foreach ($needles as $needle) {
        assertTrue(str_contains($contents, $needle), "{$path} should contain {$needle}.");
    }
}

function testAvmAgentOperatingModelExists(): void
{
    $root = dirname(__DIR__, 2);

    assertFileContains($root . '/AGENTS.md', [
        'AVM Agent Operating Model',
        'Never commit on behalf of the user',
        'Core PHP remains framework-free',
        'Validator Node.js remains stateless',
        'Laravel control-plane owns product state',
        'No fake feature rule',
        'AVM ON/OFF',
    ]);
}

function testExtractionDocumentCoversTransferredPatterns(): void
{
    $root = dirname(__DIR__, 2);

    assertFileContains($root . '/docs/architecture/talos-agent-operating-model.md', [
        'Pattern Extraction Matrix',
        'Tool Routing',
        'Skill-First Work',
        'State And Context Discipline',
        'Typed Tool Response Parsing',
        'Error Handling',
        'Search And Evidence',
        'Memory And Preference Discipline',
        'UI Routing',
        'No Fake Tools',
        'AVM Implementation Rules',
    ]);
}

function testTalosEngineeringSkillExistsInRepo(): void
{
    $root = dirname(__DIR__, 2);

    assertFileContains($root . '/.agents/skills/talos-engineering/SKILL.md', [
        'name: talos-engineering',
        'description: Use when',
        'Core PHP remains framework-free',
        'Validator Node.js remains stateless',
        'Every user-visible feature must be backed by real behavior',
        'No fake feature rule',
        'Run verification before claiming completion',
    ]);
}

$tests = [
    'testAvmAgentOperatingModelExists',
    'testExtractionDocumentCoversTransferredPatterns',
    'testTalosEngineeringSkillExistsInRepo',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All agent operating model contract tests passed" . PHP_EOL;
