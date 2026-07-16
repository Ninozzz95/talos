<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

enum BrowserArtifactKind: string
{
    case Snapshot = 'snapshot';
    case Screenshot = 'screenshot';
    case Download = 'download';
    case Upload = 'upload';
    case Trace = 'trace';
}
