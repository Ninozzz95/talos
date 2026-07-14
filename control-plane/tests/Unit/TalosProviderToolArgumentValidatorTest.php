<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Agent\TalosProviderToolArgumentValidator;
use Kadmos\Tool\ToolCall;
use Tests\TestCase;

final class TalosProviderToolArgumentValidatorTest extends TestCase
{
    public function test_accepts_valid_server_owned_schemas_including_empty_nested_objects(): void
    {
        $validator = app(TalosProviderToolArgumentValidator::class);

        $this->assertNull($validator->validate(new ToolCall(
            'call-valid-search',
            'web_search',
            ['query' => 'AVM', 'options' => []],
            null,
            [],
        )));
        $this->assertNull($validator->validate(new ToolCall(
            'call-valid-snapshot',
            'browser_snapshot',
            [],
            null,
            [],
        )));
    }

    public function test_reports_required_bounds_additional_properties_any_of_and_uri_format_faults(): void
    {
        $validator = app(TalosProviderToolArgumentValidator::class);
        $cases = [
            ['web_search', [], 'required'],
            ['web_search', ['query' => ''], 'minLength'],
            ['web_search', ['query' => 'AVM', 'unexpected' => true], 'additionalProperties'],
            ['browser_read', [], 'required'],
            ['browser_navigate', ['url' => 'not a uri'], 'format'],
            ['web_fetch', ['url' => 'https://example.com', 'timeout_ms' => 0], 'minimum'],
        ];

        foreach ($cases as $index => [$toolName, $arguments, $keyword]) {
            $fault = $validator->validate(new ToolCall(
                'call-invalid-'.$index,
                $toolName,
                $arguments,
                null,
                [],
            ));

            $this->assertNotNull($fault, 'Invalid provider arguments were accepted for '.$toolName.'.');
            $this->assertSame('TALOS_TOOL_ARGUMENTS_INVALID', $fault->code);
            $this->assertSame($keyword, $fault->keyword);
            $this->assertLessThanOrEqual(512, strlen($fault->message));
        }
    }

    public function test_unknown_tool_names_fail_closed_without_accepting_provider_owned_schemas(): void
    {
        $fault = app(TalosProviderToolArgumentValidator::class)->validate(new ToolCall(
            'call-unknown',
            'provider_invented_tool',
            ['anything' => true],
            null,
            [],
        ));

        $this->assertNotNull($fault);
        $this->assertSame('tool_name', $fault->keyword);
        $this->assertSame('/', $fault->path);
    }
}
