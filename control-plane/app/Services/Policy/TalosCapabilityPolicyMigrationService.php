<?php

declare(strict_types=1);

namespace App\Services\Policy;

use App\Models\TalosAuditEvent;
use App\Models\TalosCapabilityGrant;
use App\Models\TalosCapabilityPolicy;
use App\Models\TalosCapabilityPolicySet;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Throwable;

final class TalosCapabilityPolicyMigrationService
{
    public function __construct(
        private readonly TalosCapabilityPolicyContractMapper $mapper,
    ) {}

    /** @return array<string, mixed> */
    public function plan(): array
    {
        /** @var Collection<int, TalosCapabilityPolicy> $policies */
        $policies = TalosCapabilityPolicy::query()->orderBy('id')->get();

        return $this->report($policies, 'dry_run');
    }

    /** @return array<string, mixed> */
    public function apply(string $reportHash): array
    {
        if (! preg_match('/^[a-f0-9]{64}$/', $reportHash)) {
            throw new TalosCapabilityPolicyException(
                'TALOS_CAPABILITY_MIGRATION_REPORT_REQUIRED',
                'Apply requires the exact SHA-256 hash from a current dry-run report.',
                422,
                'report_hash',
            );
        }

        return DB::transaction(function () use ($reportHash): array {
            /** @var Collection<int, TalosCapabilityPolicy> $policies */
            $policies = TalosCapabilityPolicy::query()->orderBy('id')->lockForUpdate()->get();
            $report = $this->report($policies, 'dry_run');
            if (! hash_equals((string) $report['report_hash'], $reportHash)) {
                throw new TalosCapabilityPolicyException(
                    'TALOS_CAPABILITY_MIGRATION_REPORT_STALE',
                    'Stored capability policies changed after the dry-run report. Run the dry-run again.',
                    409,
                    'report_hash',
                    [
                        'expected_report_hash' => $reportHash,
                        'actual_report_hash' => $report['report_hash'],
                    ],
                );
            }
            if ($report['invalid'] !== 0) {
                throw new TalosCapabilityPolicyException(
                    'TALOS_CAPABILITY_MIGRATION_INVALID_STATE',
                    'Capability policy migration is blocked by malformed stored records.',
                    422,
                    null,
                    ['faults' => $report['faults']],
                );
            }

            $setIds = [];
            foreach ($report['items'] as $item) {
                $policy = $policies->firstWhere('id', $item['policy_id']);
                if (! $policy instanceof TalosCapabilityPolicy) {
                    throw new TalosCapabilityPolicyException(
                        'TALOS_CAPABILITY_MIGRATION_POLICY_MISSING',
                        'A policy disappeared while the migration transaction was locked.',
                        409,
                        null,
                        ['policy_id' => $item['policy_id']],
                    );
                }
                $plan = $this->mapper->migrationPlanForPolicy($policy);
                $legacySessionId = $policy->talos_session_id;
                $legacyExpiresAt = $policy->expires_at;
                $policy->forceFill([
                    'actions' => $plan['actions'],
                    'decision' => $plan['decision'],
                    'source' => $plan['source'],
                    'legacy_decision' => $plan['legacy_decision'],
                    'legacy_talos_session_id' => $legacySessionId,
                    'legacy_expires_at' => $legacyExpiresAt,
                    'talos_session_id' => null,
                    'expires_at' => null,
                    'canonicalized_at' => now(),
                ])->save();

                if (is_array($plan['grant'])) {
                    $grant = $plan['grant'];
                    TalosCapabilityGrant::query()->updateOrCreate([
                        'legacy_policy_id' => $policy->id,
                    ], [
                        'policy_set_id' => $policy->policy_set_id,
                        'capability' => $grant['capability'],
                        'tool_id' => $grant['tool_id'],
                        'actions' => $grant['actions'],
                        'scope' => $grant['scope'],
                        'scope_id' => $grant['scope_id'],
                        'status' => $grant['status'],
                        'granted_at' => $grant['granted_at'],
                        'expires_at' => $grant['expires_at'],
                        'risk_acknowledged' => $grant['risk_acknowledged'],
                    ]);
                }
                $setIds[(string) $policy->policy_set_id] = true;
            }

            foreach (array_keys($setIds) as $setId) {
                $set = TalosCapabilityPolicySet::query()->whereKey($setId)->lockForUpdate()->firstOrFail();
                $set->forceFill([
                    'schema_version' => TalosCapabilityPolicySet::PERSISTENCE_SCHEMA_VERSION,
                    'revision' => ((int) $set->revision) + 1,
                ])->save();
                TalosAuditEvent::record(
                    'capability_policy.migrated_v1',
                    'capability_policy_set',
                    $setId,
                    [
                        'schema_version' => TalosCapabilityPolicySet::CONTRACT_SCHEMA_VERSION,
                        'report_hash' => $reportHash,
                        'revision' => (int) $set->revision,
                        'policies_rewritten' => collect($report['items'])
                            ->where('policy_set_id', $setId)
                            ->count(),
                    ],
                    'system',
                    'talos:capability-policies:migrate-v1',
                );
            }

            return [
                ...$report,
                'mode' => 'apply',
                'policy_sets_updated' => count($setIds),
            ];
        });
    }

