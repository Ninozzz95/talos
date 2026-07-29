<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserSession;
use App\Models\TalosFile;
use App\Models\TalosFileChunk;
use App\Models\TalosMessage;
use App\Models\TalosModelProfile;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Agent\TalosProviderAdapterResolver;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Vision\ProviderMultimodalTurnRunner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Kadmos\Provider\ProviderCapabilities;
use Kadmos\Provider\ProviderTurnAdapter;
use Kadmos\Tool\ProviderInputResource;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ProviderTurnState;
use Kadmos\Tool\TokenUsage;
use Kadmos\Tool\ToolResult;
use Tests\TestCase;

final class TalosChatVisionAttachmentTest extends TestCase
{
    use RefreshDatabase;

    private const PNG_BYTES = "\x89PNG\r\n\x1a\nRED-SQUARE";

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->user = $this->authenticateTalosUser();
        config(['services.avm_validator.url' => 'http://validator.test']);
    }

    private function profile(string $provider = 'openai', string $model = 'gpt-4o'): TalosModelProfile
    {
        return TalosModelProfile::query()->create([
            'user_id' => $this->user->id,
            'provider' => $provider,
            'model' => $model,
            'display_name' => strtoupper($provider),
            'status' => 'healthy',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => match ($provider) {
                'anthropic' => 'https://api.anthropic.com/v1',
                default => 'https://api.openai.com/v1',
            },
        ]);
    }

    private function imageFile(string $name = 'red-square.png', string $bytes = self::PNG_BYTES): TalosFile
    {
        $path = 'ingested/private/'.$name;
        Storage::disk('local')->put($path, $bytes);

        return TalosFile::query()->create([
            'user_id' => $this->user->id,
            'original_name' => $name,
            'mime_type' => 'application/octet-stream',
            'detected_mime' => 'image/png',
            'size_bytes' => strlen($bytes),
            'checksum' => hash('sha256', $bytes),
            'status' => 'available',
            'storage_disk' => 'local',
            'storage_path' => $path,
            'parser' => 'image',
        ]);
    }

    private function textFile(string $name = 'notes.md', string $content = 'Deploy window is Friday 09:00 UTC.'): TalosFile
    {
        $file = TalosFile::query()->create([
            'user_id' => $this->user->id,
            'original_name' => $name,
            'mime_type' => 'text/markdown',
            'detected_mime' => 'text/markdown',
            'size_bytes' => strlen($content),
            'checksum' => hash('sha256', $content),
            'status' => 'available',
            'storage_path' => 'ingested/private/'.$name,
            'parser' => 'markdown',
        ]);
        TalosFileChunk::query()->create([
            'file_id' => $file->id,
            'sequence' => 1,
            'content' => $content,
            'content_hash' => hash('sha256', $content),
            'start_offset' => 0,
            'end_offset' => strlen($content),
        ]);

        return $file;
    }

    /** @return list<string> */
    private function grantFor(TalosFile ...$files): array
    {
        $ids = [];
        foreach ($files as $file) {
            $ids[] = $this->postJson('/api/talos/file-authority/grants', [
                'scope' => 'file',
                'permissions' => ['model.read'],
                'file_ids' => [$file->id],
            ])->assertCreated()->json('data.id');
        }

        return $ids;
    }

    private function bindRecordingRunner(
        string $answer = 'This image shows a red square.',
        ?string $visibleReasoning = null,
    ): RecordingVisionTurnAdapter
    {
        $adapter = new RecordingVisionTurnAdapter($answer, $visibleReasoning);
        $this->app->instance(
            ProviderMultimodalTurnRunner::class,
            new ProviderMultimodalTurnRunner(new RecordingVisionResolver($adapter)),
        );

        return $adapter;
    }

    public function test_vision_model_with_image_dispatches_a_provider_turn_carrying_one_image_resource(): void
    {
        Http::fake(['validator.test/chat' => Http::response(['text' => 'should not be called'])]);
        $adapter = $this->bindRecordingRunner('This image shows a red square.');
        $profile = $this->profile('openai', 'gpt-4o');
        $image = $this->imageFile();
        $session = $this->postJson('/api/talos/sessions', ['title' => 'Vision chat'])->json('data');
        $grants = $this->grantFor($image);

        $this->postJson('/api/talos/chat', [
            'message' => 'What is in this image?',
            'model_profile_id' => $profile->id,
            'session_id' => $session['id'],
            'attachment_file_ids' => [$image->id],
            'attachment_grant_ids' => $grants,
        ])
            ->assertOk()
            ->assertJsonPath('text', 'This image shows a red square.');

        Http::assertNothingSent();

        self::assertNotNull($adapter->lastRequest);
        self::assertCount(1, $adapter->lastRequest->resources);
        $resource = $adapter->lastRequest->resources[0];
        self::assertSame(ProviderInputResource::KIND_IMAGE, $resource->kind);
        self::assertSame('image/png', $resource->mediaType);
        self::assertSame($image->id, $resource->resourceId);
        self::assertSame([], $adapter->lastRequest->tools);
        self::assertSame('user', $adapter->lastRequest->messages[array_key_last($adapter->lastRequest->messages)]['role']);

        $run = TalosRun::query()->where('session_id', $session['id'])->latest()->first();
        self::assertNotNull($run);
        self::assertSame('succeeded', $run->status);
        self::assertSame(1, (int) data_get($run->metadata, 'vision.count'));
        self::assertSame([$image->id], data_get($run->metadata, 'vision.file_ids'));
        self::assertSame('openai', data_get($run->metadata, 'vision.provider'));
        self::assertSame('gpt-4o', data_get($run->metadata, 'vision.model'));
    }

    public function test_vision_reasoning_is_persisted_server_side_and_returned_as_the_assistant_message(): void
    {
        Http::fake(['validator.test/chat' => Http::response(['text' => 'should not be called'])]);
        $this->bindRecordingRunner(
            'This image shows a red square.',
            'I inspected the image geometry.',
        );
        $profile = $this->profile('openai', 'gpt-4o');
        $image = $this->imageFile();
        $session = $this->postJson('/api/talos/sessions', ['title' => 'Vision reasoning'])->json('data');
        $grants = $this->grantFor($image);

        $this->postJson('/api/talos/chat', [
            'message' => 'What is in this image?',
            'model_profile_id' => $profile->id,
            'session_id' => $session['id'],
            'attachment_file_ids' => [$image->id],
            'attachment_grant_ids' => $grants,
            'thinking' => true,
        ])
            ->assertOk()
            ->assertJsonPath('assistant_message.content', 'This image shows a red square.')
            ->assertJsonPath('assistant_message.metadata.visible_reasoning.text', 'I inspected the image geometry.')
            ->assertJsonMissingPath('assistant_message.metadata.provider_state');

        $message = TalosMessage::query()
            ->where('session_id', $session['id'])
            ->where('role', 'assistant')
            ->sole();
        self::assertSame('I inspected the image geometry.', data_get($message->metadata, 'visible_reasoning.text'));
    }

    public function test_non_vision_model_with_image_fails_closed_422_without_a_provider_call(): void
    {
        Http::fake(['validator.test/chat' => Http::response(['text' => 'should not be called'])]);
        $adapter = $this->bindRecordingRunner();
        $profile = $this->profile('openai', 'gpt-3.5-turbo');
        $image = $this->imageFile();
        $session = $this->postJson('/api/talos/sessions', ['title' => 'No-vision chat'])->json('data');
        $grants = $this->grantFor($image);

        $this->postJson('/api/talos/chat', [
            'message' => 'What is in this image?',
            'model_profile_id' => $profile->id,
            'session_id' => $session['id'],
            'attachment_file_ids' => [$image->id],
            'attachment_grant_ids' => $grants,
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'VISION_UNSUPPORTED')
            ->assertJsonPath('error.supported_providers', ['openai', 'anthropic', 'gemini']);

        Http::assertNothingSent();
        self::assertNull($adapter->lastRequest);
        self::assertSame(0, TalosMessage::query()->where('role', 'assistant')->count());
        // Fail-closed refusal creates no run at all (mirrors EFFORT_UNSUPPORTED).
        self::assertSame(0, TalosRun::query()->where('session_id', $session['id'])->count());
    }

    public function test_image_integrity_failure_surfaces_as_a_clean_422_not_a_500(): void
    {
        Http::fake(['validator.test/chat' => Http::response(['text' => 'should not be called'])]);
        $adapter = $this->bindRecordingRunner();
        $profile = $this->profile('openai', 'gpt-4o');
        $image = $this->imageFile();
        // Corrupt the recorded checksum so the builder fails the integrity check.
        $image->forceFill(['checksum' => hash('sha256', 'a different payload')])->save();
        $session = $this->postJson('/api/talos/sessions', ['title' => 'Integrity chat'])->json('data');
        $grants = $this->grantFor($image);

        $response = $this->postJson('/api/talos/chat', [
            'message' => 'What is in this image?',
            'model_profile_id' => $profile->id,
            'session_id' => $session['id'],
            'attachment_file_ids' => [$image->id],
            'attachment_grant_ids' => $grants,
        ])->assertStatus(422);

        $response->assertSee('TALOS_VISION_INTEGRITY');
        Http::assertNothingSent();
        self::assertNull($adapter->lastRequest);

        $run = TalosRun::query()->where('session_id', $session['id'])->latest()->first();
        self::assertNotNull($run);
        self::assertSame('failed', $run->status);
    }

    public function test_mixed_image_and_text_attachments_route_image_to_vision_and_text_to_grounding(): void
    {
        Http::fake(['validator.test/chat' => Http::response(['text' => 'should not be called'])]);
        $adapter = $this->bindRecordingRunner('Red square; deploy noted.');
        $profile = $this->profile('openai', 'gpt-4o');
        $image = $this->imageFile();
        $text = $this->textFile('notes.md', 'Deploy window is Friday 09:00 UTC.');
        $session = $this->postJson('/api/talos/sessions', ['title' => 'Mixed chat'])->json('data');
        $grants = $this->grantFor($image, $text);

        $this->postJson('/api/talos/chat', [
            'message' => 'Describe the picture and recall the deploy window.',
            'model_profile_id' => $profile->id,
            'session_id' => $session['id'],
            'attachment_file_ids' => [$image->id, $text->id],
            'attachment_grant_ids' => $grants,
        ])
            ->assertOk()
            ->assertJsonPath('text', 'Red square; deploy noted.')
            ->assertJsonPath('used_attachments.0.file_id', $image->id)
            ->assertJsonPath('used_attachments.1.file_id', $text->id);

        Http::assertNothingSent();
        self::assertNotNull($adapter->lastRequest);
        self::assertCount(1, $adapter->lastRequest->resources);
        self::assertSame($image->id, $adapter->lastRequest->resources[0]->resourceId);

        $userContent = $adapter->lastRequest->messages[array_key_last($adapter->lastRequest->messages)]['content'];
        self::assertStringContainsString('notes.md', $userContent);
        self::assertStringContainsString('Deploy window is Friday 09:00 UTC', $userContent);
    }

    public function test_text_only_chat_is_unchanged_standard_relay(): void
    {
        Http::fake(['validator.test/chat' => Http::response(['text' => 'Standard relay answer.'])]);
        $adapter = $this->bindRecordingRunner();
        $profile = $this->profile('openai', 'gpt-4o');
        $session = $this->postJson('/api/talos/sessions', ['title' => 'Text chat'])->json('data');

        $this->postJson('/api/talos/chat', [
            'message' => 'Just a text question.',
            'model_profile_id' => $profile->id,
            'session_id' => $session['id'],
        ])
            ->assertOk()
            ->assertJsonPath('text', 'Standard relay answer.');

        Http::assertSent(static fn ($request): bool => $request->url() === 'http://validator.test/chat'
            && str_contains((string) $request['message'], 'Just a text question.'));
        self::assertNull($adapter->lastRequest);
    }

    public function test_browser_mode_with_image_falls_back_to_grounding_and_records_the_reason(): void
    {
        // The vision route must NOT be taken in browser mode (resources + tools is
        // forbidden); the agentic turn answers and we record the fallback reason.
        $adapter = $this->bindRecordingRunner();
        $this->app->instance(BrowserSessionClient::class, new FakeBrowserSessionClient);
        $this->app->instance(
            TalosProviderAdapterResolver::class,
            new RecordingVisionResolver(new RecordingVisionTurnAdapter('Answered without seeing the image.')),
        );
        Http::fake(['validator.test/chat' => Http::response(['text' => 'should not be called'])]);

        $profile = $this->profile('openai', 'gpt-4o');
        $session = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Browser vision fallback',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $this->user->id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-vision-fallback',
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 0,
            'expires_at' => now()->addHour(),
        ]);
        $image = $this->imageFile();
        $userMessage = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Tell me about this attached picture.',
            'metadata' => ['source' => 'talos_chat_page'],
        ]);
        $grants = $this->grantFor($image);

        $this->postJson('/api/talos/chat', [
            'session_id' => $session->id,
            'user_message_id' => $userMessage->id,
            'message' => $userMessage->content,
            'model_profile_id' => $profile->id,
            'attachment_file_ids' => [$image->id],
            'attachment_grant_ids' => $grants,
            'browser_mode' => ['enabled' => true, 'browser_session_id' => $browser->id],
        ])->assertOk();

        Http::assertNothingSent();
        // Vision runner never invoked; no resources+tools crash.
        self::assertNull($adapter->lastRequest);
        $run = TalosRun::query()->where('session_id', $session->id)->latest()->first();
        self::assertNotNull($run);
        self::assertSame('browser_mode', data_get($run->metadata, 'vision_unavailable_reason'));
        self::assertNull(data_get($run->metadata, 'vision'));
    }
}

