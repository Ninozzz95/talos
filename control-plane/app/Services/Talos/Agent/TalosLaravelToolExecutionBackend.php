<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserSession;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Models\TalosSession;
use App\Models\TalosToolTurn;
use App\Services\Runs\RunEventNormalizer;
use App\Services\Talos\Browser\TalosBrowserCommand;
use App\Services\Talos\Browser\TalosBrowserCommandService;
use App\Services\Talos\Browser\TalosBrowserSemanticClickService;
use App\Services\Talos\Web\TalosWebFetchException;
use App\Services\Talos\Web\TalosWebFetchService;
use App\Services\Talos\Web\WebSearchProviderFactory;
use InvalidArgumentException;
use Kadmos\Tool\ProceduralNode;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ToolResult;
use Throwable;

final class TalosLaravelToolExecutionBackend implements TalosToolExecutionBackend
{
    /** @var array<string, array{type: string, capability: string, risk: string, requiresApproval: bool, producesEvidence: bool, operation?: string}> */
    private const TOOL_CONTRACTS = [
        'browser_navigate' => ['type' => 'TOOL_BROWSER_NAVIGATE', 'capability' => 'browser.read', 'risk' => 'low', 'requiresApproval' => false, 'producesEvidence' => true, 'operation' => 'navigate'],
        'browser_snapshot' => ['type' => 'TOOL_BROWSER_SNAPSHOT', 'capability' => 'browser.read', 'risk' => 'low', 'requiresApproval' => false, 'producesEvidence' => true, 'operation' => 'snapshot'],
        'browser_read' => ['type' => 'TOOL_BROWSER_READ', 'capability' => 'browser.read', 'risk' => 'low', 'requiresApproval' => false, 'producesEvidence' => true, 'operation' => 'read'],
        'browser_take_screenshot' => ['type' => 'TOOL_BROWSER_SCREENSHOT', 'capability' => 'browser.read', 'risk' => 'low', 'requiresApproval' => false, 'producesEvidence' => true, 'operation' => 'screenshot'],
        'browser_click' => ['type' => 'TOOL_BROWSER_CLICK', 'capability' => 'browser.write', 'risk' => 'high', 'requiresApproval' => true, 'producesEvidence' => true, 'operation' => 'click'],
        'web_search' => ['type' => 'TOOL_WEB_SEARCH', 'capability' => 'web.search', 'risk' => 'low', 'requiresApproval' => false, 'producesEvidence' => true],
        'web_fetch' => ['type' => 'TOOL_WEB_FETCH', 'capability' => 'web.fetch', 'risk' => 'low', 'requiresApproval' => false, 'producesEvidence' => true],
    ];

    public function __construct(
        private readonly TalosBrowserCommandService $browserCommands,
        private readonly TalosBrowserSemanticClickService $browserClicks,
        private readonly WebSearchProviderFactory $searchProviders,
        private readonly TalosWebFetchService $webFetch,
        private readonly TalosAgentBudgetService $budgets,
        private readonly ?RunEventNormalizer $normalizer = null,
    ) {}

    public function execute(
        ProceduralNode $node,
        TalosToolTurn $turn,
        ?TalosBrowserSession $browserSession = null,
    ): ToolResult {
        $toolUseId = $node->call->providerCallId;

        try {
            $contract = self::TOOL_CONTRACTS[$node->call->name] ?? null;
            if ($contract === null) {
                return ToolResult::error($toolUseId, 'TALOS_TOOL_NOT_ALLOWED', 'The requested tool is not server-authorized.');
            }

            $ownershipError = $this->ownershipError($node, $turn, $browserSession, $contract);
            if ($ownershipError !== null) {
                return ToolResult::error($toolUseId, $ownershipError[0], $ownershipError[1]);
            }

            return match ($node->call->name) {
                'browser_navigate', 'browser_snapshot', 'browser_read', 'browser_take_screenshot' => $this->executeBrowser($node, $turn, $browserSession, $contract['operation']),
                'browser_click' => $this->executeBrowserClick($node, $turn, $browserSession),
                'web_search' => $this->executeSearch($node, $turn),
                'web_fetch' => $this->executeFetch($node, $turn),
            };
        } catch (TalosWebFetchException $exception) {
            return ToolResult::error($toolUseId, $this->controlledCode($exception->errorCode, 'TALOS_WEB_FETCH_UNAVAILABLE'), $exception->getMessage());
        } catch (InvalidArgumentException $exception) {
            return ToolResult::error($toolUseId, 'TALOS_TOOL_INPUT_INVALID', $exception->getMessage());
        } catch (Throwable) {
            return ToolResult::error($toolUseId, 'TALOS_TOOL_EXECUTION_FAILED', 'Tool execution failed.');
        }
    }

