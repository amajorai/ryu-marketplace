from __future__ import annotations

import json
import unittest
import os
import sys
import types
import importlib
from unittest.mock import patch
from typing import Any
from urllib.error import URLError
from urllib.request import Request
import socket

from ryu_cloudflare_clef.provider import (
	InvalidRequest,
	WorkersAiFailure,
	WorkersAiTimeout,
	request_workers_ai,
	validate_request,
)


class RaisingOpener:
	def __init__(self, error: Exception) -> None:
		self.error = error
		self.calls = 0

	def open(self, request: Request, timeout: int):
		self.calls += 1
		raise self.error


class FakeResponse:
	def __init__(self, status: int, body: dict[str, Any]) -> None:
		self.status = status
		self.body = json.dumps(body).encode("utf-8")

	def __enter__(self) -> FakeResponse:
		return self

	def __exit__(self, *_args: Any) -> None:
		return None

	def read(self, limit: int) -> bytes:
		return self.body[:limit]


class FakeOpener:
	def __init__(self, response: FakeResponse) -> None:
		self.response = response
		self.request: Request | None = None
		self.timeout: int | None = None

	def open(self, request: Request, timeout: int) -> FakeResponse:
		self.request = request
		self.timeout = timeout
		return self.response


class ValidationTests(unittest.TestCase):
	def test_accepts_typed_questions_and_embedded_images(self) -> None:
		body = validate_request(
			{
				"state": {"ticket": "checkout failing"},
				"questions": {
					"urgent": {"type": "noul", "instructions": "Is it urgent?"},
					"team": {
						"type": "choice",
						"instructions": "Choose a team.",
						"criteria": {"billing": "Payments", "technical": "Outages"},
					},
					"severity": {
						"type": "score",
						"instructions": "Score the impact.",
						"criteria": ["low", "high"],
					},
				},
				"images": [
					"data:image/png;base64,aGVsbG8=",
					{"content_type": "image/jpeg", "base64": "aGVsbG8="},
				],
				"model": "clef-flash",
			}
		)
		self.assertEqual(body["model"], "clef-flash")
		self.assertEqual(len(body["questions"]), 3)
		self.assertEqual(len(body["images"]), 2)

	def test_rejects_remote_images_and_unknown_model_ids(self) -> None:
		base = {"state": "hello", "questions": {"q": {"type": "noul"}}}
		with self.assertRaises(InvalidRequest):
			validate_request({**base, "images": ["https://example.com/image.png"]})
		with self.assertRaises(InvalidRequest):
			validate_request({**base, "model": "@cf/cloudflare/clef"})

	def test_rejects_invalid_question_ids_and_empty_questions(self) -> None:
		with self.assertRaises(InvalidRequest):
			validate_request({"state": "x", "questions": {"bad/id": {"type": "noul"}}})
		with self.assertRaises(InvalidRequest):
			validate_request({"state": "x", "questions": {}})


