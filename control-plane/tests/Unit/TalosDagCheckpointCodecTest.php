<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Agent\TalosDagCheckpointCodec;
use InvalidArgumentException;
use Kadmos\Tool\ToolResult;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use stdClass;

final class TalosDagCheckpointCodecTest extends TestCase
{
    #[Test]
    public function it_round_trips_object_list_shape_and_typed_tool_results(): void
    {
        $emptyObject = new stdClass;
        $result = new ToolResult(
            toolUseId: 'call-1',
            isError: false,
            content: [['type' => 'text', 'text' => 'ok']],
            structuredContent: ['empty_object' => []],
            evidence: [],
        );
        $state = [
            'nodes' => [
                'node-1' => [
                    'id' => 'node-1',
                    'status' => 'SUCCESS',
                    'payload' => [
                        'call' => ['arguments' => $emptyObject, 'provider_metadata' => $emptyObject],
                        'list' => [],
                    ],
                    'raw_output' => $result,
                ],
            ],
            'dependencies' => ['node-1' => []],
            'children' => ['node-1' => []],
            'consumed_approval_ids' => [],
        ];

        $encoded = TalosDagCheckpointCodec::encode($state);
        $decoded = TalosDagCheckpointCodec::decode($encoded);

        $this->assertInstanceOf(stdClass::class, $decoded['nodes']['node-1']['payload']['call']['arguments']);
        $this->assertSame([], $decoded['nodes']['node-1']['payload']['list']);
        $this->assertInstanceOf(ToolResult::class, $decoded['nodes']['node-1']['raw_output']);
        $this->assertSame('call-1', $decoded['nodes']['node-1']['raw_output']->toolUseId);
        $this->assertSame($encoded, TalosDagCheckpointCodec::encode($decoded));
    }

    #[Test]
    public function it_rejects_untagged_or_malformed_checkpoint_values(): void
    {
        $this->expectException(InvalidArgumentException::class);

        TalosDagCheckpointCodec::decode('{"nodes":[]}');
    }
}
