# Cloudflare Clef Decisions

This plugin adds Cloudflare Workers AI Clef and Clef Flash to Ryu's **Decision Models** layer.
Agents call the stable `decision.predict` verb for text and JSON. When Cloudflare Clef is selected,
Ryu also advertises `decision.predict_multimodal` for image inputs; text-only providers do not
advertise that verb.

## Configure

Enable **Cloudflare Clef Decisions**, then open its node settings and enter the Cloudflare account
ID and API token. Ryu stores both values encrypted on that node. The token is sent only to
`api.cloudflare.com`; state, questions, and any image inputs are sent to that Workers AI account.

After saving or changing credentials, disable and re-enable the plugin so its sidecar starts
with the current node settings. Credentials are supplied to that process; the Core tool request
carries only node authentication. The sidecar sends the API token to Cloudflare over HTTPS.

Choose `clef` (27B) or `clef-flash` (9B) in the optional `model` field. Clef accepts text or JSON
state, typed `noul`, `choice`, and `score` questions, and up to four embedded PNG, JPEG, or WebP
images. Images must be supplied as a base64 data URL or `{ "content_type", "base64" }` object;
remote image URLs are rejected. Cloudflare enforces the model's image-dimension and request limits.

The provider makes one request to Workers AI and returns the typed answers and probabilities. It
does not generate a chat response or silently switch providers. Use another enabled Decision Models
provider when Cloudflare is unavailable or when inference must stay local.

## Verification boundary

The sidecar validates model ids, question counts, image encoding, account ID shape, request size,
and the fixed Cloudflare destination before making a request. Automated tests use a mocked upstream
response; a live inference requires the user's Cloudflare account credentials.
