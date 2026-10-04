# Laya Local Decisions

`@ryu/laya` packages [Convai Innovations' Laya](https://huggingface.co/convaiinnovations/laya)
as a local Ryu decision tool.

Laya answers typed questions over a text, email, ticket, or JSON state. Its three
primitives are `choice`, `score`, and `noul` (a calibrated boolean probability). It
does not generate prose, so it is useful for routing, guardrails, moderation, and
triage rather than autocomplete or grammar correction.

## Install and invoke

Install and enable `Laya Local Decisions` from the Ryu plugin store. Enabling the
plugin provisions a private Python runtime and downloads the three pinned Laya
checkpoints into the plugin runtime. The bundle is about 2.37 GB (2.21 GiB) before
the Python dependencies, so the first enable can take a while and needs free disk space.
The sidecar pins published Laya 0.3.20, which includes the Windows/Python 3.14 startup fix.

Agents can then call `laya.predict`:

Laya is a general typed-decision model, not a computer-use fine-tune. Treat its
Shadow planner profiles as experimental: confidence is a signal, not a
correctness guarantee. Shadow constrains choices to its current action catalog,
revalidates the target, and never submits forms automatically.

```json
{
  "state": {
    "subject": "Duplicate charge",
    "body": "Please refund the second charge or I will cancel."
  },
  "questions": {
    "department": {
      "type": "choice",
      "instructions": "Which team should handle this?",
      "criteria": {
        "billing": "invoices, payments, refunds",
        "technical": "bugs, outages, system errors",
        "other": "everything else"
      }
    },
    "refund_requested": {
      "type": "noul",
      "instructions": "Does the user explicitly request a refund?"
    }
  },
  "model": "router"
}
```

Set `model` to `english`, `multilingual`, or `typed-decisions` when the route should
be explicit. `router` selects English or multilingual from the input. The
`typed-decisions` checkpoint is never selected automatically.

The plugin exposes `laya.status` for availability checks. `laya.predict` is bounded
to a 512 KiB request, 256 KiB state, and 64 questions. Requests go through Core's
authenticated extension proxy and the sidecar rejects unauthenticated direct calls.

## Model and license notes

The manifest pins the Hugging Face repository revision and allowlists the exact
checkpoint files. Core downloads them with its shared resumable downloader into the
plugin's private runtime directory. After enable, `HF_HUB_OFFLINE=1` keeps inference
local. The model is Apache-2.0; keep the upstream model card and repository link with
any redistributed package.

The plugin also contributes its four local profiles to Shadow's model-planner
picker. Shadow calls the sidecar's `/computer-use` adapter, which turns the
current closed action choices into Laya typed-choice questions and returns one
normalized operation/target. Laya still does not generate prose, so it is not the
autocomplete or grammar-correction model; those use separate generation adapters.
