<?php

declare(strict_types=1);

namespace Kadmos\Workers;

/** Marker for sanitized worker control flow that a durable caller must recover. */
interface NodeWorkerControlException
{
}