    private function executeBrowserClick(ProceduralNode $node, TalosToolTurn $turn, ?TalosBrowserSession $browserSession): ToolResult
    {
        if (! $browserSession instanceof TalosBrowserSession) {
            return ToolResult::error($node->call->providerCallId, 'TALOS_BROWSER_SESSION_REQUIRED', 'The authorized browser session is required for this tool.');
        }

        $run = TalosRun::query()
            ->whereKey($turn->run_id)
            ->where('user_id', $turn->user_id)
            ->where('session_id', $turn->session_id)
            ->first();
        if (! $run instanceof TalosRun) {
            return ToolResult::error($node->call->providerCallId, 'TALOS_TOOL_OWNERSHIP_MISMATCH', 'Tool execution run is not owned by its turn.');
        }

        $policy = is_array($turn->budget_policy) ? $turn->budget_policy : [];
        $evidenceLimit = $policy['max_evidence_bytes'] ?? null;
        $remainingEvidenceBytes = is_int($evidenceLimit)
            ? max(0, $evidenceLimit - $this->budgets->consumedForTurn(
                (int) $turn->user_id,
                (string) $turn->id,
                'evidence_bytes',
            ))
            : PHP_INT_MAX;
        $persistedCall = $turn->calls()
            ->where('user_id', $turn->user_id)
            ->where('run_id', $turn->run_id)
            ->where('node_id', $node->id)
            ->where('provider_call_id', $node->call->providerCallId)
            ->first();
        if (! $persistedCall instanceof \App\Models\TalosToolCall
            || ! is_string($persistedCall->evidence_snapshot_artifact_id)
            || ! is_string($persistedCall->evidence_snapshot_id)
            || ! is_string($persistedCall->evidence_hash)) {
            return ToolResult::error($node->call->providerCallId, 'TALOS_BROWSER_STALE_EVIDENCE', 'The approved browser action is missing its exact snapshot binding.');
        }
        $payload = $this->browserClicks->execute(
            $browserSession,
            $run,
            $this->normalizer ?? new RunEventNormalizer,
            $node->call->providerCallId,
            $node->id,
            $node->call->arguments,
            $remainingEvidenceBytes,
            $persistedCall->evidence_snapshot_artifact_id,
            $persistedCall->evidence_hash,
            $persistedCall->evidence_snapshot_id,
            (int) $persistedCall->state_version,
        );
        if (isset($payload['error']) && is_array($payload['error'])) {
            return $this->errorFromPayload($node->call->providerCallId, $payload['error'], 'TALOS_BROWSER_CLICK_FAILED');
        }

        return $this->success(
            $node->call->providerCallId,
            [
                'tool' => $node->call->name,
                'activity' => $payload['activity'] ?? null,
                'observation' => $payload['observation'] ?? null,
                'used_browser_context' => $payload['used_browser_context'] ?? null,
                'evidence_bytes' => (int) ($payload['evidence_bytes'] ?? 0),
            ],
            $this->browserEvidence($payload, $turn, $browserSession, 'click', $node->call->providerCallId),
        );
    }