class WorkersAiRequestTests(unittest.TestCase):
	def test_sends_the_selected_model_and_normalizes_workers_ai_result(self) -> None:
		opener = FakeOpener(
			FakeResponse(
				200,
				{
					"success": True,
					"result": {
						"answers": {"urgent": {"probability": 0.91}},
						"usage": {"input_tokens": 28},
					},
				},
			)
		)
		result = request_workers_ai(
			{
				"model": "clef-flash",
				"state": "Checkout is failing",
				"questions": {"urgent": {"type": "noul", "instructions": "Urgent?"}},
			},
			"0123456789abcdef0123456789abcdef",
			"test-token",
			opener=opener,
		)

		self.assertIsNotNone(opener.request)
		assert opener.request is not None
		self.assertEqual(
			opener.request.full_url,
			"https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/run/@cf/cloudflare/clef-flash",
		)
		self.assertEqual(opener.request.get_header("Authorization"), "Bearer test-token")
		self.assertEqual(json.loads(opener.request.data)["model"], "clef-flash")
		self.assertEqual(opener.timeout, 90)
		self.assertEqual(result["model"], "clef-flash")
		self.assertEqual(result["answers"]["urgent"]["probability"], 0.91)
		self.assertEqual(result["usage"]["input_tokens"], 28)

	def test_rejects_invalid_account_ids_before_network_access(self) -> None:
		with self.assertRaises(InvalidRequest):
			request_workers_ai(
				{
					"model": "clef",
					"state": "hello",
					"questions": {"q": {"type": "noul"}},
				},
				"not-an-account-id",
				"test-token",
				opener=FakeOpener(FakeResponse(500, {})),
			)

	def test_refuses_missing_success_marker_and_oversized_responses(self) -> None:
		payload = {
			"model": "clef",
			"state": "hello",
			"questions": {"q": {"type": "noul"}},
		}
		account = "0123456789abcdef0123456789abcdef"
		with self.assertRaises(WorkersAiFailure):
			request_workers_ai(
				payload,
				account,
				"test-token",
				opener=FakeOpener(FakeResponse(200, {"result": {"answers": {"q": {"value": True}}}})),
			)

		oversized = {"success": True, "result": {"answers": {"q": "x" * (2 * 1024 * 1024)}}}
		with self.assertRaises(WorkersAiFailure):
			request_workers_ai(payload, account, "test-token", opener=FakeOpener(FakeResponse(200, oversized)))

	def test_maps_timeout_and_transport_failures_without_retry(self) -> None:
		payload = {
			"model": "clef",
			"state": "hello",
			"questions": {"q": {"type": "noul"}},
		}
		account = "0123456789abcdef0123456789abcdef"
		timeout_opener = RaisingOpener(URLError(socket.timeout("fixture timeout")))
		with self.assertRaises(WorkersAiTimeout):
			request_workers_ai(payload, account, "test-token", opener=timeout_opener)
		self.assertEqual(timeout_opener.calls, 1)

		failure_opener = RaisingOpener(URLError("fixture transport refusal"))
		with self.assertRaises(WorkersAiFailure):
			request_workers_ai(payload, account, "test-token", opener=failure_opener)
		self.assertEqual(failure_opener.calls, 1)

	def test_rejects_redirects_and_malformed_decision_responses(self) -> None:
		payload = {
			"model": "clef",
			"state": "hello",
			"questions": {"q": {"type": "noul"}},
		}
		account = "0123456789abcdef0123456789abcdef"
		with self.assertRaises(WorkersAiFailure):
			request_workers_ai(
				payload,
				account,
				"test-token",
				opener=FakeOpener(FakeResponse(302, {"location": "https://elsewhere.invalid"})),
			)
		with self.assertRaises(WorkersAiFailure):
			request_workers_ai(
				payload,
				account,
				"test-token",
				opener=FakeOpener(FakeResponse(200, {"success": True, "result": {"text": "not typed"}})),
			)


if __name__ == "__main__":
	unittest.main()


