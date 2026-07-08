<?php

declare(strict_types=1);

namespace App\Services\Admin;

use Illuminate\Validation\ValidationException;

final class TalosBackupService
{
    public const SCHEMA_VERSION = 'talos-backup-v1';

    /**
     * @return list<string>
     */
    public static function domains(): array
    {
        return [
            'sessions',
            'messages',
            'runs',
            'run_events',
            'files',
            'context_sets',
            'artifacts',
            'benchmark_groups',
            'model_profiles',
            'connectors',
            'tools',
            'memories',
            'skills',
            'research_reports',
            'documents',
            'productivity',
            'email',
            'policies',
            'audit_events',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function manifest(): array
    {
        return [
            'schema_version' => self::SCHEMA_VERSION,
            'generated_at' => now()->toJSON(),
            'domains' => collect(self::domains())
                ->mapWithKeys(fn (string $domain): array => [$domain => ['included' => true]])
                ->all(),
            'restore_policy' => [
                'dry_run_required' => true,
                'destructive_restore_allowed' => false,
            ],
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function validateRestore(array $payload): array
    {
        if (($payload['schema_version'] ?? null) !== self::SCHEMA_VERSION) {
            throw ValidationException::withMessages([
                'schema_version' => 'Backup schema version is not compatible with this TALOS control plane.',
            ]);
        }

        if (($payload['dry_run'] ?? null) !== true) {
            throw ValidationException::withMessages([
                'dry_run' => 'Backup restore validation requires dry_run=true.',
            ]);
        }

        $domains = is_array($payload['domains'] ?? null) ? $payload['domains'] : [];
        $missingDomains = [];
        foreach (self::domains() as $domain) {
            if (! isset($domains[$domain]) || ! is_array($domains[$domain]) || ($domains[$domain]['included'] ?? null) !== true) {
                $missingDomains[] = $domain;
            }
        }

        if ($missingDomains !== []) {
            throw ValidationException::withMessages([
                'domains' => 'Backup manifest is missing required domains: '.implode(', ', $missingDomains).'.',
            ]);
        }

        return [
            'schema_version' => self::SCHEMA_VERSION,
            'dry_run' => true,
            'compatible' => true,
        ];
    }
}