    /**
     * @param Collection<int, TalosCapabilityPolicy> $policies
     * @return array<string, mixed>
     */
    private function report(Collection $policies, string $mode): array
    {
        $items = [];
        $faults = [];
        foreach ($policies as $policy) {
            if (! $this->requiresMigration($policy)) {
                continue;
            }
            try {
                $plan = $this->mapper->migrationPlanForPolicy($policy);
                $items[] = [
                    'policy_id' => (string) $policy->getKey(),
                    'policy_set_id' => (string) $policy->policy_set_id,
                    'capability' => (string) $policy->capability,
                    'from_decision' => (string) $policy->decision,
                    'to_decision' => $plan['decision'],
                    'source' => $plan['source'],
                    'actions' => $plan['actions'],
                    'grant_scope' => is_array($plan['grant']) ? $plan['grant']['scope'] : null,
                    'grant_status' => is_array($plan['grant']) ? $plan['grant']['status'] : null,
                ];
            } catch (Throwable $exception) {
                $faults[] = [
                    'policy_id' => (string) $policy->getKey(),
                    'capability' => (string) $policy->capability,
                    'code' => $exception instanceof TalosCapabilityPolicyException
                        ? $exception->errorCode
                        : 'TALOS_CAPABILITY_MIGRATION_PLAN_FAILED',
                    'message' => $exception->getMessage(),
                ];
            }
        }

        $hashPayload = [
            'schema_version' => TalosCapabilityPolicySet::CONTRACT_SCHEMA_VERSION,
            'policies_scanned' => $policies->count(),
            'items' => $items,
            'faults' => $faults,
        ];
        $reportHash = hash('sha256', json_encode(
            $hashPayload,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        ));

        return [
            'schema_version' => TalosCapabilityPolicySet::CONTRACT_SCHEMA_VERSION,
            'mode' => $mode,
            'policies_scanned' => $policies->count(),
            'policies_to_rewrite' => count($items),
            'grants_to_create' => count(array_filter(
                $items,
                static fn (array $item): bool => $item['grant_scope'] !== null,
            )),
            'invalid' => count($faults),
            'items' => $items,
            'faults' => $faults,
            'report_hash' => $reportHash,
        ];
    }

    private function requiresMigration(TalosCapabilityPolicy $policy): bool
    {
        if ($policy->canonicalized_at !== null) {
            return false;
        }

        return $policy->source === null
            || $policy->actions === null
            || in_array((string) $policy->decision, ['allow_for_session', 'allow_until_revoked'], true);
    }
}
