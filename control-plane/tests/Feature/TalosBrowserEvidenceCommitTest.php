<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserEvidenceBundle;
use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTask;
use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Models\TalosSession;
use App\Models\TalosToolCall;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use App\Services\Talos\Browser\TalosBrowserEvidenceCommitRequest;
use App\Services\Talos\Browser\TalosBrowserEvidenceCommitService;
use App\Services\Talos\Browser\TalosBrowserEvidenceException;
use App\Services\Talos\Browser\TalosBrowserEvidenceOutbox;
use App\Services\Talos\Browser\TalosBrowserRunArtifactCorrelator;
use App\Services\Talos\Browser\TalosBrowserTaskRuntime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Kadmos\Browser\Contract\BrowserEvidenceBundle;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ToolResult;
use PHPUnit\Framework\Attributes\DataProvider;
use Ramsey\Uuid\Uuid;
use Tests\TestCase;

final class TalosBrowserEvidenceCommitTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $fake = Storage::fake('b5-evidence-'.str()->uuid());
        Storage::set('local', $fake);
    }

    public function test_commit_emits_a_core_v1_conformant_claim_bundle_and_resume_is_idempotent(): void
    {
        $context = $this->context();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            json_encode([
                'format' => 'accessibility_refs_v1',
                'url' => 'https://example.test/vehicles',
                'title' => 'Vehicles',
                'textDigest' => hash('sha256', 'Vehicles'),
                'nodes' => [],
            ], JSON_THROW_ON_ERROR),
            ['format' => 'accessibility_refs_v1', 'text_digest' => hash('sha256', 'Vehicles'), 'node_count' => 0],
            [
                'source_command_id' => $context['call']->provider_call_id,
                'source_state_version' => 1,
                'trust_boundary' => 'untrusted_browser_content',
                'state_version' => 1,
            ],
        );
        $this->linkArtifactToRun($context, (string) $artifact->id, (string) $artifact->sha256);
        $result = $this->toolResult($context['call'], (string) $artifact->id, (string) $artifact->sha256, 'snapshot');

        $request = $this->request($context, $result);
        $bundle = $this->app->make(TalosBrowserEvidenceCommitService::class)->commit($request);
        $duplicate = $this->app->make(TalosBrowserEvidenceCommitService::class)->commit($request);

        self::assertSame((string) $bundle->id, (string) $duplicate->id);
        self::assertNull($bundle->reconciled_at);
        self::assertSame('committed', $context['action']->refresh()->status);
        self::assertCount(1, $bundle->claims);
        self::assertSame((string) $artifact->id, $bundle->claims[0]['source_artifact_id']);
        BrowserEvidenceBundle::fromArray($this->canonicalBundle($bundle));

        $first = $this->app->make(TalosBrowserEvidenceOutbox::class)->resume((string) $bundle->id);
        $replay = $this->app->make(TalosBrowserEvidenceOutbox::class)->resume((string) $bundle->id);

        self::assertSame('reconciled', $first->state);
        self::assertFalse($first->replayed);
        self::assertTrue($replay->replayed);
        self::assertNotNull($bundle->refresh()->reconciled_at);
        self::assertSame('evidence_committed', $context['action']->refresh()->status);
        self::assertSame(1, TalosBrowserEvidenceBundle::query()->where('action_id', $context['action']->id)->count());
    }

    public function test_verifier_rejects_screenshot_bytes_spoofing_the_declared_png_mime(): void
    {
        $this->assertInvalidScreenshotEvidence('not a png', 1280, 800);
    }

    public function test_verifier_rejects_png_dimensions_that_do_not_match_the_committed_bundle(): void
    {
        $this->assertInvalidScreenshotEvidence($this->png(), 1280, 800);
    }

    public function test_verifier_rejects_tampered_bytes_and_leaves_the_bundle_unreconciled(): void
    {
        $context = $this->context();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            '{"format":"accessibility_refs_v1","nodes":[]}',
            ['format' => 'accessibility_refs_v1', 'node_count' => 0],
            [
                'source_command_id' => $context['call']->provider_call_id,
                'source_state_version' => 1,
                'trust_boundary' => 'untrusted_browser_content',
                'state_version' => 1,
            ],
        );
        $this->linkArtifactToRun($context, (string) $artifact->id, (string) $artifact->sha256);
        $result = $this->toolResult($context['call'], (string) $artifact->id, (string) $artifact->sha256, 'snapshot');
        $bundle = $this->app->make(TalosBrowserEvidenceCommitService::class)->commit($this->request($context, $result));
        Storage::disk('local')->put((string) $artifact->storage_path, '{"tampered":true}');

        try {
            $this->app->make(TalosBrowserEvidenceOutbox::class)->resume((string) $bundle->id);
            self::fail('Tampered Browser evidence was reconciled.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_INTEGRITY_FAILED', $exception->faultCode);
        }

        self::assertNull($bundle->refresh()->reconciled_at);
        self::assertSame('committed', $context['action']->refresh()->status);
        self::assertSame('recovery_required', $context['browser']->refresh()->status);
    }

    public function test_commit_rejects_a_claimed_artifact_missing_from_the_owned_scope(): void
    {
        $context = $this->context();
        $missingId = (string) str()->uuid();
        $result = $this->toolResult($context['call'], $missingId, hash('sha256', 'missing'), 'snapshot');

        try {
            $this->app->make(TalosBrowserEvidenceCommitService::class)->commit($this->request($context, $result));
            self::fail('An unowned evidence claim was committed.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_SOURCE_MISSING', $exception->faultCode);
        }

        self::assertDatabaseCount('talos_browser_evidence_bundles', 0);
    }

    public function test_correlator_rejects_a_provider_call_missing_from_the_owned_turn(): void
    {
        $context = $this->context();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            '{"format":"accessibility_refs_v1","nodes":[]}',
            ['format' => 'accessibility_refs_v1', 'node_count' => 0],
            [
                'source_command_id' => $context['call']->provider_call_id,
                'source_state_version' => 1,
                'trust_boundary' => 'untrusted_browser_content',
                'state_version' => 1,
            ],
        );

        try {
            $this->app->make(TalosBrowserRunArtifactCorrelator::class)->correlate(
                $context['turn'],
                $context['browser'],
                $artifact,
                'provider-call-not-in-journal',
            );
            self::fail('A Browser artifact was correlated to a provider call missing from the persisted turn.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', $exception->faultCode);
        }

        self::assertDatabaseCount('talos_run_artifacts', 0);
    }

    public function test_correlator_uses_one_deterministic_link_identity_on_replay(): void
    {
        $context = $this->context();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            '{"format":"accessibility_refs_v1","nodes":[]}',
            ['format' => 'accessibility_refs_v1', 'node_count' => 0],
            [
                'source_command_id' => $context['call']->provider_call_id,
                'source_state_version' => 1,
                'trust_boundary' => 'untrusted_browser_content',
                'state_version' => 1,
            ],
        );
        $expectedId = (string) Uuid::uuid5(
            Uuid::NAMESPACE_URL,
            implode(':', [
                'talos.browser.run-artifact-link.v1',
                $context['run']->id,
                $artifact->id,
                $context['turn']->id,
                $context['call']->provider_call_id,
            ]),
        );
        $correlator = $this->app->make(TalosBrowserRunArtifactCorrelator::class);

        $first = $correlator->correlate($context['turn'], $context['browser'], $artifact, $context['call']->provider_call_id);
        $replay = $correlator->correlate($context['turn'], $context['browser'], $artifact, $context['call']->provider_call_id);

        self::assertSame($expectedId, (string) $first->id);
        self::assertSame((string) $first->id, (string) $replay->id);
        self::assertSame(1, TalosRunArtifact::query()->where('uri', 'talos-browser-artifact://'.$artifact->id)->count());
    }

    public function test_correlator_rejects_a_partially_bound_existing_link(): void
    {
        $context = $this->context();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            '{"format":"accessibility_refs_v1","nodes":[]}',
            ['format' => 'accessibility_refs_v1', 'node_count' => 0],
            [
                'source_command_id' => $context['call']->provider_call_id,
                'source_state_version' => 1,
                'trust_boundary' => 'untrusted_browser_content',
                'state_version' => 1,
            ],
        );
        TalosRunArtifact::query()->create([
            'run_id' => $context['run']->id,
            'artifact_type' => 'browser_snapshot',
            'uri' => 'talos-browser-artifact://'.$artifact->id,
            'mime_type' => 'application/json',
            'metadata' => [
                'browser_artifact_id' => $artifact->id,
                'browser_session_id' => $context['browser']->id,
                'tool_turn_id' => $context['turn']->id,
                'sha256' => $artifact->sha256,
                'trust' => 'untrusted',
            ],
        ]);

        try {
            $this->app->make(TalosBrowserRunArtifactCorrelator::class)->correlate(
                $context['turn'],
                $context['browser'],
                $artifact,
                $context['call']->provider_call_id,
            );
            self::fail('A partial Browser correlation was ignored and replaced.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', $exception->faultCode);
        }

        self::assertSame(1, TalosRunArtifact::query()->where('uri', 'talos-browser-artifact://'.$artifact->id)->count());
    }

    public function test_commit_rejects_a_generic_run_artifact_as_browser_evidence(): void
    {
        $context = $this->context();
        $sha256 = hash('sha256', 'unrelated run evidence');
        $artifact = TalosRunArtifact::query()->create([
            'run_id' => $context['run']->id,
            'artifact_type' => 'web_search_result',
            'uri' => 'talos-tool-evidence://'.hash('sha256', 'unrelated'),
            'mime_type' => 'application/json',
            'metadata' => [
                'tool_turn_id' => $context['turn']->id,
                'provider_call_id' => $context['call']->provider_call_id,
                'sha256' => 'sha256:'.$sha256,
                'trust' => 'untrusted',
            ],
        ]);
        $result = $this->toolResult($context['call'], (string) $artifact->id, $sha256, 'snapshot');

        try {
            $this->app->make(TalosBrowserEvidenceCommitService::class)->commit($this->request($context, $result));
            self::fail('Generic run evidence was relabeled as Browser evidence.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', $exception->faultCode);
        }

        self::assertDatabaseCount('talos_browser_evidence_bundles', 0);
    }

    public function test_commit_rejects_a_call_whose_parent_turn_is_outside_the_browser_task_scope(): void
    {
        $context = $this->context();
        $foreignRun = TalosRun::query()->create([
            'user_id' => $context['user']->id,
            'session_id' => $context['run']->session_id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Foreign turn.'),
            'prompt' => 'Foreign turn.',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $foreignBrowser = TalosBrowserSession::query()->create([
            'user_id' => $context['user']->id,
            'talos_session_id' => $context['run']->session_id,
            'worker_session_id' => 'worker-foreign-turn-'.str()->uuid(),
            'status' => 'active',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true],
            'policy' => [],
            'worker_state_version' => 1,
            'expires_at' => now()->addHour(),
        ]);
        $foreignTurn = TalosToolTurn::query()->create([
            'user_id' => $context['user']->id,
            'session_id' => $context['run']->session_id,
            'browser_session_id' => $foreignBrowser->id,
            'run_id' => $foreignRun->id,
            'status' => 'running',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'adapter_version' => 'test',
            'pending_tool_call_ids' => [],
            'budget_policy' => [],
            'budget_usage' => [],
            'revision' => 0,
            'started_at' => now(),
        ]);
        $context['call']->forceFill(['tool_turn_id' => $foreignTurn->id])->save();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            '{"format":"accessibility_refs_v1","nodes":[]}',
            ['format' => 'accessibility_refs_v1', 'node_count' => 0],
            ['trust_boundary' => 'untrusted_browser_content', 'state_version' => 1],
        );
        $context['turn'] = $foreignTurn;
        $this->linkArtifactToRun($context, (string) $artifact->id, (string) $artifact->sha256);
        $result = $this->toolResult($context['call'], (string) $artifact->id, (string) $artifact->sha256, 'snapshot');

        try {
            $this->app->make(TalosBrowserEvidenceCommitService::class)->commit($this->request($context, $result));
            self::fail('A Browser call was committed through a parent turn outside the task Browser session.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', $exception->faultCode);
        }

        self::assertDatabaseCount('talos_browser_evidence_bundles', 0);
    }

    public function test_commit_rejects_session_page_identity_newer_than_the_source_artifact(): void
    {
        $context = $this->context();
        $context['call']->forceFill([
            'tool_name' => 'browser_take_screenshot',
            'node_type' => 'TOOL_BROWSER_SCREENSHOT',
        ])->save();
        $context['action']->forceFill([
            'kind' => 'screenshot',
            'expected_state_version' => 2,
        ])->save();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'screenshot',
            'image/png',
            $this->png(),
            ['width' => 1, 'height' => 1, 'state_version' => 1],
            ['trust_boundary' => 'untrusted_browser_content', 'state_version' => 1],
        );
        $this->linkArtifactToRun($context, (string) $artifact->id, (string) $artifact->sha256, 'screenshot', 'image/png');
        $context['browser']->forceFill([
            'worker_state_version' => 2,
            'current_url' => 'https://example.test/later-page',
            'current_title' => 'Later page',
        ])->save();
        $result = $this->toolResult($context['call'], (string) $artifact->id, (string) $artifact->sha256, 'screenshot');

        try {
            $this->app->make(TalosBrowserEvidenceCommitService::class)->commit($this->request($context, $result));
            self::fail('A newer mutable Browser session was used as page identity for older evidence.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', $exception->faultCode);
        }

        self::assertDatabaseCount('talos_browser_evidence_bundles', 0);
    }

    public function test_commit_rejects_evidence_from_a_later_worker_state(): void
    {
        $context = $this->context();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            json_encode([
                'format' => 'accessibility_refs_v1',
                'url' => 'https://example.test/vehicles',
                'title' => 'Vehicles',
                'nodes' => [],
            ], JSON_THROW_ON_ERROR),
            ['url' => 'https://example.test/vehicles', 'title' => 'Vehicles'],
            ['trust_boundary' => 'untrusted_browser_content', 'state_version' => 2],
        );
        $context['browser']->forceFill(['worker_state_version' => 2])->save();
        $this->linkArtifactToRun($context, (string) $artifact->id, (string) $artifact->sha256);
        $result = $this->toolResult($context['call'], (string) $artifact->id, (string) $artifact->sha256, 'snapshot');

        try {
            $this->app->make(TalosBrowserEvidenceCommitService::class)->commit($this->request($context, $result));
            self::fail('Evidence from a later Browser state was attached to an earlier read action.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', $exception->faultCode);
        }

        self::assertDatabaseCount('talos_browser_evidence_bundles', 0);
    }

    public function test_commit_recalculates_the_supplied_tool_result_digest(): void
    {
        $context = $this->context();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            json_encode([
                'format' => 'accessibility_refs_v1',
                'url' => 'https://example.test/vehicles',
                'title' => 'Vehicles',
                'nodes' => [],
            ], JSON_THROW_ON_ERROR),
            ['url' => 'https://example.test/vehicles', 'title' => 'Vehicles'],
            ['trust_boundary' => 'untrusted_browser_content', 'state_version' => 1],
        );
        $this->linkArtifactToRun($context, (string) $artifact->id, (string) $artifact->sha256);
        $original = $this->toolResult($context['call'], (string) $artifact->id, (string) $artifact->sha256, 'snapshot');
        $request = $this->request($context, $original);
        $tampered = new ToolResult(
            toolUseId: $original->toolUseId,
            isError: false,
            content: [['type' => 'text', 'text' => '{"tampered":true}']],
            structuredContent: ['tampered' => true, 'evidence_ids' => [(string) $artifact->id]],
            evidence: $original->evidence,
        );

        try {
            $this->app->make(TalosBrowserEvidenceCommitService::class)->commit(new TalosBrowserEvidenceCommitRequest(
                task: $context['task'],
                action: $context['action'],
                call: $context['call'],
                result: $tampered,
                browserSession: $context['browser'],
                resultSha256: $request->resultSha256,
            ));
            self::fail('A substituted ToolResult reused the persisted action digest.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_SCOPE_INVALID', $exception->faultCode);
        }

        self::assertDatabaseCount('talos_browser_evidence_bundles', 0);
    }

    public function test_commit_rejects_conflicting_page_identity_sources(): void
    {
        $context = $this->context();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            json_encode([
                'format' => 'accessibility_refs_v1',
                'url' => 'https://example.test/vehicles',
                'title' => 'Vehicles',
                'nodes' => [],
            ], JSON_THROW_ON_ERROR),
            ['url' => 'https://example.test/account', 'title' => 'Account'],
            ['trust_boundary' => 'untrusted_browser_content', 'state_version' => 1],
        );
        $this->linkArtifactToRun($context, (string) $artifact->id, (string) $artifact->sha256);
        $result = $this->toolResult($context['call'], (string) $artifact->id, (string) $artifact->sha256, 'snapshot');

        try {
            $this->app->make(TalosBrowserEvidenceCommitService::class)->commit($this->request($context, $result));
            self::fail('Conflicting page identities were accepted with first-source-wins semantics.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', $exception->faultCode);
        }

        self::assertDatabaseCount('talos_browser_evidence_bundles', 0);
    }

    /** @param array{type: string, mime: string, sha256: string} $mutation */
    #[DataProvider('noncanonicalCorrelatorArtifactProvider')]
    public function test_correlator_rejects_noncanonical_artifacts_before_writing_a_run_link(array $mutation): void
    {
        $context = $this->context();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            '{"format":"accessibility_refs_v1","nodes":[]}',
            ['format' => 'accessibility_refs_v1'],
            [
                'source_command_id' => $context['call']->provider_call_id,
                'source_state_version' => 1,
                'trust_boundary' => 'untrusted_browser_content',
                'state_version' => 1,
            ],
        );
        $artifact->forceFill($mutation)->save();

        try {
            $this->app->make(TalosBrowserRunArtifactCorrelator::class)->correlate(
                $context['turn'],
                $context['browser'],
                $artifact,
                $context['call']->provider_call_id,
            );
            self::fail('A noncanonical Browser artifact created a durable run link.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', $exception->faultCode);
        }

        self::assertDatabaseCount('talos_run_artifacts', 0);
    }

    public function test_correlator_rejects_tampered_artifact_bytes_before_writing_a_run_link(): void
    {
        $context = $this->context();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            '{"format":"accessibility_refs_v1","nodes":[]}',
            ['format' => 'accessibility_refs_v1'],
            [
                'source_command_id' => $context['call']->provider_call_id,
                'source_state_version' => 1,
                'trust_boundary' => 'untrusted_browser_content',
                'state_version' => 1,
            ],
        );
        Storage::disk('local')->put(
            (string) $artifact->storage_path,
            str_repeat('x', (int) $artifact->metadata['size_bytes']),
        );

        try {
            $this->app->make(TalosBrowserRunArtifactCorrelator::class)->correlate(
                $context['turn'],
                $context['browser'],
                $artifact,
                $context['call']->provider_call_id,
            );
            self::fail('Tampered Browser artifact bytes created a durable run link.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_INTEGRITY_FAILED', $exception->faultCode);
        }

        self::assertDatabaseCount('talos_run_artifacts', 0);
    }

    public function test_correlator_rejects_spoofed_png_bytes_before_writing_a_run_link(): void
    {
        $context = $this->context();
        $context['call']->forceFill([
            'tool_name' => 'browser_take_screenshot',
            'capability' => 'browser.screenshot',
        ])->save();
        $context['action']->forceFill(['kind' => 'screenshot'])->save();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'screenshot',
            'image/png',
            'not a png',
            ['width' => 1, 'height' => 1],
            [
                'source_command_id' => $context['call']->provider_call_id,
                'source_state_version' => 1,
                'trust_boundary' => 'untrusted_browser_content',
                'state_version' => 1,
            ],
        );

        try {
            $this->app->make(TalosBrowserRunArtifactCorrelator::class)->correlate(
                $context['turn'],
                $context['browser'],
                $artifact,
                $context['call']->provider_call_id,
            );
            self::fail('Spoofed PNG bytes created a durable Browser screenshot link.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_INTEGRITY_FAILED', $exception->faultCode);
        }

        self::assertDatabaseCount('talos_run_artifacts', 0);
    }

    public function test_correlator_rejects_an_artifact_from_the_wrong_action_output_state_before_writing_a_run_link(): void
    {
        $context = $this->context();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            '{"format":"accessibility_refs_v1","nodes":[]}',
            ['format' => 'accessibility_refs_v1'],
            [
                'source_command_id' => $context['call']->provider_call_id,
                'source_state_version' => 1,
                'trust_boundary' => 'untrusted_browser_content',
                'state_version' => 2,
            ],
        );

        try {
            $this->app->make(TalosBrowserRunArtifactCorrelator::class)->correlate(
                $context['turn'],
                $context['browser'],
                $artifact,
                $context['call']->provider_call_id,
            );
            self::fail('A Browser artifact from the wrong action output state created a durable run link.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', $exception->faultCode);
        }

        self::assertDatabaseCount('talos_run_artifacts', 0);
    }

    public function test_correlator_rejects_an_artifact_from_another_same_state_command_before_writing_a_run_link(): void
    {
        $context = $this->context();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            '{"format":"accessibility_refs_v1","nodes":[]}',
            ['format' => 'accessibility_refs_v1'],
            [
                'source_command_id' => 'provider-other-same-state-read',
                'source_state_version' => 1,
                'trust_boundary' => 'untrusted_browser_content',
                'state_version' => 1,
            ],
        );

        try {
            $this->app->make(TalosBrowserRunArtifactCorrelator::class)->correlate(
                $context['turn'],
                $context['browser'],
                $artifact,
                $context['call']->provider_call_id,
            );
            self::fail('A same-state Browser artifact from another command created a durable run link.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', $exception->faultCode);
        }

        self::assertDatabaseCount('talos_run_artifacts', 0);
    }

    public function test_correlator_rejects_read_artifact_not_bound_as_call_snapshot_even_at_same_state(): void
    {
        $context = $this->context();
        $context['call']->forceFill([
            'tool_name' => 'browser_read',
        ])->save();
        $context['action']->forceFill(['kind' => 'read'])->save();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            '{"format":"accessibility_refs_v1","nodes":[]}',
            ['format' => 'accessibility_refs_v1'],
            [
                'source_command_id' => 'provider-earlier-snapshot',
                'source_state_version' => 1,
                'trust_boundary' => 'untrusted_browser_content',
                'state_version' => 1,
            ],
        );
        $decoy = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            '{"format":"accessibility_refs_v1","nodes":[{"ref":"other"}]}',
            ['format' => 'accessibility_refs_v1'],
            [
                'source_command_id' => 'provider-decoy-snapshot',
                'source_state_version' => 1,
                'trust_boundary' => 'untrusted_browser_content',
                'state_version' => 1,
            ],
        );
        $context['call']->forceFill([
            'evidence_snapshot_artifact_id' => $decoy->id,
            'evidence_hash' => 'sha256:'.$artifact->sha256,
        ])->save();

        try {
            $this->app->make(TalosBrowserRunArtifactCorrelator::class)->correlate(
                $context['turn'],
                $context['browser'],
                $artifact,
                $context['call']->provider_call_id,
            );
            self::fail('A Browser read correlated a same-state snapshot outside its persisted evidence fence.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_SOURCE_INVALID', $exception->faultCode);
        }

        self::assertDatabaseCount('talos_run_artifacts', 0);
    }

    /** @return array<string, array{array{type: string, mime: string, sha256: string}}> */
    public static function noncanonicalCorrelatorArtifactProvider(): array
    {
        return [
            'unsupported type' => [['type' => 'html', 'mime' => 'application/json', 'sha256' => hash('sha256', 'valid')]],
            'mismatched MIME' => [['type' => 'snapshot', 'mime' => 'text/plain', 'sha256' => hash('sha256', 'valid')]],
            'malformed digest' => [['type' => 'snapshot', 'mime' => 'application/json', 'sha256' => 'not-a-sha256']],
        ];
    }

    public function test_runtime_stages_then_resumes_evidence_for_the_persisted_tool_call_without_redispatch(): void
    {
        $context = $this->context();
        $context['action']->forceFill([
            'status' => 'dispatched',
            'result_sha256' => null,
            'committed_at' => null,
        ])->save();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'snapshot',
            'application/json',
            '{"format":"accessibility_refs_v1","nodes":[]}',
            ['format' => 'accessibility_refs_v1', 'node_count' => 0],
            ['trust_boundary' => 'untrusted_browser_content', 'state_version' => 1],
        );
        $this->linkArtifactToRun($context, (string) $artifact->id, (string) $artifact->sha256);
        $result = $this->toolResult($context['call'], (string) $artifact->id, (string) $artifact->sha256, 'snapshot');
        $runtime = $this->app->make(TalosBrowserTaskRuntime::class);

        $recorded = $runtime->recordResult(
            (int) $context['user']->id,
            $context['task'],
            $context['action'],
            $context['call'],
            $result,
            $context['browser'],
        );

        self::assertSame('committed', $recorded->status);
        $bundle = $recorded->evidenceBundles()->firstOrFail();
        self::assertNull($bundle->reconciled_at);

        $outcome = $runtime->resumeEvidenceForCall((int) $context['user']->id, $context['call']);

        self::assertSame((string) $bundle->id, (string) $outcome->bundle->id);
        self::assertSame('evidence_committed', $recorded->refresh()->status);
        self::assertSame(1, $recorded->evidenceBundles()->count());
    }

    public function test_commit_reconciles_a_real_initial_about_blank_screenshot(): void
    {
        $context = $this->context();
        $context['call']->forceFill([
            'tool_name' => 'browser_take_screenshot',
            'node_type' => 'TOOL_BROWSER_SCREENSHOT',
        ])->save();
        $context['browser']->forceFill([
            'current_url' => null,
            'current_title' => null,
            'worker_state_version' => 0,
        ])->save();
        $context['action']->forceFill([
            'kind' => 'screenshot',
            'expected_state_version' => 0,
        ])->save();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser']->refresh(),
            'screenshot',
            'image/png',
            $this->png(),
            [
                'url' => 'about:blank',
                'title' => '',
                'width' => 1,
                'height' => 1,
                'state_version' => 0,
            ],
            ['trust_boundary' => 'untrusted_browser_content', 'state_version' => 0],
        );
        $this->linkArtifactToRun($context, (string) $artifact->id, (string) $artifact->sha256, 'screenshot', 'image/png');
        $result = $this->toolResult($context['call'], (string) $artifact->id, (string) $artifact->sha256, 'screenshot');

        $bundle = $this->app->make(TalosBrowserEvidenceCommitService::class)->commit($this->request($context, $result));
        $outcome = $this->app->make(TalosBrowserEvidenceOutbox::class)->resume((string) $bundle->id);

        self::assertSame('about:blank', $bundle->url);
        self::assertSame('reconciled', $outcome->state);
        self::assertNotNull($bundle->refresh()->reconciled_at);
    }

    /** @return array{user: User, run: TalosRun, browser: TalosBrowserSession, task: TalosBrowserTask, action: TalosBrowserAction, turn: TalosToolTurn, call: TalosToolCall} */
    private function context(): array
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Atomic evidence',
            'mode' => 'verified_execution',
            'surface' => 'browse',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Inspect vehicles.'),
            'prompt' => 'Inspect vehicles.',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'metadata' => [],
            'started_at' => now(),
        ]);
        TalosMessage::query()->create([
            'session_id' => $session->id,
            'run_id' => $run->id,
            'role' => 'user',
            'content' => 'Inspect vehicles.',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-evidence-'.str()->uuid(),
            'status' => 'active',
            'mode' => 'read_only',
            'current_url' => 'https://example.test/vehicles',
            'current_title' => 'Vehicles',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 1,
            'expires_at' => now()->addHour(),
        ]);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'browser_session_id' => $browser->id,
            'run_id' => $run->id,
            'status' => 'running',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'adapter_version' => 'test',
            'pending_tool_call_ids' => [],
            'budget_policy' => [],
            'budget_usage' => [],
            'revision' => 0,
            'started_at' => now(),
        ]);
        $call = TalosToolCall::query()->create([
            'tool_turn_id' => $turn->id,
            'run_id' => $run->id,
            'user_id' => $user->id,
            'sequence' => 1,
            'logical_call_id' => 'logical-evidence-1',
            'provider_call_id' => 'provider-evidence-1',
            'node_id' => 'node-evidence-1',
            'tool_name' => 'browser_snapshot',
            'arguments' => [],
            'arguments_sha256' => 'sha256:'.hash('sha256', '{}'),
            'dependencies' => [],
            'fingerprint' => 'sha256:'.hash('sha256', 'evidence-call'),
            'risk' => 'read',
            'capability' => 'browser.snapshot',
            'status' => 'succeeded',
            'attempt' => 0,
            'effect_key' => 'sha256:'.hash('sha256', 'evidence-effect'),
            'effect_status' => 'completed',
            'approval_state' => 'not_required',
        ]);
        $task = $this->app->make(TalosBrowserTaskRuntime::class)->begin((int) $user->id, $run, $browser);
        $action = TalosBrowserAction::query()->create([
            'schema_version' => 'talos.browser.action.v1',
            'task_id' => $task->id,
            'user_id' => $user->id,
            'talos_session_id' => $session->id,
            'intent_id' => $call->logical_call_id,
            'sequence' => 1,
            'kind' => 'snapshot',
            'arguments' => [],
            'expected_state_version' => 1,
            'risk' => 'read',
            'idempotency_key' => (string) $call->effect_key,
            'preconditions' => [],
            'status' => 'committed',
            'result_sha256' => 'sha256:'.hash('sha256', 'pending-result'),
            'requested_at' => now(),
            'approved_at' => now(),
            'started_at' => now(),
            'committed_at' => now(),
        ]);

        return compact('user', 'run', 'browser', 'task', 'action', 'turn', 'call');
    }

    private function toolResult(TalosToolCall $call, string $artifactId, string $sha256, string $kind): ToolResult
    {
        return new ToolResult(
            toolUseId: (string) $call->provider_call_id,
            isError: false,
            content: [['type' => 'text', 'text' => '{"ok":true}']],
            structuredContent: ['ok' => true, 'evidence_ids' => [$artifactId]],
            evidence: [[
                'artifact_id' => $artifactId,
                'kind' => $kind,
                'sha256' => 'sha256:'.$sha256,
                'trusted_boundary' => 'untrusted_browser_content',
            ]],
        );
    }

    /** @param array<string, mixed> $context */
    private function request(array $context, ToolResult $result): TalosBrowserEvidenceCommitRequest
    {
        $resultSha256 = 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($result->toWireArray()));
        $context['action']->forceFill(['result_sha256' => $resultSha256])->save();

        return new TalosBrowserEvidenceCommitRequest(
            task: $context['task'],
            action: $context['action'],
            call: $context['call'],
            result: $result,
            browserSession: $context['browser'],
            resultSha256: $resultSha256,
        );
    }

    /** @param array<string, mixed> $context */
    private function linkArtifactToRun(
        array $context,
        string $artifactId,
        string $sha256,
        string $type = 'snapshot',
        string $mime = 'application/json',
    ): void {
        TalosRunArtifact::query()->create([
            'run_id' => $context['run']->id,
            'artifact_type' => 'browser_'.$type,
            'uri' => 'talos-browser-artifact://'.$artifactId,
            'mime_type' => $mime,
            'metadata' => [
                'browser_artifact_id' => $artifactId,
                'browser_session_id' => $context['browser']->id,
                'tool_turn_id' => $context['turn']->id,
                'provider_call_id' => $context['call']->provider_call_id,
                'sha256' => $sha256,
                'trust' => 'untrusted',
            ],
        ]);
    }

    private function assertInvalidScreenshotEvidence(string $bytes, int $width, int $height): void
    {
        $context = $this->context();
        $context['call']->forceFill([
            'tool_name' => 'browser_take_screenshot',
            'node_type' => 'TOOL_BROWSER_SCREENSHOT',
        ])->save();
        $context['action']->forceFill(['kind' => 'screenshot'])->save();
        $artifact = $this->app->make(TalosBrowserArtifactStore::class)->store(
            $context['browser'],
            'screenshot',
            'image/png',
            $bytes,
            ['width' => $width, 'height' => $height],
            ['trust_boundary' => 'untrusted_browser_content', 'state_version' => 1],
        );
        $this->linkArtifactToRun($context, (string) $artifact->id, (string) $artifact->sha256, 'screenshot', 'image/png');
        $result = $this->toolResult($context['call'], (string) $artifact->id, (string) $artifact->sha256, 'screenshot');
        $bundle = $this->app->make(TalosBrowserEvidenceCommitService::class)->commit($this->request($context, $result));

        try {
            $this->app->make(TalosBrowserEvidenceOutbox::class)->resume((string) $bundle->id);
            self::fail('Spoofed Browser screenshot evidence was reconciled.');
        } catch (TalosBrowserEvidenceException $exception) {
            self::assertSame('TALOS_BROWSER_EVIDENCE_MIME_INVALID', $exception->faultCode);
        }

        self::assertNull($bundle->refresh()->reconciled_at);
        self::assertSame('recovery_required', $context['browser']->refresh()->status);
    }

    private function png(): string
    {
        return base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            true,
        ) ?: throw new \RuntimeException('PNG fixture is invalid.');
    }

    /** @return array<string, mixed> */
    private function canonicalBundle(TalosBrowserEvidenceBundle $bundle): array
    {
        return [
            'schema_version' => $bundle->schema_version,
            'evidence_id' => (string) $bundle->id,
            'task_id' => (string) $bundle->task_id,
            'action_id' => (string) $bundle->action_id,
            'worker_state_version' => (int) $bundle->worker_state_version,
            'url' => (string) $bundle->url,
            'title' => (string) $bundle->title,
            'captured_at' => $bundle->captured_at?->toISOString(),
            'frame' => $bundle->frame,
            'snapshot_artifact_id' => $bundle->snapshot_artifact_id,
            'screenshot_artifact_id' => $bundle->screenshot_artifact_id,
            'before_evidence_id' => $bundle->before_evidence_id,
            'integrity_sha256' => $bundle->integrity_sha256,
            'claims' => $bundle->claims,
        ];
    }
}
