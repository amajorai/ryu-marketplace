from __future__ import annotations

import base64
import binascii
import json
import re
import socket
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


ACCOUNT_ID_RE = re.compile(r"^[A-Fa-f0-9]{32}$")
QUESTION_ID_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
DATA_URL_RE = re.compile(
    r"^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$",
    re.IGNORECASE,
)
SUPPORTED_MODELS = ("clef", "clef-flash")
SUPPORTED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_REQUEST_BYTES = 13 * 1024 * 1024
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024
MAX_QUESTIONS = 64
UPSTREAM_TIMEOUT_SECONDS = 90


class InvalidRequest(ValueError):
    """A bounded input does not match the Clef request contract."""


class WorkersAiFailure(RuntimeError):
    """Workers AI did not return a successful typed decision."""


class WorkersAiTimeout(WorkersAiFailure):
    """Workers AI did not respond before the fixed request timeout."""


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


def _json_size(value: Any) -> int:
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def _decode_image(encoded: str, content_type: str) -> int:
    if content_type not in SUPPORTED_IMAGE_TYPES:
        raise InvalidRequest("image type must be PNG, JPEG, or WebP")
    try:
        decoded = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as error:
        raise InvalidRequest("image content must be valid base64") from error
    if not decoded or len(decoded) > MAX_IMAGE_BYTES:
        raise InvalidRequest("each image must contain at most 4 MiB of image data")
    return len(decoded)


def _validate_images(images: Any) -> list[str | dict[str, str]]:
    if images is None:
        return []
    if not isinstance(images, list) or len(images) > 4:
        raise InvalidRequest("images must be an array with at most four entries")

    validated: list[str | dict[str, str]] = []
    decoded_total = 0
    for image in images:
        if isinstance(image, str):
            match = DATA_URL_RE.fullmatch(image)
            if match is None:
                raise InvalidRequest("images must be embedded base64 data URLs; remote URLs are not accepted")
            decoded_total += _decode_image(match.group(2), match.group(1).lower())
            validated.append(image)
            continue

        if not isinstance(image, dict):
            raise InvalidRequest("each image must be a data URL or a base64 image object")
        content_type = image.get("content_type")
        encoded = image.get("base64")
        if not isinstance(content_type, str) or not isinstance(encoded, str):
            raise InvalidRequest("base64 image objects require content_type and base64 strings")
        decoded_total += _decode_image(encoded, content_type)
        validated.append({"content_type": content_type, "base64": encoded})

    if decoded_total > MAX_TOTAL_IMAGE_BYTES:
        raise InvalidRequest("combined image data must not exceed 8 MiB")
    return validated


def _validate_questions(questions: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(questions, dict) or not 1 <= len(questions) <= MAX_QUESTIONS:
        raise InvalidRequest("questions must contain between one and 64 entries")

    for question_id, question in questions.items():
        if not isinstance(question_id, str) or QUESTION_ID_RE.fullmatch(question_id) is None:
            raise InvalidRequest("question ids may contain letters, digits, underscore, dot, and hyphen")
        if not isinstance(question, dict):
            raise InvalidRequest("each question definition must be an object")
        question_type = question.get("type")
        if not isinstance(question_type, str) or question_type not in {"noul", "choice", "score"}:
            raise InvalidRequest("question type must be noul, choice, or score")
        if question_type == "choice":
            criteria = question.get("criteria")
            if not isinstance(criteria, dict) or not criteria:
                raise InvalidRequest("choice questions require a non-empty criteria object")
        if question_type == "score":
            criteria = question.get("criteria")
            if not isinstance(criteria, list) or not criteria:
                raise InvalidRequest("score questions require a non-empty criteria list")

    return questions


def validate_request(body: Any) -> dict[str, Any]:
    if not isinstance(body, dict) or "state" not in body or "questions" not in body:
        raise InvalidRequest("state and questions are required")
    if _json_size(body) > MAX_REQUEST_BYTES:
        raise InvalidRequest("request body must not exceed 13 MiB")
    state = body["state"]
    if not isinstance(state, (str, dict, list)):
        raise InvalidRequest("state must be text, a JSON object, or a JSON array")
    model = body.get("model", "clef")
    if not isinstance(model, str) or model not in SUPPORTED_MODELS:
        raise InvalidRequest("model must be clef or clef-flash")

    result: dict[str, Any] = {
        "model": model,
        "state": state,
        "questions": _validate_questions(body["questions"]),
    }
    images = _validate_images(body.get("images"))
    if images:
        result["images"] = images
    return result


def _workers_ai_url(account_id: str, model: str) -> str:
    if not isinstance(account_id, str) or ACCOUNT_ID_RE.fullmatch(account_id) is None:
        raise InvalidRequest("Cloudflare account ID must be 32 hexadecimal characters")
    if model not in SUPPORTED_MODELS:
        raise InvalidRequest("model must be clef or clef-flash")
    return (
        "https://api.cloudflare.com/client/v4/accounts/"
        f"{account_id}/ai/run/@cf/cloudflare/{model}"
    )


def request_workers_ai(
    payload: dict[str, Any],
    account_id: str,
    api_token: str,
    opener: Any = None,
) -> dict[str, Any]:
    url = _workers_ai_url(account_id, payload["model"])
    if not isinstance(api_token, str) or not api_token or "\r" in api_token or "\n" in api_token:
        raise InvalidRequest("Cloudflare API token is not configured")

    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    client = opener or build_opener(_NoRedirectHandler())
    try:
        response = client.open(request, timeout=UPSTREAM_TIMEOUT_SECONDS)
        with response:
            if not 200 <= response.status < 300:
                raise WorkersAiFailure("Cloudflare Workers AI returned an unsuccessful response")
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except HTTPError as error:
        raise WorkersAiFailure("Cloudflare Workers AI returned an unsuccessful response") from error
    except (TimeoutError, socket.timeout) as error:
        raise WorkersAiTimeout("Cloudflare Workers AI did not respond in time") from error
    except URLError as error:
        if isinstance(error.reason, (TimeoutError, socket.timeout)):
            raise WorkersAiTimeout("Cloudflare Workers AI did not respond in time") from error
        raise WorkersAiFailure("Cloudflare Workers AI request failed") from error

    if len(raw) > MAX_RESPONSE_BYTES:
        raise WorkersAiFailure("Cloudflare Workers AI response exceeded the size limit")
    try:
        envelope = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise WorkersAiFailure("Cloudflare Workers AI returned an invalid response") from error
    if not isinstance(envelope, dict) or envelope.get("success") is not True:
        raise WorkersAiFailure("Cloudflare Workers AI could not complete the decision")

    result = envelope.get("result", envelope)
    if not isinstance(result, dict) or not isinstance(result.get("answers"), dict):
        raise WorkersAiFailure("Cloudflare Workers AI response did not contain typed answers")
    return {**result, "model": payload["model"]}
