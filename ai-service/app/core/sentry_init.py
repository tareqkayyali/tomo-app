from __future__ import annotations

import sentry_sdk
from sentry_sdk.integrations.asyncio import AsyncioIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration


def init_sentry(dsn: str, environment: str = "production") -> None:
    if not dsn:
        return

    sentry_sdk.init(
        dsn=dsn,
        integrations=[FastApiIntegration(), AsyncioIntegration()],
        traces_sample_rate=0.05,
        environment=environment,
    )
