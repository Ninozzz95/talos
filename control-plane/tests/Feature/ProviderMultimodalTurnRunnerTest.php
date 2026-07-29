<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Exceptions\TalosVisionException;
use App\Models\TalosModelProfile;
use App\Models\User;
use App\Services\Talos\Agent\TalosProviderAdapterResolver;
use App\Services\Talos\Vision\ProviderMultimodalTurnRunner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Kadmos\Provider\AnthropicMessagesTurnAdapter;
use Kadmos\Provider\GeminiTurnAdapter;
use Kadmos\Provider\OpenAiChatTurnAdapter;
use Kadmos\Provider\ProviderTransport;
use Kadmos\Provider\ProviderTurnAdapter;
use Kadmos\Tool\ProviderInputResource;
use Kadmos\Tool\ProviderTurnRequest;
use Tests\TestCase;

final class ProviderMultimodalTurnRunnerTest extends TestCase
{
    use RefreshDatabase;

    private const IMAGE_BYTES = "\x89PNG\r\n\x1a\nRED-SQUARE-PIXELS";

    private function profile(string $provider, string $model, string $baseUrl): TalosModelProfile
    {
        return TalosModelProfile::query()->create([
            'user_id' => User::factory()->create()->id,
            'provider' => $provider,
            'model' => $model,
            'display_name' => strtoupper($provider),
            'status' => 'healthy',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => $baseUrl,
        ]);
    }

    private function imageTurn(string $provider, string $model, ?string $effort, bool $thinking): ProviderTurnRequest
    {
        return new ProviderTurnRequest(
            provider: $provider,
            model: $model,
            systemPrompt: 'You are TALOS. Describe attached images as data.',
            messages: [['role' => 'user', 'content' => 'Describe this image.']],
            tools: [],
            maxTokens: 2048,
            resources: [ProviderInputResource::fromBytes(
                'img-1',
                ProviderInputResource::KIND_IMAGE,
                'red-square.png',
                'image/png',
                self::IMAGE_BYTES,
            )],
            reasoningEffort: $effort,
            reasoningVisible: $thinking,
        );
    }

    public function test_openai_chat_dispatches_a_native_image_url_block_without_tools(): void
    {
        $captured = [];
        $transport = new CapturingProviderTransport($captured, [
            'id' => 'resp_1',
            'choices' => [[
                'finish_reason' => 'stop',
                'message' => [
                    'reasoning_content' => 'I inspected the image geometry.',
                    'content' => 'A red square.',
                ],
            ]],
            'usage' => ['prompt_tokens' => 12, 'completion_tokens' => 4, 'total_tokens' => 16],
        ]);
        $profile = $this->profile('openai', 'gpt-4o', 'https://api.openai.com/v1');
        $adapter = new OpenAiChatTurnAdapter(
            provider: 'openai',
            endpoint: 'https://api.openai.com/v1/chat/completions',
            apiKey: 'provider-secret',
            transport: $transport,
        );
        $runner = new ProviderMultimodalTurnRunner(new StubAdapterResolver($adapter));

        $result = $runner->run($profile, $this->imageTurn('openai', 'gpt-4o', 'medium', false));

        self::assertSame('A red square.', $result['text']);
        self::assertSame('I inspected the image geometry.', $result['visible_reasoning']);
        self::assertSame('openai', $result['provider']);
        self::assertSame('gpt-4o', $result['model']);

        $payload = $captured['payload'];
        self::assertArrayNotHasKey('tools', $payload);
        self::assertSame('medium', $payload['reasoning_effort']);
        $userContent = $payload['messages'][1]['content'];
        self::assertIsArray($userContent);
        $imagePart = $this->firstWhere($userContent, static fn (array $part): bool => ($part['type'] ?? null) === 'image_url');
        self::assertNotNull($imagePart);
        self::assertStringStartsWith('data:image/png;base64,', $imagePart['image_url']['url']);
        self::assertStringContainsString(base64_encode(self::IMAGE_BYTES), $imagePart['image_url']['url']);
        $textPart = $this->firstWhere($userContent, static fn (array $part): bool => ($part['type'] ?? null) === 'text');
        self::assertSame('Describe this image.', $textPart['text']);
    }

