"""Shared text and injectable clock conventions; no HTTP or storage dependency."""

from collections.abc import Callable
from datetime import UTC, datetime

# Exact String.prototype.trim WhiteSpace + LineTerminator set. Python strip()
# additionally removes U+001C..U+001F/U+0085 and misses U+FEFF.
ECMASCRIPT_TRIM = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(UTC)


def clock_instant(clock: Clock) -> datetime:
    value = clock()
    if value.utcoffset() is None:
        raise ValueError("Clock must return a timezone-aware instant")
    return value.astimezone(UTC)