    /** @param array{type: string, capability: string, risk: string, requiresApproval: bool, producesEvidence: bool, operation?: string} $contract @return array{0: string, 1: string}|null */
    private function ownershipError(ProceduralNode $node, TalosToolTurn $turn, ?TalosBrowserSession $browserSession, array $contract): ?array
    {
        $context = $node->context;
        $turnOwner = (string) $turn->user_id;
        $turnSession = (string) $turn->session_id;
        $turnRun = (string) $turn->run_id;

        if (! $turn->exists
            || (string) $turn->id !== $context->turnId
            || $turnOwner !== $context->userId
            || $turnSession !== $context->chatSessionId
            || $turnRun !== $context->runId) {
            return ['TALOS_TOOL_OWNERSHIP_MISMATCH', 'Tool execution context does not match its owned turn.'];
        }

        if ($node->type !== $contract['type']
            || $context->capability !== $contract['capability']
            || $context->risk !== $contract['risk']
            || $node->requiresApproval !== $contract['requiresApproval']
            || $node->producesEvidence !== $contract['producesEvidence']) {
            return ['TALOS_TOOL_CONTEXT_INVALID', 'Tool execution context is not server-owned.'];
        }

        $ownedSession = TalosSession::query()->whereKey($turnSession)->where('user_id', $turnOwner)->exists();
        $ownedRun = TalosRun::query()->whereKey($turnRun)->where('user_id', $turnOwner)->where('session_id', $turnSession)->exists();
        if (! $ownedSession || ! $ownedRun) {
            return ['TALOS_TOOL_OWNERSHIP_MISMATCH', 'Tool execution session or run is not owned by its turn.'];
        }

        $isBrowserTool = isset($contract['operation']);
        if ($isBrowserTool && ($browserSession === null || $context->browserSessionId !== (string) $browserSession->id)) {
            return ['TALOS_BROWSER_SESSION_REQUIRED', 'The authorized browser session is required for this tool.'];
        }
        if ($browserSession !== null) {
            $ownedBrowser = TalosBrowserSession::query()
                ->whereKey($browserSession->id)
                ->where('user_id', $turnOwner)
                ->where('talos_session_id', $turnSession)
                ->first();
            if (! $ownedBrowser instanceof TalosBrowserSession || $context->browserSessionId !== (string) $browserSession->id) {
                return ['TALOS_TOOL_OWNERSHIP_MISMATCH', 'Browser session ownership does not match the tool context.'];
            }
            $browserSession->setRawAttributes($ownedBrowser->getAttributes());
        }

        if ($isBrowserTool && $context->stateVersion !== (int) $browserSession->worker_state_version) {
            return ['TALOS_BROWSER_STALE_STATE', 'Browser tool state does not match the owned browser session.'];
        }

        return null;
    }

