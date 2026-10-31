from datetime import datetime, timezone


def utc_aware(value: datetime) -> datetime:
    """SQLite may return timezone-naive values for timezone=True columns."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
