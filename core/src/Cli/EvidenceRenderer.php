<?php

declare(strict_types=1);

namespace Kadmos\Cli;

final class EvidenceRenderer
{
    /**
     * @param array<string, mixed> $report
     */
    public static function renderReport(array $report): string
    {
        $reports = isset($report['reports']) && is_array($report['reports'])
            ? $report['reports']
            : [$report];

        $sections = ['Kadmos evidence report'];

        foreach ($reports as $item) {
            if (!is_array($item)) {
                continue;
            }

            $sections[] = self::renderSingleReport($item);
        }

        return implode(PHP_EOL . PHP_EOL, $sections) . PHP_EOL;
    }

    /**
     * @param array<string, mixed> $report
     */
    private static function renderSingleReport(array $report): string
    {
        $scenario = is_array($report['scenario'] ?? null) ? $report['scenario'] : [];
        $modes = is_array($report['modes'] ?? null) ? $report['modes'] : [];
        $winner = self::winner($modes);

        $lines = [
            'Scenario: ' . (string) ($scenario['name'] ?? 'unknown'),
            'Winner: ' . $winner,
            '',
            sprintf(
                "%-18s %-16s %-20s %-16s %-14s %-12s",
                'Mode',
                'Enterprise risk',
                'Contract violations',
                'Recovery score',
                'Determinism',
                'State match',
            ),
            str_repeat('-', 102),
        ];

        foreach ($modes as $mode) {
            if (!is_array($mode)) {
                continue;
            }

            $lines[] = sprintf(
                "%-18s %-16s %-20s %-16s %-14s %-12s",
                (string) ($mode['label'] ?? $mode['mode'] ?? 'unknown'),
                (string) ($mode['enterprise_risk_score'] ?? 'n/a'),
                (string) ($mode['contract_violation_count'] ?? 'n/a'),
                self::percent($mode['recovery_score'] ?? null),
                self::percent($mode['determinism_score'] ?? null),
                !empty($mode['state_match']) ? 'yes' : 'no',
            );
        }

        return implode(PHP_EOL, $lines);
    }

    /**
     * @param array<string, mixed> $modes
     */
    private static function winner(array $modes): string
    {
        $winner = null;
        $winnerScore = PHP_INT_MAX;

        foreach ($modes as $mode) {
            if (!is_array($mode)) {
                continue;
            }

            $risk = (int) ($mode['enterprise_risk_score'] ?? PHP_INT_MAX);
            $violations = (int) ($mode['contract_violation_count'] ?? PHP_INT_MAX);
            $stateMatchPenalty = !empty($mode['state_match']) ? 0 : 1000;
            $score = $risk + ($violations * 100) + $stateMatchPenalty;

            if ($score < $winnerScore) {
                $winnerScore = $score;
                $winner = (string) ($mode['label'] ?? $mode['mode'] ?? 'unknown');
            }
        }

        return $winner ?? 'n/a';
    }

    private static function percent(mixed $value): string
    {
        if (!is_int($value) && !is_float($value)) {
            return 'n/a';
        }

        return (string) round($value * 100) . '%';
    }
}
