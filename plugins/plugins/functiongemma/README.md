# FunctionGemma Local Planner

This plugin provisions a pinned [Google FunctionGemma 270M](https://huggingface.co/google/functiongemma-270m-it) snapshot into Ryu's private plugin runtime. Enable the model in Hugging Face first by accepting Google's Gemma terms, then save a Hugging Face token in Ryu Settings → Integrations before enabling this plugin. Ryu uses its existing Hugging Face token path for both gated snapshot discovery and file downloads; the token is never sent to the model sidecar.

The weights and tokenizer are about 575 MB. The PyTorch/Transformers runtime requires additional disk space and memory; this plugin uses CPU inference and may be slower than a quantized local runtime. Select `FunctionGemma · 270M` under Shadow → Computer use → Local model plugin.

The isolated sidecar supports host Python 3.11–3.14 and pins PyTorch 2.10.0 with Transformers 4.57.1.

The plugin passes only the current goal and a bounded set of closed operation/target choices. It parses FunctionGemma's function-call format, checks the call against those choices, and returns a normalized decision. Shadow independently checks the operation, target, focused window, and live accessibility node before sending input. The base model is experimental for desktop actions; it is not fine-tuned for Shadow, so prefer Jev or another local planner for reliability-critical work.

FunctionGemma is covered by Google's Gemma terms. The plugin does not bypass Hugging Face's access gate or accept those terms on the user's behalf.
