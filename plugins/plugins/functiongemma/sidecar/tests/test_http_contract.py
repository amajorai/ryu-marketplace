"""Real ASGI/auth/decision handlers with bounded model-output fixtures.

The installed FastAPI/Starlette stack is real. Only the inference library and
its output are controlled: these tests neither load weights nor execute actions,
start sockets, download models, or establish real-model accuracy.
"""

import asyncio
from contextlib import nullcontext
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


def questions():
    return {
        "operation": {"criteria": {"CLICK": "click", "TYPE_TEXT": "type", "DONE": "done"}},
        "click_target": {"criteria": {"1": {"element": "Save", "role": "button"}}},
        "type_text_target": {"criteria": {"2": {"element": "Name", "role": "textbox"}}},
    }


class PlannerHttpTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.manifest = json.loads((Path(__file__).resolve().parents[2] / "manifest.json").read_text())
        self.planner = self.manifest["contributes"]["computer_use_planners"][0]
        self.runtime_calls = []
        self.next_error = None
        self.next_operation = "TYPE_TEXT"
        self.next_target = "2"
        self.environment = patch.dict(os.environ, {"RYU_EXT_TOKEN": "planner-protocol-fixture-token"})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        # Avoid importing or initializing heavy model runtimes in this protocol suite.
        modules = self.runtime_modules()
        self.dependencies = patch.dict(sys.modules, modules)
        self.dependencies.start()
        self.addCleanup(self.dependencies.stop)
        path = Path(__file__).resolve().parents[1] / "ryu_functiongemma" / "server.py"
        spec = importlib.util.spec_from_file_location("ryu_functiongemma_http_contract_fixture", path)
        self.server = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.server)
        self.directory = tempfile.TemporaryDirectory(prefix="ryu_functiongemma-http-contract-")
        self.addCleanup(self.directory.cleanup)
        self.server.MODEL_FILE = Path(self.directory.name) / "model.safetensors"
        self.configure_runtime()

    async def request(self, method, path, body=None, *, token="planner-protocol-fixture-token", raw=None):
        payload = raw if raw is not None else json.dumps(body).encode() if body is not None else b""
        headers = [(b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode())]
        if token is not None:
            headers.append((b"authorization", f"Bearer {token}".encode()))
        scope = {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"},
                 "http_version": "1.1", "method": method, "scheme": "http", "path": path,
                 "raw_path": path.encode(), "query_string": b"", "root_path": "",
                 "headers": headers, "client": ("127.0.0.1", 12345), "server": ("127.0.0.1", 80)}
        messages = []
        delivered = False
        completed = asyncio.Event()

        async def receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": payload, "more_body": False}
            await completed.wait()
            return {"type": "http.disconnect"}

        async def send(message):
            messages.append(message)
            if message["type"] == "http.response.body" and not message.get("more_body", False):
                completed.set()

        await asyncio.wait_for(self.server.app(scope, receive, send), timeout=3)
        status = next(message["status"] for message in messages if message["type"] == "http.response.start")
        content = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
        return status, json.loads(content)

    def body(self):
        return {"model_id": self.planner["model_id"], "state": {"task": "Enter a name", "page": {"title": "Draft"}, "recent_actions": []},
                "questions": questions()}

    async def test_authorization_precedes_model_inference_and_health_stays_public(self):
        for token in (None, "wrong-token"):
            with self.subTest(token=token):
                status, content = await self.request("POST", "/computer-use", self.body(), token=token)
                self.assertEqual((status, content["error"]["code"]), (401, "unauthorized"))
        with patch.dict(os.environ, {"RYU_EXT_TOKEN": ""}):
            status, content = await self.request("POST", "/computer-use", self.body())
            self.assertEqual((status, content["error"]["code"]), (401, "unauthorized"))
        status, content = await self.request("GET", "/capability", token=None)
        self.assertEqual((status, content["error"]["code"]), (401, "unauthorized"))
        status, content = await self.request("GET", "/health", token=None)
        self.assertEqual(status, 200)
        self.assertEqual(content, {"ok": True, "service": "ryu-functiongemma", "model_installed": False})
        self.assertEqual(self.runtime_calls, [])

    async def test_valid_current_target_is_normalized_by_the_production_parser(self):
        self.server.MODEL_FILE.touch()  # Presence sentinel only; the fixture never loads weight bytes.
        status, content = await self.request("POST", "/computer-use", self.body())
        self.assertEqual(status, 200)
        self.assertEqual(content, {"operation": "TYPE_TEXT", "target": "2"})
        self.assertEqual(len(self.runtime_calls), 1)
        self.assertEqual(self.runtime_calls[0]["max_new_tokens"], 64)
        parameters = self.template["tools"][0]["function"]["parameters"]
        self.assertEqual(parameters["properties"]["operation"]["enum"], ["CLICK", "DONE", "TYPE_TEXT"])
        self.assertEqual(parameters["properties"]["target"]["enum"], ["none", "1", "2"])
        self.assertEqual(self.decoded_tokens, [21, 22])
        observation_text = self.template["messages"][1]["content"].split("untrusted UI data:\n", 1)[1]
        observations = json.loads(observation_text)
        self.assertEqual([(control["id"], control["operation"]) for control in observations["controls"]], [("1", "CLICK"), ("2", "TYPE_TEXT")])
        self.assertEqual(self.runtime_calls[0]["do_sample"], False)


    async def test_invalid_requests_are_rejected_without_inference(self):
        valid = self.body()
        for body in ([], {**valid, "model_id": "remote-model"}, {**valid, "questions": {}},
                     {**valid, "state": {"task": " "}}, {**valid, "state": []}):
            with self.subTest(body=body):
                status, content = await self.request("POST", "/computer-use", body)
                self.assertEqual((status, content["error"]["code"]), (400, "invalid_request"))
        status, content = await self.request("POST", "/computer-use", raw=b"{malformed")
        self.assertEqual((status, content["error"]["code"]), (400, "invalid_request"))
        self.assertEqual(self.runtime_calls, [])

    async def test_state_and_question_bounds_are_rejected_before_inference(self):
        for body in (
            {**self.body(), "state": {"task": "x" * (self.server.MAX_STATE_BYTES + 1)}},
            {**self.body(), "questions": {str(i): {"criteria": {"DONE": "done"}} for i in range(self.server.MAX_QUESTIONS + 1)}},
        ):
            with self.subTest(body_kind="state" if len(body["questions"]) == 3 else "questions"):
                status, content = await self.request("POST", "/computer-use", body)
                self.assertEqual((status, content["error"]["code"]), (400, "invalid_request"))
        self.assertEqual(self.runtime_calls, [])

    async def test_missing_model_files_report_provisioning_error_then_retry_without_stuck_lock(self):
        # Exercise the real loader's missing-file branch, then restore the controlled model boundary.
        self.loader.stop()
        try:
            status, content = await self.request("POST", "/computer-use", self.body())
            self.assertEqual((status, content["error"]["code"]), (503, "inference_unavailable"))
            self.assertIn("accept Google's Gemma terms", content["error"]["message"])
            self.assertEqual(self.runtime_calls, [])
            self.assertFalse(self.server._inference_lock.locked())
        finally:
            self.loader.start()
        status, content = await self.request("POST", "/computer-use", self.body())
        self.assertEqual((status, content), (200, {"operation": "TYPE_TEXT", "target": "2"}))

    async def test_oversized_request_is_rejected_without_inference(self):
        body = self.body()
        body["padding"] = "x" * self.server.MAX_REQUEST_BYTES
        status, content = await self.request("POST", "/computer-use", body)
        self.assertEqual((status, content["error"]["code"]), (413, "request_too_large"))
        self.assertEqual(self.runtime_calls, [])

    async def test_invalid_current_target_never_becomes_success_and_retry_uses_fresh_catalog(self):
        self.server.MODEL_FILE.touch()
        self.next_operation, self.next_target = "CLICK", "2"  # 2 is a TYPE_TEXT target, never a click target.
        status, content = await self.request("POST", "/computer-use", self.body())
        self.assertEqual((status, content["error"]["code"]), (503, "inference_unavailable"))
        self.assertNotIn("operation", content)
        self.next_target = "3"
        body = self.body()
        body["questions"]["click_target"]["criteria"] = {"3": {"element": "Confirm", "role": "button"}}
        status, content = await self.request("POST", "/computer-use", body)
        self.assertEqual((status, content), (200, {"operation": "CLICK", "target": "3"}))
        self.assertFalse(self.server._inference_lock.locked())

    async def test_busy_request_does_not_infer_and_retries_after_release(self):
        self.server.MODEL_FILE.touch()
        self.server._inference_lock.acquire()
        try:
            status, content = await self.request("POST", "/computer-use", self.body())
            self.assertEqual((status, content["error"]["code"]), (429, "inference_busy"))
            self.assertEqual(self.runtime_calls, [])
        finally:
            self.server._inference_lock.release()
        status, content = await self.request("POST", "/computer-use", self.body())
        self.assertEqual((status, content), (200, {"operation": "TYPE_TEXT", "target": "2"}))
        self.assertFalse(self.server._inference_lock.locked())

    async def test_inference_failure_releases_lock_and_returns_bounded_error_before_retry(self):
        self.server.MODEL_FILE.touch()
        self.next_error = RuntimeError("local model unavailable\n" + "x" * 600)
        status, content = await self.request("POST", "/computer-use", self.body())
        self.assertEqual((status, content["error"]["code"]), (503, "inference_unavailable"))
        self.assertTrue(content["error"]["message"].startswith("local model unavailable "))
        self.assertLessEqual(len(content["error"]["message"]), 320)
        self.assertNotIn("\n", content["error"]["message"])
        self.assertFalse(self.server._inference_lock.locked())
        self.next_error = None
        status, content = await self.request("POST", "/computer-use", self.body())
        self.assertEqual((status, content), (200, {"operation": "TYPE_TEXT", "target": "2"}))

    async def test_capability_tracks_installed_file_and_declares_the_actual_planner_contract(self):
        for installed in (False, True, False):
            with self.subTest(installed=installed):
                if installed:
                    self.server.MODEL_FILE.touch()
                elif self.server.MODEL_FILE.exists():
                    self.server.MODEL_FILE.unlink()
                status, content = await self.request("GET", "/capability")
                self.assertEqual(status, 200)
                self.assertEqual(content["available"], installed)
                self.assertEqual(content["model_id"], self.planner["model_id"])
                self.assertEqual(content["planner_contract"], "ryu-computer-use-v1")
        self.assertEqual(self.runtime_calls, [])

    def runtime_modules(self):
        torch = types.ModuleType("torch")
        torch.inference_mode = nullcontext
        transformers = types.ModuleType("transformers")
        transformers.AutoModelForCausalLM = object
        transformers.AutoProcessor = object
        return {"torch": torch, "transformers": transformers}

    def configure_runtime(self):
        owner = self

        class Inputs(dict):
            def to(self, device):
                return self

        class Processor:
            eos_token_id = 1

            def apply_chat_template(self, messages, **kwargs):
                owner.template = {"messages": messages, **kwargs}
                return Inputs(input_ids=types.SimpleNamespace(shape=(1, 3)))

            def decode(self, tokens, **kwargs):
                owner.decoded_tokens = tokens
                return (
                    "<start_function_call>call:computer_use_action{"
                    f"operation:<escape>{owner.next_operation}<escape>,target:<escape>{owner.next_target}<escape>"
                    "}<end_function_call>"
                )

        class Model:
            device = "cpu"

            def generate(self, **kwargs):
                owner.runtime_calls.append(kwargs)
                if owner.next_error:
                    raise owner.next_error
                return [[11, 12, 13, 21, 22]]

        self.loader = patch.object(self.server, "_load_model", return_value=(Model(), Processor()))
        self.loader.start()
        self.addCleanup(self.loader.stop)



if __name__ == "__main__":
    unittest.main()