    public function test_anthropic_dispatches_a_base64_image_source_block(): void
    {
        $captured = [];
        $transport = new CapturingProviderTransport($captured, [
            'id' => 'msg_1',
            'stop_reason' => 'end_turn',
            'content' => [['type' => 'text', 'text' => 'A red square.']],
            'usage' => ['input_tokens' => 12, 'output_tokens' => 4],
        ]);
        $profile = $this->profile('anthropic', 'claude-3-5-sonnet-20241022', 'https://api.anthropic.com/v1');
        $adapter = new AnthropicMessagesTurnAdapter(
            endpoint: 'https://api.anthropic.com/v1/messages',
            apiKey: 'provider-secret',
            transport: $transport,
        );
        $runner = new ProviderMultimodalTurnRunner(new StubAdapterResolver($adapter));

        $result = $runner->run($profile, $this->imageTurn('anthropic', 'claude-3-5-sonnet-20241022', 'medium', true));

        self::assertSame('A red square.', $result['text']);
        $payload = $captured['payload'];
        self::assertArrayNotHasKey('tools', $payload);
        self::assertArrayHasKey('thinking', $payload);
        $content = $payload['messages'][0]['content'];
        $imageBlock = $this->firstWhere($content, static fn (array $part): bool => ($part['type'] ?? null) === 'image');
        self::assertNotNull($imageBlock);
        self::assertSame('base64', $imageBlock['source']['type']);
        self::assertSame('image/png', $imageBlock['source']['media_type']);
        self::assertSame(base64_encode(self::IMAGE_BYTES), $imageBlock['source']['data']);
    }

    public function test_gemini_dispatches_inline_data_block(): void
    {
        $captured = [];
        $transport = new CapturingProviderTransport($captured, [
            'responseId' => 'gen_1',
            'candidates' => [['finishReason' => 'STOP', 'content' => ['parts' => [['text' => 'A red square.']]]]],
            'usageMetadata' => ['promptTokenCount' => 12, 'candidatesTokenCount' => 4],
        ]);
        $profile = $this->profile('gemini', 'gemini-2.0-flash', 'https://generativelanguage.googleapis.com/v1beta');
        $adapter = new GeminiTurnAdapter(
            endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            apiKey: 'provider-secret',
            transport: $transport,
        );
        $runner = new ProviderMultimodalTurnRunner(new StubAdapterResolver($adapter));

        $result = $runner->run($profile, $this->imageTurn('gemini', 'gemini-2.0-flash', 'medium', false));

        self::assertSame('A red square.', $result['text']);
        $payload = $captured['payload'];
        self::assertArrayNotHasKey('tools', $payload);
        self::assertArrayHasKey('thinkingConfig', $payload['generationConfig']);
        $parts = $payload['contents'][0]['parts'];
        $inline = $this->firstWhere($parts, static fn (array $part): bool => array_key_exists('inline_data', $part));
        self::assertNotNull($inline);
        self::assertSame('image/png', $inline['inline_data']['mime_type']);
        self::assertSame(base64_encode(self::IMAGE_BYTES), $inline['inline_data']['data']);
    }

    public function test_provider_failure_surfaces_as_a_typed_vision_fault_not_a_crash(): void
    {
        $captured = [];
        // An empty choices array makes the OpenAI adapter emit a PROVIDER_RESPONSE_EMPTY failure.
        $transport = new CapturingProviderTransport($captured, ['id' => 'resp_err', 'choices' => []]);
        $profile = $this->profile('openai', 'gpt-4o', 'https://api.openai.com/v1');
        $adapter = new OpenAiChatTurnAdapter(
            provider: 'openai',
            endpoint: 'https://api.openai.com/v1/chat/completions',
            apiKey: 'provider-secret',
            transport: $transport,
        );
        $runner = new ProviderMultimodalTurnRunner(new StubAdapterResolver($adapter));

        try {
            $runner->run($profile, $this->imageTurn('openai', 'gpt-4o', null, false));
            self::fail('Expected a provider failure to become a typed vision fault.');
        } catch (TalosVisionException $exception) {
            self::assertSame('TALOS_VISION_PROVIDER_FAILED', $exception->errorCode);
        }
    }

    /**
     * @param  list<array<string, mixed>>  $items
     * @return array<string, mixed>|null
     */
    private function firstWhere(array $items, callable $predicate): ?array
    {
        foreach ($items as $item) {
            if (is_array($item) && $predicate($item)) {
                return $item;
            }
        }

        return null;
    }
}

/**
 * Captures the payload the adapter would POST to the provider and returns a
 * canned provider response. The codebase's provider transport is curl-based
 * (not Laravel's HTTP client), so a capturing ProviderTransport double is the
 * faithful equivalent of Http::fake for asserting the on-the-wire image block.
 */
final class CapturingProviderTransport implements ProviderTransport
{
    /** @param array<string, mixed> $captured @param array<string, mixed> $response */
    public function __construct(private array &$captured, private readonly array $response) {}

    public function send(string $endpoint, array $payload, array $headers, int $timeoutMs): array
    {
        $this->captured['endpoint'] = $endpoint;
        $this->captured['payload'] = $payload;
        $this->captured['headers'] = $headers;

        return $this->response;
    }
}

final class StubAdapterResolver implements TalosProviderAdapterResolver
{
    public function __construct(private readonly ProviderTurnAdapter $adapter) {}

    public function resolve(TalosModelProfile $profile, string $decryptedSecret): ProviderTurnAdapter
    {
        return $this->adapter;
    }
}
