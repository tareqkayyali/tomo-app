from __future__ import annotations

import asyncio
import traceback

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.debug_logger import log_app_error


class ErrorObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        trace_id = request.headers.get("x-trace-id", "")
        request_id = request.headers.get("x-request-id", "")

        try:
            return await call_next(request)
        except Exception as exc:
            asyncio.create_task(
                log_app_error(
                    message=str(exc)[:2000],
                    error_type=type(exc).__name__,
                    error_code="ERR_PY_SYSTEM_INTERNAL",
                    stack_trace=traceback.format_exc(),
                    user_id=request.headers.get("x-tomo-user-id", ""),
                    trace_id=trace_id,
                    request_id=request_id,
                    endpoint=request.url.path,
                    severity="high",
                    metadata={"method": request.method},
                )
            )
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal server error",
                    "trace_id": trace_id,
                },
            )