final class RecordingVisionTurnAdapter implements ProviderTurnAdapter
{
    public ?ProviderTurnRequest $lastRequest = null;

    public function __construct(
        private readonly string $answer,
        private readonly ?string $visibleReasoning = null,
    ) {}

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities(
            provider: 'openai',
            adapterVersion: 'recording_vision_v1',
            nativeTools: false,
            parallelToolCalls: false,
            strictSchemas: false,
            statefulContinuation: false,
            reasoningContinuationState: false,
            imageToolResults: false,
            source: 'test',
            nativeInputImages: true,
        );
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $this->lastRequest = $request;

        return ProviderTurnResponse::final(
            $this->answer,
            'resp_rec',
            'stop',
            new TokenUsage(10, 5, 15),
            $this->visibleReasoning,
        );
    }

    /** @param list<ToolResult> $toolResults */
    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        return ProviderTurnResponse::final(
            $this->answer,
            'resp_rec',
            'stop',
            new TokenUsage(0, 0, 0),
            $this->visibleReasoning,
        );
    }
}

final class RecordingVisionResolver implements TalosProviderAdapterResolver
{
    public function __construct(private readonly RecordingVisionTurnAdapter $adapter) {}

    public function resolve(TalosModelProfile $profile, string $decryptedSecret): ProviderTurnAdapter
    {
        return $this->adapter;
    }
}
