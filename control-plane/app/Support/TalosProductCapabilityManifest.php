<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\TalosModelProfile;
use App\Models\User;
use Closure;
use InvalidArgumentException;

final class TalosProductCapabilityManifest
{
    public const CONTRACT = 'talos.product.capabilities.v1';

    public const REVISION = '2026-07-28.2';

    private const STATES = ['available', 'degraded', 'blocked', 'planned'];

    private readonly Closure $recordsForUser;

    /**
     * @param null|Closure(User): list<array<string, mixed>> $recordsForUser
     */
    public function __construct(?Closure $recordsForUser = null)
    {
        $this->recordsForUser = $recordsForUser
            ?? fn (User $user): array => $this->defaultRecords($user);
    }

    /**
     * @return array{
     *     contract: string,
     *     revision: string,
     *     capabilities: list<array{
     *         id: string,
     *         state: 'available'|'degraded'|'blocked'|'planned',
     *         reason: string|null,
     *         evidence: list<string>
     *     }>
     * }
     */
    public function forUser(User $user): array
    {
        $records = ($this->recordsForUser)($user);

        if (! is_array($records) || ! array_is_list($records)) {
            throw new InvalidArgumentException('Capability records must be a JSON-compatible list.');
        }

        $capabilities = [];
        $seen = [];

        foreach ($records as $index => $record) {
            $validated = $this->validateRecord($record, $index);
            if (isset($seen[$validated['id']])) {
                throw new InvalidArgumentException(
                    "Duplicate capability identifier [{$validated['id']}].",
                );
            }

            $seen[$validated['id']] = true;
            $capabilities[] = $validated;
        }

        return [
            'contract' => self::CONTRACT,
            'revision' => self::REVISION,
            'capabilities' => $capabilities,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function defaultRecords(User $user): array
    {
        $hasHealthyModel = TalosModelProfile::query()
            ->where('user_id', $user->getKey())
            ->where('status', 'healthy')
            ->where('show_in_composer', true)
            ->exists();
        $browserConfigured = trim((string) config('services.talos.browser.worker_url', '')) !== '';

        return [
            $hasHealthyModel
                ? $this->available('chat.provider', [
                    'api:POST /api/talos/chat',
                    'database:talos_model_profiles.user_id',
                    'test:TalosChatApiTest',
                ])
                : $this->unavailable(
                    'chat.provider',
                    'blocked',
                    'Add and validate a model profile before sending provider-backed chat messages.',
                    ['api:POST /api/talos/chat', 'database:talos_model_profiles.user_id'],
                ),
            $browserConfigured
                ? $this->available('browser.hmi', [
                    'api:POST /api/talos/browser/sessions',
                    'api:POST /api/talos/browser/sessions/{id}/interactions/pointer',
                    'test:TalosBrowserHmiApiTest',
                ])
                : $this->unavailable(
                    'browser.hmi',
                    'blocked',
                    'Configure the TALOS browser worker before starting an interactive browsing session.',
                    ['config:TALOS_BROWSER_WORKER_URL', 'test:BrowserWorkerProductionConfigurationTest'],
                ),
            $this->available('benchmarks.avm', [
                'api:GET /api/talos/benchmark-groups',
                'api:POST /api/talos/runs/{id}/benchmark',
                'test:BenchmarkComparisonApiTest',
            ]),
            $this->available('files.ingestion', [
                'api:POST /api/talos/files',
                'api:GET /api/talos/files/{id}',
                'test:SecureFileIngestionTest',
            ]),
            $this->available('models.profiles', [
                'api:GET /api/talos/model-profiles',
                'api:POST /api/talos/model-profiles/{id}/probe',
                'test:TalosModelProfileApiTest',
            ]),
            $this->available('runs.replay', [
                'api:GET /api/talos/runs/{id}/replay',
                'api:POST /api/talos/runs/{id}/recover',
                'test:TraceReplayApiTest',
            ]),
            $this->available('settings.workspace', [
                'api:GET /api/talos/settings',
                'api:PATCH /api/talos/settings',
                'test:TalosSettingsApiTest',
            ]),
            $hasHealthyModel
                ? $this->unavailable(
                    'chat.streaming',
                    'degraded',
                    'Automated streaming gates pass; real-provider and human acceptance remain open before full promotion.',
                    [
                        'api:POST /api/talos/chat/stream',
                        'api:POST /api/talos/runs/{id}/cancel',
                        'test:TalosChatStreamApiTest',
                        'e2e:talosStreamingChat.e2e.spec.ts',
                    ],
                )
                : $this->unavailable(
                    'chat.streaming',
                    'blocked',
                    'Add and validate a model profile before using incremental provider-backed chat.',
                    [
                        'api:POST /api/talos/chat/stream',
                        'database:talos_model_profiles.user_id',
                    ],
                ),
            $this->unavailable(
                'models.local_runtime',
                'planned',
                'Forge-managed local model download and serving is not yet promoted as a desktop runtime capability.',
                ['roadmap:P6-local-runtime'],
            ),
            $this->unavailable(
                'models.multi_model_orchestration',
                'planned',
                'Coordinated execution across multiple models remains a roadmap capability until its runtime gate passes.',
                ['roadmap:P6-multi-model-orchestration'],
            ),
            $this->unavailable(
                'speech.local_tts',
                'planned',
                'Local text-to-speech is on the desktop parity roadmap.',
                ['roadmap:P2-local-tts'],
            ),
            $this->unavailable(
                'reasoning.visible',
                'planned',
                'A provider-neutral visible reasoning summary contract is on the desktop parity roadmap.',
                ['roadmap:P3-visible-reasoning'],
            ),
            $this->unavailable(
                'integrations.google_workspace',
                'degraded',
                'Google Drive and Calendar are available while the complete acceptance gate remains open.',
                [
                    'api:GET /api/talos/google/accounts',
                    'api:GET /api/talos/google/drive/files',
                    'api:POST /api/talos/google/calendar/sync',
                    'test:TalosGoogleIntegrationTest',
                ],
            ),
            $this->unavailable(
                'memory.supermemory',
                'planned',
                'Supermemory integration remains a roadmap capability.',
                ['roadmap:P8-supermemory'],
            ),
        ];
    }

    /**
     * @param mixed $record
     * @return array{
     *     id: string,
     *     state: 'available'|'degraded'|'blocked'|'planned',
     *     reason: string|null,
     *     evidence: list<string>
     * }
     */
    private function validateRecord(mixed $record, int $index): array
    {
        if (! is_array($record)) {
            throw new InvalidArgumentException("Capability record [{$index}] must be an object.");
        }

        $keys = array_keys($record);
        sort($keys);
        if ($keys !== ['evidence', 'id', 'reason', 'state']) {
            throw new InvalidArgumentException(
                "Capability record [{$index}] must contain only id, state, reason, and evidence.",
            );
        }

        $id = $record['id'];
        if (! is_string($id) || preg_match('/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/', $id) !== 1) {
            throw new InvalidArgumentException("Capability record [{$index}] has an invalid identifier.");
        }

        $state = $record['state'];
        if (! is_string($state) || ! in_array($state, self::STATES, true)) {
            throw new InvalidArgumentException("Unknown capability state for [{$id}].");
        }

        $reason = $record['reason'];
        if ($state === 'available' && $reason !== null) {
            throw new InvalidArgumentException("Available capability [{$id}] must not include a blocking reason.");
        }
        if ($state !== 'available' && (! is_string($reason) || trim($reason) === '')) {
            throw new InvalidArgumentException("Capability [{$id}] requires a non-empty reason outside available state.");
        }

        $evidence = $record['evidence'];
        if (! is_array($evidence) || ! array_is_list($evidence) || $evidence === []) {
            throw new InvalidArgumentException("Capability [{$id}] requires registered evidence.");
        }

        $normalizedEvidence = [];
        foreach ($evidence as $entry) {
            if (! is_string($entry) || trim($entry) === '') {
                throw new InvalidArgumentException("Capability [{$id}] has invalid evidence.");
            }
            $normalizedEvidence[] = trim($entry);
        }
        if (count($normalizedEvidence) !== count(array_unique($normalizedEvidence))) {
            throw new InvalidArgumentException("Capability [{$id}] has duplicate evidence.");
        }

        /** @var 'available'|'degraded'|'blocked'|'planned' $state */
        return [
            'id' => $id,
            'state' => $state,
            'reason' => $reason === null ? null : trim($reason),
            'evidence' => $normalizedEvidence,
        ];
    }

    /**
     * @param list<string> $evidence
     * @return array{id:string,state:string,reason:null,evidence:list<string>}
     */
    private function available(string $id, array $evidence): array
    {
        return [
            'id' => $id,
            'state' => 'available',
            'reason' => null,
            'evidence' => $evidence,
        ];
    }

    /**
     * @param 'degraded'|'blocked'|'planned' $state
     * @param list<string> $evidence
     * @return array{id:string,state:string,reason:string,evidence:list<string>}
     */
    private function unavailable(string $id, string $state, string $reason, array $evidence): array
    {
        return [
            'id' => $id,
            'state' => $state,
            'reason' => $reason,
            'evidence' => $evidence,
        ];
    }
}
