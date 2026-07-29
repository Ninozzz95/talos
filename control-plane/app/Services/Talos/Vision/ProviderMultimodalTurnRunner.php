<?php

declare(strict_types=1);

namespace App\Services\Talos\Vision;

use App\Exceptions\TalosVisionException;
use App\Models\TalosModelProfile;
use App\Services\Talos\Agent\TalosCoreProviderAdapterResolver;
use App\Services\Talos\Agent\TalosProviderAdapterResolver;
use Illuminate\Support\Facades\Crypt;
use InvalidArgumentException;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ProviderTurnResponse;
use Throwable;

/**
 * A focused, tool-less executor for a single multimodal provider turn.
 *
 * The only production executor of a ProviderTurnRequest is TalosAgentTurnService,
 * which is entangled with the procedural tool loop and always sends tools. The
 * vision path needs the opposite: a turn that carries native input images
 * (resources) and NO tools. This runner reuses — never re-implements — the four
 * turn adapters (which already build the provider-native image blocks and inject
 * reasoning params via ReasoningEffortMap). It only orchestrates:
 *   1. decrypt the profile secret (same rules as TalosProviderGateway::adapter),
 *   2. resolve the adapter for the profile (default: TalosCoreProviderAdapterResolver,
 *      the same pinned/SSRF-guarded transport the agentic path uses),
 *   3. call adapter->start($turn) — which POSTs to the provider with the user's
 *      own key/base_url,
 *   4. normalise the response to assistant text.
 *
 * Fail-closed: a provider FAILURE (or an unexpected tool call from a tool-less
 * turn) surfaces as a typed TalosVisionException, never a raw 500.
 */
final class ProviderMultimodalTurnRunner
{
    public function __construct(private readonly ?TalosProviderAdapterResolver $resolver = null) {}

    /**
     * @return array{text: string, provider: string, model: string, visible_reasoning: string|null}
     *
     * @throws TalosVisionException on a provider failure or a non-final outcome
     */
    public function run(TalosModelProfile $profile, ProviderTurnRequest $turn): array
    {
        $provider = strtolower((string) $profile->provider);
        if ($provider !== strtolower($turn->provider) || (string) $profile->model !== $turn->model) {
            throw new InvalidArgumentException('Multimodal turn does not match its model profile.');
        }

        $adapter = ($this->resolver ?? new TalosCoreProviderAdapterResolver)
            ->resolve($profile, $this->secretFor($profile));

        $response = $adapter->start($turn);

        return [
            'text' => $this->normalizeText($response),
            'provider' => (string) $profile->provider,
            'model' => (string) $profile->model,
            'visible_reasoning' => $response->visibleReasoning,
        ];
    }

    private function secretFor(TalosModelProfile $profile): string
    {
        if (strtolower((string) $profile->provider) === 'ollama') {
            return '';
        }
        if (! filled($profile->encrypted_secret)) {
            throw new TalosVisionException(
                'TALOS_VISION_PROVIDER_FAILED',
                'The selected model has no provider secret configured.',
            );
        }
        try {
            return Crypt::decryptString((string) $profile->encrypted_secret);
        } catch (Throwable) {
            throw new TalosVisionException(
                'TALOS_VISION_PROVIDER_FAILED',
                'The selected model secret could not be decrypted.',
            );
        }
    }

    private function normalizeText(ProviderTurnResponse $response): string
    {
        // FINAL / REFUSAL / INCOMPLETE all carry user-presentable assistant text.
        if (in_array($response->kind, [
            ProviderTurnResponse::FINAL,
            ProviderTurnResponse::REFUSAL,
            ProviderTurnResponse::INCOMPLETE,
        ], true) && is_string($response->text) && trim($response->text) !== '') {
            return $response->text;
        }

        // FAILURE, an empty-text outcome, or a tool call from a tool-less turn:
        // fail closed with a typed, user-safe fault (no bytes/base64 in the message).
        throw new TalosVisionException(
            'TALOS_VISION_PROVIDER_FAILED',
            'The model could not process the attached image. Try again or choose another model.',
        );
    }
}
