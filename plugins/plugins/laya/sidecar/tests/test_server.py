"""Exercise the shipped sidecar routes without downloading Laya checkpoints.

The test supplies only the FastAPI/Laya runtime interfaces so it can run in the
repository's lean Python environment. The functions under test are imported
from the production ``server.py`` module, and the router stub records the exact
arguments passed to the real inference seam.
"""

from __future__ import annotations

import asyncio
import importlib.util
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from typing import Any


SIDECAR_ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = SIDECAR_ROOT / "ryu_laya" / "server.py"
# Direct execution puts tests/ on sys.path, whereas discovery from sidecar/
# includes the package root. Both must resolve the shipped decision parser used
# by server.py, without requiring an installed package or inference checkpoint.
sys.path.insert(0, str(SIDECAR_ROOT))


class FakeJSONResponse:
    def __init__(self, content: Any, status_code: int = 200) -> None:
        self.content = content
        self.status_code = status_code


class FakeRequest:
    def __init__(
        self,
        body: Any,
        *,
        method: str = "POST",
        path: str = "/predict",
        authorization: str = "",
    ) -> None:
        self._body = body
        self.method = method
        self.url = types.SimpleNamespace(path=path)
        self.headers = {"authorization": authorization}

    async def json(self) -> Any:
        return self._body


class FakeFastAPI:
    def __init__(self, **_kwargs: Any) -> None:
        pass

    def get(self, *_args: Any, **_kwargs: Any):
        return lambda function: function

    def post(self, *_args: Any, **_kwargs: Any):
        return lambda function: function

    def middleware(self, *_args: Any, **_kwargs: Any):
        return lambda function: function


class FakeRouter:
    def __init__(self) -> None:
        self.calls: list[tuple[Any, ...]] = []

    def predict(self, *args: Any) -> dict[str, Any]:
        self.calls.append(args)
        return {"department": {"value": "billing", "confidence": 0.91}}