    /** @param array{type: string, capability: string, risk: string, operation?: string} $contract */
    private function executeBrowser(ProceduralNode $node, TalosToolTurn $turn, ?TalosBrowserSession $browserSession, string $operation): ToolResult
    {
        if (! $browserSession instanceof TalosBrowserSession) {
            return ToolResult::error($node->call->providerCallId, 'TALOS_BROWSER_SESSION_REQUIRED', 'The authorized browser session is required for this tool.');
        }

        $expectedEvidenceHash = null;
        if ($operation === 'read') {
            $artifact = TalosBrowserArtifact::query()
                ->whereKey($browserSession->last_snapshot_artifact_id)
                ->where('browser_session_id', $browserSession->id)
                ->where('user_id', $turn->user_id)
                ->where('type', 'snapshot')
                ->first();
            $artifactHash = $artifact instanceof TalosBrowserArtifact && is_string($artifact->sha256)
                ? 'sha256:'.$artifact->sha256
                : null;
            if ($artifactHash === null || preg_match('/^sha256:[a-f0-9]{64}$/', $artifactHash) !== 1) {
                return ToolResult::error($node->call->providerCallId, 'TALOS_BROWSER_STALE_EVIDENCE', 'Current snapshot evidence is required before reading page content.');
            }
            $expectedEvidenceHash = $artifactHash;
        }

        try {
            $command = TalosBrowserCommand::canonicalReadInput(
                runId: (string) $turn->run_id,
                browserSessionId: (string) $browserSession->id,
                operation: $operation,
                arguments: $this->canonicalBrowserArguments($node->call->arguments, $operation),
                expectedEvidenceHash: $expectedEvidenceHash,
                nodeId: $node->id,
            );
        } catch (InvalidArgumentException) {
            return ToolResult::error($node->call->providerCallId, 'TALOS_BROWSER_COMMAND_MALFORMED', 'Browser tool arguments are malformed.');
        }

        $run = TalosRun::query()->whereKey($turn->run_id)->where('user_id', $turn->user_id)->where('session_id', $turn->session_id)->first();
        if (! $run instanceof TalosRun) {
            return ToolResult::error($node->call->providerCallId, 'TALOS_TOOL_OWNERSHIP_MISMATCH', 'Tool execution run is not owned by its turn.');
        }

        $policy = is_array($turn->budget_policy) ? $turn->budget_policy : [];
        $evidenceLimit = $policy['max_evidence_bytes'] ?? null;
        $remainingEvidenceBytes = is_int($evidenceLimit)
            ? max(0, $evidenceLimit - $this->budgets->consumedForTurn(
                (int) $turn->user_id,
                (string) $turn->id,
                'evidence_bytes',
            ))
            : PHP_INT_MAX;
        $payload = $this->browserCommands->execute(
            $browserSession,
            $run,
            $command,
            $this->normalizer ?? new RunEventNormalizer,
            $remainingEvidenceBytes,
        );
        if (isset($payload['error']) && is_array($payload['error'])) {
            return $this->errorFromPayload($node->call->providerCallId, $payload['error'], 'TALOS_BROWSER_COMMAND_FAILED');
        }

        return $this->success(
            $node->call->providerCallId,
            [
                'tool' => $node->call->name,
                'activity' => $payload['activity'] ?? null,
                'observation' => $payload['observation'] ?? null,
                'used_browser_context' => $payload['used_browser_context'] ?? null,
                'evidence_bytes' => (int) ($payload['evidence_bytes'] ?? 0),
            ],
            $this->browserEvidence($payload, $turn, $browserSession, $operation, $node->call->providerCallId),
        );
    }

    /** @param array<string, mixed> $arguments @return array<string, mixed> */
    private function canonicalBrowserArguments(array $arguments, string $operation): array
    {
        $allowed = match ($operation) {
            'navigate' => ['url'],
            'read' => ['ref', 'query'],
            'snapshot', 'screenshot' => [],
        };
        foreach (array_keys($arguments) as $key) {
            if (! is_string($key) || ! in_array($key, $allowed, true)) {
                throw new InvalidArgumentException('Browser tool arguments contain unsupported fields.');
            }
        }

        $canonical = [];
        foreach ($allowed as $key) {
            if (array_key_exists($key, $arguments)) {
                $canonical[$key] = $arguments[$key];
            }
        }

        return $canonical;
    }

    private function executeSearch(ProceduralNode $node, TalosToolTurn $turn): ToolResult
    {
        $query = $node->call->arguments['query'] ?? null;
        if (! is_string($query) || trim($query) === '' || strlen($query) > 512) {
            return ToolResult::error($node->call->providerCallId, 'TALOS_WEB_SEARCH_INVALID_INPUT', 'Web search query is invalid.');
        }
        $options = $node->call->arguments['options'] ?? [];
        if (! is_array($options)) {
            return ToolResult::error($node->call->providerCallId, 'TALOS_WEB_SEARCH_INVALID_INPUT', 'Web search options are invalid.');
        }

        $response = $this->searchProviders->forOwner('talos-user:'.(string) $turn->user_id)->search($query, $options);
        if (! $response->available) {
            $reason = is_string($response->reason) && $response->reason !== '' ? $response->reason : 'unavailable';

            $reasonCode = strtoupper((string) preg_replace('/[^A-Za-z0-9]+/', '_', $reason));
            $code = substr('TALOS_WEB_SEARCH_'.trim($reasonCode, '_'), 0, 128);

            return ToolResult::error($node->call->providerCallId, $code === 'TALOS_WEB_SEARCH_' ? 'TALOS_WEB_SEARCH_UNAVAILABLE' : $code, 'Web search is unavailable.');
        }

        $results = array_map(static fn (mixed $result): array => $result->toArray(), $response->results);
        $evidence = [];
        foreach ($results as $index => $result) {
            $hash = $result['evidence_hash'] ?? null;
            if (! is_string($hash) || preg_match('/^sha256:[a-f0-9]{64}$/', $hash) !== 1) {
                return ToolResult::error($node->call->providerCallId, 'TALOS_WEB_SEARCH_EVIDENCE_INVALID', 'Web search returned invalid evidence.');
            }
            $artifact = $this->persistRunEvidence(
                $turn,
                $node->call->providerCallId,
                'web_search_result',
                $index,
                'application/json',
                $hash,
                ['result' => $result, 'provider_provenance' => $response->provenance],
            );
            $evidence[] = [
                'artifact_id' => (string) $artifact->id,
                'kind' => 'search_result',
                'sha256' => $hash,
                'trusted_boundary' => 'untrusted_web_content',
            ];
        }

        if ($evidence === []) {
            return ToolResult::error($node->call->providerCallId, 'TALOS_WEB_SEARCH_NO_RESULTS', 'Web search returned no evidence.');
        }

        return $this->success($node->call->providerCallId, [
            'tool' => 'web_search',
            'available' => true,
            'results' => $results,
            'provenance' => $response->provenance,
        ], $evidence);
    }

