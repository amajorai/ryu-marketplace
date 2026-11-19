# Auto Translate

Telegram-style automatic translation for chat replies. When an assistant reply is not
in your language, a side model translates it and the translation appears beside the
reply. The original stays in the chat and in the history the model sees next turn, so
translating never changes what the agent said or how it continues.

Definition lives in `manifest.json` and its sandboxed hook body in `hooks/reply.js`.

## How it works

| Hook | Phase | Fires |
| --- | --- | --- |
| `auto-translate.reply` | `post_assistant_turn` | Every completed reply while automatic translation is on, or when the composer's **Translate replies** toggle is set for the chat. |

The hook asks the side model for the reply's language on a `SOURCE:` header line,
followed by the translation. It returns nothing (no note, no model output shown) when:

- the reply is already in the target language, or in a language on the
  do-not-translate list;
- the reply has no letters outside code (numbers, symbols, a bare code block);
- the side model fails, or its answer lacks the `SOURCE:` header. A reply without the
  header is never shown, because it could be an echo, a refusal, or the model following
  an instruction inside the reply.

The reply is sent as data with an instruction not to follow anything inside it. Code
blocks, inline code, URLs, paths, commands, numbers, and names are kept as written.
Replies longer than 12,000 characters are translated up to that limit and the note says so.

The translation is a `note`, so it is live rather than scrollback: it shows in the
dismissible plugin-note banner and is not persisted to the conversation.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| `auto-translate-enabled` | on | Translate every reply that is not in your language. Off leaves only the per-chat composer toggle. |
| `auto-translate-target` | `en` | The language to translate into. Replies already in it are skipped. |
| `auto-translate-skip` | empty | Comma-separated codes or English names (`es, French`) left untranslated. |
| `auto-translate-model` | empty | Optional model override. Empty follows Ryu's normal side-model/node default. |

Every reply checked costs one side-model call; for a reply already in your language
the model answers with only the one-line header. Turn automatic translation off and use the
composer toggle to translate only the chats you choose.
