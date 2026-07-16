<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

enum BrowserActionKind: string
{
    case Navigate = 'navigate';
    case Snapshot = 'snapshot';
    case Screenshot = 'screenshot';
    case Read = 'read';
    case Click = 'click';
    case Type = 'type';
    case Select = 'select';
    case Check = 'check';
    case Scroll = 'scroll';
    case Hover = 'hover';
    case Key = 'key';
    case Drag = 'drag';
    case Upload = 'upload';
    case Download = 'download';
    case Tab = 'tab';
    case History = 'history';
    case Dialog = 'dialog';
}