class RouteTests(unittest.IsolatedAsyncioTestCase):
	@classmethod
	def setUpClass(cls):
		class App:
			def __init__(self, **kwargs): pass
			def middleware(self, *_args): return lambda fn: fn
			def get(self, *_args): return lambda fn: fn
			def post(self, *_args): return lambda fn: fn
		class Response:
			def __init__(self, content, status_code=200):
				self.content = content
				self.status_code = status_code
		fastapi = types.ModuleType("fastapi")
		fastapi.FastAPI = App
		fastapi.Request = object
		responses = types.ModuleType("fastapi.responses")
		responses.JSONResponse = Response
		with patch.dict(sys.modules, {"fastapi": fastapi, "fastapi.responses": responses, "uvicorn": types.ModuleType("uvicorn")}):
			cls.server = importlib.import_module("ryu_cloudflare_clef.server")

	async def test_node_credentials_reach_fixed_https_upstream_without_request_headers(self):
		payload = {"state": "ticket", "questions": {"urgent": {"type": "noul"}}, "model": "clef-flash"}
		class RequestFixture:
			headers = {"x-cloudflare-api-token": "caller-must-not-control-token"}
			async def body(self): return json.dumps(payload).encode()
		opener = FakeOpener(FakeResponse(200, {"success": True, "result": {"answers": {"urgent": {"value": True, "probability": 0.91}}, "usage": {"input_tokens": 28}}}))
		def upstream(body, account, token):
			return request_workers_ai(body, account, token, opener=opener)
		with patch.dict(os.environ, {"RYU_CLOUDFLARE_ACCOUNT_ID": "0123456789abcdef0123456789abcdef", "RYU_CLOUDFLARE_API_TOKEN": "sidecar-synthetic-token"}), patch.object(self.server, "request_workers_ai", upstream):
			response = await self.server.predict(RequestFixture())
		self.assertEqual(response.status_code, 200)
		self.assertEqual(opener.request.get_header("Authorization"), "Bearer sidecar-synthetic-token")
		self.assertTrue(opener.request.full_url.startswith("https://api.cloudflare.com/client/v4/accounts/"))
		self.assertNotIn("sidecar-synthetic-token", opener.request.data.decode())
		self.assertNotIn("sidecar-synthetic-token", json.dumps(response.content))

	async def test_missing_node_credentials_cannot_be_supplied_by_caller(self):
		class RequestFixture:
			headers = {"x-cloudflare-account-id": "0123456789abcdef0123456789abcdef", "x-cloudflare-api-token": "caller-token"}
			async def body(self): return json.dumps({"state": "ticket", "questions": {"urgent": {"type": "noul"}}}).encode()
		with patch.dict(os.environ, {}, clear=True), patch.object(self.server, "request_workers_ai") as upstream:
			response = await self.server.predict(RequestFixture())
		self.assertEqual(response.status_code, 503)
		self.assertEqual(response.content["error"]["code"], "cloudflare_not_configured")
		upstream.assert_not_called()


class AuthenticationTests(unittest.IsolatedAsyncioTestCase):
	@classmethod
	def setUpClass(cls):
		if "ryu_cloudflare_clef.server" in sys.modules:
			cls.server = sys.modules["ryu_cloudflare_clef.server"]
			return
		class App:
			def __init__(self, **kwargs): pass
			def middleware(self, *_args): return lambda fn: fn
			def get(self, *_args): return lambda fn: fn
			def post(self, *_args): return lambda fn: fn
		class Response:
			def __init__(self, content, status_code=200):
				self.content = content
				self.status_code = status_code
		fastapi = types.ModuleType("fastapi")
		fastapi.FastAPI = App
		fastapi.Request = object
		responses = types.ModuleType("fastapi.responses")
		responses.JSONResponse = Response
		with patch.dict(sys.modules, {"fastapi": fastapi, "fastapi.responses": responses, "uvicorn": types.ModuleType("uvicorn")}):
			cls.server = importlib.import_module("ryu_cloudflare_clef.server")

	async def test_authentication_refuses_missing_or_wrong_token_and_allows_exact_token(self):
		class Url:
			path = "/predict"
		class RequestFixture:
			method = "POST"
			url = Url()
			def __init__(self, authorization=""):
				self.headers = {"authorization": authorization} if authorization else {}
		called = 0
		async def next_handler(_request):
			nonlocal called
			called += 1
			return "accepted"
		with patch.dict(os.environ, {"RYU_EXT_TOKEN": "node-owned-token"}, clear=True):
			missing = await self.server.authenticate(RequestFixture(), next_handler)
			wrong = await self.server.authenticate(RequestFixture("Bearer wrong"), next_handler)
			accepted = await self.server.authenticate(RequestFixture("Bearer node-owned-token"), next_handler)
		self.assertEqual(missing.status_code, 401)
		self.assertEqual(wrong.status_code, 401)
		self.assertEqual(accepted, "accepted")
		self.assertEqual(called, 1)

	async def test_health_is_the_only_route_that_bypasses_authentication(self):
		class Url:
			path = "/health"
		class RequestFixture:
			method = "GET"
			url = Url()
			headers = {}
		async def next_handler(_request): return "healthy"
		with patch.dict(os.environ, {}, clear=True):
			self.assertEqual(await self.server.authenticate(RequestFixture(), next_handler), "healthy")
