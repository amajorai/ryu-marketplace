# Kill Switch

Stop every running chat and bot on the selected node, and hold new work until you
resume it.

The plugin is declarative: it contributes two conversation context-menu actions
and no tools, hooks, or processes. Each action invokes a Core capability, so the
stop itself is performed by Core, not by plugin code.

## Actions

| Action                   | Capability          | Effect                                                         |
| ------------------------ | ------------------- | -------------------------------------------------------------- |
| Stop all chats and bots  | `execution.pause`   | Stops running chats and bot turns and pauses new work on the node. |
| Resume chats and bots    | `execution.resume`  | Lets the node accept new chats and bot turns again.            |

Both actions appear in a conversation's context menu and report loading, success,
and failure states.

## Permissions

`execution:control` — the single grant needed to pause and resume execution on
the node. The plugin requests nothing else.

## Status

Experimental and opt-in: enable it from the Store when you want a one-click stop.
