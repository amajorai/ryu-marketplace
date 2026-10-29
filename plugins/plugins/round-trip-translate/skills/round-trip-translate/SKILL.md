---
name: Round-Trip Translate
description: Reword text by translating it into a pivot language and back with Google Cloud Translation, after removing invisible Unicode characters.
enabled: true
always-on: false
---

Use this workflow only when the user asks to round-trip, back-translate, or reword text through translation, or to strip hidden characters from text.

## 1. Collect the text and options

Work on the exact text the user supplied. Ask only if it is missing. Defaults:

- **Pivot languages:** one hop through `ja`. Accept the user's list instead (for example `de`, or `ja, de`). A more distant pivot changes more wording and loses more meaning.
- **Source language:** detect it on the first hop unless the user names it.

## 2. Remove invisible characters

Call `round_trip.clean_text` with the text. Set `keep_joiners: true` when the text contains emoji sequences or a script that needs joiners (Persian, Arabic, Hindi and other Indic scripts). Report `removed_total` and the `removed` counts to the user. If the user asked only for cleaning, stop here and return the cleaned text.

## 3. Protect what must not be translated

Split the cleaned text into translatable prose and protected spans: fenced or inline code, URLs, email addresses, file paths, numbers with units, and names the user asks to keep. Translate only the prose and put the protected spans back in their original positions afterwards. Keep paragraph breaks; translate long text one paragraph at a time.

## 4. Translate out and back

For each prose segment, call `google_translate.translate`:

1. `{ "q": <segment>, "target": <first pivot> }` and, if the user named it, `source`. Record `data.translations[0].detectedSourceLanguage` as the original language.
2. For each later pivot, translate the previous result from the current pivot to the next one.
3. Translate the last result back to the original language.

Use only `data.translations[0].translatedText`. If the tool returns `available: false`, a non-2xx `status`, or no `translations`, stop and tell the user what failed. A missing or rejected key means they must add a Google Cloud Translation API key under **Settings → Round-Trip Translate**. Never substitute your own rewording for a failed translation or present partial output as complete.

## 5. Clean and return

Run `round_trip.clean_text` on the reassembled result, then return:

- the rewritten text;
- the pivot path used (for example `en → ja → en`);
- the number of invisible characters removed.

Tell the user that the result can change meaning, tone, terminology and formatting and that they should review it before using it. Do not claim the result will pass, or avoid, any AI-text detector or watermark check: round-trip translation changes wording, but no one can promise how a particular detector will score it.
