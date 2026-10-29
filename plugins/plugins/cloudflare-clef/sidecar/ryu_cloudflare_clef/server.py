from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
from typing import Any

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .provider import (
	InvalidRequest,
	WorkersAiFailure,
	WorkersAiTimeout,
	request_workers_ai,
	validate_request,
)


LOGGER = logging.getLogger("ryu_cloudflare_clef")
MAX_REQUEST_BYTES = 13 * 1024 * 1024

app = FastAPI(
	title="Ryu Cloudflare Clef",
	version="0.1.0",
	description="Authenticated adapter for Cloudflare Workers AI Clef typed decisions.",
)


@app.middleware("http")
async def authenticate(request: Request, call_next):
	if request.method == "GET" and request.url.path == "/health":
		return await call_next(request)
	expected = os.environ.get("RYU_EXT_TOKEN", "")
	supplied = request.headers.get("authorization", "")
	if not expected or not supplied.startswith("Bearer ") or not hmac.compare_digest(
		supplied[7:].strip(), expected
	):
		return JSONResponse(
			status_code=401,
			content={"error": {"code": "unauthorized", "message": "sidecar authorization required"}},
		)
	return await call_next(request)


@app.get("/health")
async def health() -> dict[str, Any]:
	return {"ok": True, "service": "ryu-cloudflare-clef"}


@app.post("/predict")
async def predict(request: Request) -> JSONResponse:
	raw = await request.body()
	if len(raw) > MAX_REQUEST_BYTES:
		return JSONResponse(
			status_code=413,
			content={"error": {"code": "request_too_large", "message": "request body must not exceed 13 MiB"}},
		)
	try:
		body = json.loads(raw)
		payload = validate_request(body)
		account_id = os.environ.get("RYU_CLOUDFLARE_ACCOUNT_ID", "")
		api_token = os.environ.get("RYU_CLOUDFLARE_API_TOKEN", "")
		if not account_id or not api_token:
			return JSONResponse(
				status_code=503,
				content={"error": {"code": "cloudflare_not_configured", "message": "Configure the Cloudflare account ID and API token in this node's settings."}},
			)
		result = await asyncio.to_thread(
			request_workers_ai,
			payload,
			account_id,
			api_token,
		)
	except (json.JSONDecodeError, InvalidRequest) as error:
		return JSONResponse(
			status_code=400,
			content={"error": {"code": "invalid_request", "message": str(error)}},
		)
	except WorkersAiTimeout:
		LOGGER.warning("Workers AI decision request timed out")
		return JSONResponse(
			status_code=504,
			content={"error": {"code": "workers_ai_timeout", "message": "Cloudflare Workers AI did not respond in time."}},
		)
	except WorkersAiFailure:
		LOGGER.warning("Workers AI decision request failed")
		return JSONResponse(
			status_code=502,
			content={"error": {"code": "workers_ai_failed", "message": "Cloudflare Workers AI could not complete the decision."}},
		)
	return JSONResponse(content=result)


def run() -> None:
	logging.basicConfig(level=os.environ.get("RYU_CLOUDFLARE_CLEF_LOG_LEVEL", "INFO"))
	host = os.environ.get("RYU_CLOUDFLARE_CLEF_HOST", "127.0.0.1")
	port = int(os.environ.get("RYU_CLOUDFLARE_CLEF_PORT", "18154"))
	uvicorn.run(app, host=host, port=port, log_level="info")