def load_production_server():
    fastapi = types.ModuleType("fastapi")
    fastapi.FastAPI = FakeFastAPI  # type: ignore[attr-defined]
    fastapi.Request = object  # type: ignore[attr-defined]
    fastapi.responses = types.SimpleNamespace(JSONResponse=FakeJSONResponse)  # type: ignore[attr-defined]

    responses = types.ModuleType("fastapi.responses")
    responses.JSONResponse = FakeJSONResponse  # type: ignore[attr-defined]
    laya = types.ModuleType("laya")
    laya.__version__ = "test-runtime"  # type: ignore[attr-defined]
    laya.Router = object  # type: ignore[attr-defined]
    uvicorn = types.ModuleType("uvicorn")
    uvicorn.run = lambda *_args, **_kwargs: None  # type: ignore[attr-defined]

    sys.modules.update(
        {
            "fastapi": fastapi,
            "fastapi.responses": responses,
            "laya": laya,
            "uvicorn": uvicorn,
        }
    )
    spec = importlib.util.spec_from_file_location("ryu_laya_test_server", SERVER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load production sidecar module from {SERVER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


server = load_production_server()


class LayaSidecarRouteTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.router = FakeRouter()
        server._get_router = self.get_router
        server._inference_lock = asyncio.Lock()
        server._model_specs = lambda: {"english": "/local/models/english"}

    async def get_router(self) -> FakeRouter:
        return self.router

    async def test_capability_reports_local_typed_decision_contract(self) -> None:
        response = await server.capability()

        self.assertEqual(
            response,
            {
                "available": True,
                "library": "laya",
                "version": "test-runtime",
                "license": "Apache-2.0",
                "source": "convaiinnovations/laya",
                "models": ["english"],
                "primitives": ["choice", "score", "noul"],
                "generates_text": False,
            },
        )

    async def test_health_reports_only_locally_available_models(self) -> None:
        response = await server.health()

        self.assertEqual(
            response,
            {"ok": True, "service": "ryu-laya", "models": ["english"]},
        )

    async def test_models_detects_complete_checkpoints_in_the_local_model_tree(self) -> None:
        original_model_root = server.MODEL_ROOT
        try:
            with tempfile.TemporaryDirectory() as directory:
                model_root = Path(directory)
                server.MODEL_ROOT = model_root
                for relative_path in (
                    "model.safetensors",
                    "rl_agent_config.json",
                    "tokenizer/tokenizer.json",
                    "typed-decisions/model.safetensors",
                    "typed-decisions/rl_agent_config.json",
                    "typed-decisions/tokenizer/tokenizer.json",
                    "multilingual/model.safetensors",
                    "multilingual/rl_agent_config.json",
                ):
                    file_path = model_root / relative_path
                    file_path.parent.mkdir(parents=True, exist_ok=True)
                    file_path.touch()
                response = await server.models()
        finally:
            server.MODEL_ROOT = original_model_root

        self.assertEqual(
            response,
            {
                "models": [
                    {"id": "router", "installed": True},
                    {"id": "english", "installed": True},
                    {"id": "multilingual", "installed": False},
                    {"id": "typed-decisions", "installed": True},
                ]
            },
        )

    def test_router_refuses_to_start_without_an_installed_checkpoint(self) -> None:
        original_model_specs = server._model_specs
        server._model_specs = lambda: {}
        try:
            with self.assertRaisesRegex(RuntimeError, "no Laya checkpoint is installed"):
                server._new_router()
        finally:
            server._model_specs = original_model_specs

    @staticmethod
    def request_body(**overrides: Any) -> dict[str, Any]:
        body = {
            "state": {"subject": "Duplicate charge"},
            "questions": {"department": {"type": "choice"}},
        }
        body.update(overrides)
        return body

    async def test_authenticated_predict_passes_typed_inputs_to_local_router(self) -> None:
        response = await server.predict(FakeRequest(self.request_body(model="english", task="choice", lang="en")))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.content,
            {"department": {"value": "billing", "confidence": 0.91}},
        )
        self.assertEqual(
            self.router.calls,
            [
                (
                    {"subject": "Duplicate charge"},
                    {"department": {"type": "choice"}},
                    "english",
                    "choice",
                    "en",
                )
            ],
        )

    async def test_router_model_uses_automatic_selection_and_optional_hints(self) -> None:
        response = await server.predict(FakeRequest(self.request_body(model="router")))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.router.calls[0][2:], (None, None, None))

    async def test_invalid_questions_and_oversized_state_are_rejected_before_inference(self) -> None:
        invalid_payloads = [
            {"state": {}, "questions": {}},
            self.request_body(questions={"x" * 0: {"type": "choice"}}),
            self.request_body(questions={f"q{index}": {} for index in range(65)}),
            self.request_body(state={"text": "x" * (256 * 1024 + 1)}),
            self.request_body(model="not-installed"),
        ]

        for payload in invalid_payloads:
            with self.subTest(payload_keys=tuple(payload)):
                response = await server.predict(FakeRequest(payload))
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.content["error"]["code"], "invalid_request")

        self.assertEqual(self.router.calls, [])

    async def test_request_size_limit_rejects_large_json_before_inference(self) -> None:
        response = await server.predict(
            FakeRequest(self.request_body(state={"text": "x" * (512 * 1024)}))
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("request body is too large", response.content["error"]["message"])
        self.assertEqual(self.router.calls, [])

    async def test_busy_inference_returns_retryable_429_and_releases_no_fake_result(self) -> None:
        await server._inference_lock.acquire()
        try:
            response = await server.predict(FakeRequest(self.request_body()))
        finally:
            server._inference_lock.release()

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.content["error"]["code"], "inference_busy")
        self.assertEqual(self.router.calls, [])

    async def test_model_failure_is_reported_as_service_unavailable_and_lock_recovers(self) -> None:
        async def fail_router() -> FakeRouter:
            raise RuntimeError("model file missing\ninternal path")

        server._get_router = fail_router
        failed = await server.predict(FakeRequest(self.request_body()))
        self.assertEqual(failed.status_code, 503)
        self.assertEqual(failed.content["error"]["code"], "inference_unavailable")
        self.assertEqual(failed.content["error"]["message"], "model file missing internal path")

        server._get_router = self.get_router
        recovered = await server.predict(FakeRequest(self.request_body()))
        self.assertEqual(recovered.status_code, 200)

    async def test_authentication_is_required_except_for_health(self) -> None:
        old_token = os.environ.get("RYU_EXT_TOKEN")
        os.environ["RYU_EXT_TOKEN"] = "secret-test-token"
        try:
            async def next_response(_request: FakeRequest) -> FakeJSONResponse:
                return FakeJSONResponse({"ok": True})

            rejected = await server.authenticate(FakeRequest({}, path="/predict"), next_response)
            accepted = await server.authenticate(
                FakeRequest({}, path="/predict", authorization="Bearer secret-test-token"),
                next_response,
            )
            health = await server.authenticate(
                FakeRequest({}, method="GET", path="/health"), next_response
            )
        finally:
            if old_token is None:
                os.environ.pop("RYU_EXT_TOKEN", None)
            else:
                os.environ["RYU_EXT_TOKEN"] = old_token

        self.assertEqual(rejected.status_code, 401)
        self.assertEqual(accepted.content, {"ok": True})
        self.assertEqual(health.content, {"ok": True})


if __name__ == "__main__":
    unittest.main(verbosity=2)