    private function executeFetch(ProceduralNode $node, TalosToolTurn $turn): ToolResult
    {
        $arguments = $node->call->arguments;
        $url = $arguments['url'] ?? null;
        if (! is_string($url) || trim($url) === '') {
            return ToolResult::error($node->call->providerCallId, 'TALOS_WEB_FETCH_URL_BLOCKED', 'Web fetch URL was blocked by policy.');
        }

        $result = $this->webFetch->fetch(
            $url,
            is_int($arguments['timeout_ms'] ?? null) ? $arguments['timeout_ms'] : 10000,
            is_int($arguments['max_bytes'] ?? null) ? $arguments['max_bytes'] : 1000000,
            is_int($arguments['max_redirects'] ?? null) ? $arguments['max_redirects'] : 3,
        );
        $serialized = $result->toArray();
        $artifact = $this->persistRunEvidence(
            $turn,
            $node->call->providerCallId,
            'web_fetch',
            0,
            'application/json',
            $result->evidenceHash,
            ['fetch' => $serialized],
        );
        $evidence = [[
            'artifact_id' => (string) $artifact->id,
            'kind' => 'web_fetch',
            'sha256' => $result->evidenceHash,
            'trusted_boundary' => 'untrusted_web_content',
        ]];

        return $this->success($node->call->providerCallId, [
            'tool' => 'web_fetch',
            ...$serialized,
        ], $evidence);
    }

    /** @param array<string, mixed> $payload @return list<array{artifact_id: string, kind: string, sha256: string, trusted_boundary: string}> */
    private function browserEvidence(
        array $payload,
        TalosToolTurn $turn,
        TalosBrowserSession $browserSession,
        string $operation,
        string $providerCallId,
    ): array {
        $activity = is_array($payload['activity'] ?? null) ? $payload['activity'] : [];
        $artifactIds = is_array($activity['artifact_ids'] ?? null)
            ? array_values(array_filter($activity['artifact_ids'], 'is_string'))
            : [];
        if ($artifactIds !== []) {
            $artifacts = TalosBrowserArtifact::query()
                ->whereIn('id', $artifactIds)
                ->where('browser_session_id', $browserSession->id)
                ->where('user_id', $turn->user_id)
                ->get()
                ->keyBy('id');
            $evidence = [];
            foreach ($artifactIds as $artifactId) {
                $artifact = $artifacts->get($artifactId);
                if (! $artifact instanceof TalosBrowserArtifact || ! is_string($artifact->sha256)) {
                    throw new InvalidArgumentException('Browser evidence artifact is not owned by the current turn.');
                }
                TalosRunArtifact::query()->firstOrCreate(
                    ['run_id' => $turn->run_id, 'uri' => 'talos-browser-artifact://'.$artifact->id],
                    [
                        'artifact_type' => 'browser_'.$artifact->type,
                        'mime_type' => $artifact->mime,
                        'metadata' => [
                            'browser_artifact_id' => $artifact->id,
                            'browser_session_id' => $browserSession->id,
                            'tool_turn_id' => $turn->id,
                            'provider_call_id' => $providerCallId,
                            'sha256' => $artifact->sha256,
                            'trust' => 'untrusted',
                        ],
                    ],
                );
                $evidence[] = [
                    'artifact_id' => (string) $artifact->id,
                    'kind' => $operation === 'read' ? 'snapshot_read' : (string) $artifact->type,
                    'sha256' => 'sha256:'.$artifact->sha256,
                    'trusted_boundary' => 'untrusted_browser_content',
                ];
            }

            return $evidence;
        }

        if ($operation !== 'navigate' || ! is_array($payload['observation'] ?? null)) {
            return [];
        }
        $observation = $payload['observation'];
        $hash = 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($observation));
        $artifact = $this->persistRunEvidence(
            $turn,
            $providerCallId,
            'browser_navigation',
            0,
            'application/json',
            $hash,
            ['browser_session_id' => $browserSession->id, 'observation' => $observation],
        );

