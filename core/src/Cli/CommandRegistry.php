<?php

declare(strict_types=1);

namespace Kadmos\Cli;

final class CommandRegistry
{
    /**
     * @return list<array{id: string, usage: string, description: string, category: string, risk: string, json: bool}>
     */
    public static function all(): array
    {
        return [
            [
                'id' => 'doctor',
                'usage' => 'kadmos doctor [--json]',
                'description' => 'Diagnose local Kadmos, validator, Laravel, provider, and SSL readiness.',
                'category' => 'system',
                'risk' => 'low',
                'json' => true,
            ],
            [
                'id' => 'validate',
                'usage' => 'kadmos validate <file.json> [--mock]',
                'description' => 'Validate a JMP batch through the configured validator; live mode fails closed.',
                'category' => 'validation',
                'risk' => 'low',
                'json' => false,
            ],
            [
                'id' => 'run',
                'usage' => 'kadmos run <scenario.json> --mode=avm-on [--json]',
                'description' => 'Run one benchmark scenario mode and emit the selected evidence lane.',
                'category' => 'execution',
                'risk' => 'medium',
                'json' => true,
            ],
            [
                'id' => 'compare',
                'usage' => 'kadmos compare --scenario=<file> [--runs=1] [--json]',
                'description' => 'Compare AVM ON, AVM OFF direct, and tool-agent baselines with identical inputs.',
                'category' => 'benchmark',
                'risk' => 'medium',
                'json' => true,
            ],
            [
                'id' => 'trace replay',
                'usage' => 'kadmos trace replay <run-id|trace.json> [--json]',
                'description' => 'Replay persisted control-plane trace data or a local trace fixture.',
                'category' => 'run',
                'risk' => 'low',
                'json' => true,
            ],
            [
                'id' => 'fault explain',
                'usage' => 'kadmos fault explain <run-id> --node=<node-id> [--json]',
                'description' => 'Ask the control-plane fault explainer for one run node.',
                'category' => 'run',
                'risk' => 'low',
                'json' => true,
            ],
            [
                'id' => 'recover',
                'usage' => 'kadmos recover <run-id> --node=<node-id> --action=retry_node [--json]',
                'description' => 'Request HMI-first recovery through the control-plane recovery endpoint.',
                'category' => 'run',
                'risk' => 'high',
                'json' => true,
            ],
            [
                'id' => 'files ingest',
                'usage' => 'kadmos files ingest <path> [--dry-run] [--json]',
                'description' => 'Ingest a file through the control plane, or compute a local dry-run checksum.',
                'category' => 'context',
                'risk' => 'medium',
                'json' => true,
            ],
            [
                'id' => 'export benchmark',
                'usage' => 'kadmos export benchmark <benchmark-group-id> [--json]',
                'description' => 'Export an audited TALOS benchmark evidence report through the control plane.',
                'category' => 'report',
                'risk' => 'medium',
                'json' => true,
            ],
        ];
    }

    public static function json(): string
    {
        return Console::json([
            'schema_version' => 1,
            'commands' => self::all(),
        ]);
    }

    public static function renderHelp(): string
    {
        $lines = [
            'Commands:',
            '',
        ];

        foreach (self::all() as $command) {
            $lines[] = sprintf('  %-58s %s', $command['usage'], $command['description']);
        }

        $lines[] = '';
        $lines[] = 'Environment:';
        $lines[] = '  KADMOS_API_KEY              DeepSeek/OpenAI API key';
        $lines[] = '  KADMOS_MODEL                Model name (default: deepseek-chat)';
        $lines[] = '  KADMOS_CONTROL_PLANE_URL    Laravel control-plane URL (default: http://127.0.0.1:8001)';

        return implode(PHP_EOL, $lines) . PHP_EOL;
    }
}
