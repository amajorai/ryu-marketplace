# Needle 3 Local Planner

This plugin bundles the pinned [Cactus Compute Needle 3](https://huggingface.co/Cactus-Compute/needle3) weights into Ryu's private plugin runtime and contributes the model to Shadow's computer-use planner picker. Needle uses its own compact tool-calling runtime; it is not sent through Laya's classifier API.

Install and enable `Needle 3 Local Planner`, then select `Needle 3 · Base` under Shadow → Computer use → Local model plugin. The first enable downloads the 35 MB model archive and provisions the Python sidecar. The plugin's runtime package may fetch its small platform engine on first use; inference and the model weights remain local.

The sidecar supports host Python 3.11–3.14.

The model is Apache-2.0. Its request is limited to Shadow's current goal, visible accessibility candidates, and closed action choices. Its response is reduced to one operation and an optional current target id; Shadow validates both again before any input is sent. The fine-tuned confidence head is uncalibrated and reports `null`, so the adapter accepts only one zero-argument tool call from the current closed action catalog. If the runtime supplies a numeric confidence, the adapter applies its local threshold.

The model is intentionally small, so ambiguous pages may yield no action. Shadow never presses Enter or submits forms automatically. Text entry continues to use Shadow's configured text model.
