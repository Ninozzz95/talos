<?php

declare(strict_types=1);

namespace Kadmos\Cli;

final class GuidedShell
{
    public static function welcome(): string
    {
        return implode(PHP_EOL, [
            'Kadmos Guided Shell',
            'Deterministic execution for LLM workflows.',
            '',
            'Choose a path:',
            '1. Run AVM comparison',
            '   kadmos compare --scenario=core/tests/benchmarks/scenarios/01_simple_http.json',
            '2. Ingest a file',
            '   Use Talos or the control-plane API to create a benchmark from your file.',
            '3. Inspect evidence',
            '   kadmos evidence --scenario=core/tests/benchmarks/scenarios/05_deep_chain_failure.json',
            '',
            'New here: kadmos --tutorial',
            'Power user: kadmos --expert',
        ]) . PHP_EOL;
    }

    public static function expertHelp(): string
    {
        return implode(PHP_EOL, [
            'Kadmos Expert Commands',
            '',
            '/help       Show shell help',
            '/tutorial   Start the guided walkthrough',
            '/ingest     Create a scenario from an uploaded or local file',
            '/compare    Run AVM ON/OFF/tool-agent comparison',
            '/evidence   Render enterprise evidence metrics',
            '/report     Open or export the latest report',
            '/json       Print machine-readable output for automation',
            '/expert     Keep advanced commands visible',
            '/exit       Leave the shell',
            '',
            'Automation aliases:',
            'kadmos compare --scenario=<file> [--runs=1] [--json]',
            'kadmos evidence --scenario=<file> [--runs=1] [--json]',
        ]) . PHP_EOL;
    }

    public static function tutorial(): string
    {
        return implode(PHP_EOL, [
            'Kadmos Guided Tutorial',
            '',
            'Step 1 - upload a file or choose a benchmark scenario.',
            'Step 2 - run AVM ON against AVM OFF and the tool-agent baseline.',
            'Step 3 - inspect rejected mutations, blocked nodes, and enterprise risk.',
            'Step 4 - replay the trace to prove what executed and what was stopped.',
            '',
            'Start now:',
            'kadmos compare --scenario=core/tests/benchmarks/scenarios/01_simple_http.json',
        ]) . PHP_EOL;
    }
}
