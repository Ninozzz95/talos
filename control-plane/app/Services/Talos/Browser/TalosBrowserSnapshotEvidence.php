<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use Kadmos\Tool\ProceduralLoopGuard;

final class TalosBrowserSnapshotEvidence
{
    public const SCHEMA_VERSION = 'talos_browser_tool_snapshot_evidence_v1';

    /**
     * @param  list<array<string, mixed>>  $nodes
     * @return array{schema_version: string, snapshot_id: string, format: string, text_digest: string, nodes: list<array<string, mixed>>}
     */
    public static function value(string $snapshotId, string $format, string $textDigest, array $nodes): array
    {
        return [
            'schema_version' => self::SCHEMA_VERSION,
            'snapshot_id' => $snapshotId,
            'format' => $format,
            'text_digest' => $textDigest,
            'nodes' => array_values($nodes),
        ];
    }

    /** @param list<array<string, mixed>> $nodes */
    public static function canonicalJson(string $snapshotId, string $format, string $textDigest, array $nodes): string
    {
        return ProceduralLoopGuard::canonicalJson(self::value($snapshotId, $format, $textDigest, $nodes));
    }

    /** @param list<array<string, mixed>> $nodes */
    public static function sha256(string $snapshotId, string $format, string $textDigest, array $nodes): string
    {
        return 'sha256:'.hash('sha256', self::canonicalJson($snapshotId, $format, $textDigest, $nodes));
    }
}