        return [[
            'artifact_id' => (string) $artifact->id,
            'kind' => 'navigation',
            'sha256' => $hash,
            'trusted_boundary' => 'untrusted_browser_content',
        ]];
    }

    /** @param array<string, mixed> $metadata */
    private function persistRunEvidence(
        TalosToolTurn $turn,
        string $providerCallId,
        string $artifactType,
        int $index,
        string $mimeType,
        string $sha256,
        array $metadata,
    ): TalosRunArtifact {
        $identity = hash('sha256', implode('|', [
            (string) $turn->id,
            $providerCallId,
            $artifactType,
            (string) $index,
        ]));

        return TalosRunArtifact::query()->firstOrCreate(
            ['run_id' => $turn->run_id, 'uri' => 'talos-tool-evidence://'.$identity],
            [
                'artifact_type' => $artifactType,
                'mime_type' => $mimeType,
                'metadata' => [
                    ...$metadata,
                    'tool_turn_id' => $turn->id,
                    'provider_call_id' => $providerCallId,
                    'sha256' => $sha256,
                    'trust' => 'untrusted',
                ],
            ],
        );
    }

    /** @param array<string, mixed> $structured @param list<array<string, mixed>> $evidence */
    private function success(string $toolUseId, array $structured, array $evidence): ToolResult
    {
        $evidenceIds = [];
        foreach ($evidence as $item) {
            if (! is_string($item['artifact_id'] ?? null) || ! is_string($item['sha256'] ?? null)) {
                return ToolResult::error($toolUseId, 'TALOS_TOOL_EVIDENCE_INVALID', 'Tool execution returned invalid evidence.');
            }
            $evidenceIds[] = $item['artifact_id'];
        }
        if ($evidenceIds === []) {
            return ToolResult::error($toolUseId, 'TALOS_TOOL_EVIDENCE_REQUIRED', 'Successful tool execution returned no evidence.');
        }
        $structured['evidence_ids'] = $evidenceIds;
        $encoded = json_encode($structured, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $contentText = strlen($encoded) > 65536 ? substr($encoded, 0, 65536) : $encoded;

        return new ToolResult(
            toolUseId: $toolUseId,
            isError: false,
            content: [['type' => 'text', 'text' => $contentText]],
            structuredContent: $structured,
            evidence: $evidence,
        );
    }

    /** @param array<string, mixed> $error */
    private function errorFromPayload(string $toolUseId, array $error, string $fallbackCode): ToolResult
    {
        $code = $this->controlledCode($error['code'] ?? null, $fallbackCode);
        $message = is_string($error['message'] ?? null) && trim($error['message']) !== ''
            ? $error['message']
            : 'Tool execution failed.';

        return ToolResult::error($toolUseId, $code, $message);
    }

    private function controlledCode(mixed $code, string $fallback): string
    {
        return is_string($code) && preg_match('/\ATALOS_[A-Z0-9_]{1,120}\z/', $code) === 1 ? $code : $fallback;
    }
}
