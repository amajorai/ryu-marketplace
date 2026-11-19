# Pomodoro Timer

A focus timer that renders inline in chat. Ask an agent to "start a pomodoro for the
release notes" and it calls `pomodoro.start`; the reply shows a timer you control.

## How it works

| File | Role |
| --- | --- |
| `manifest.json` | Declares the `pomodoro` stdio MCP server, binds `pomodoro.start` to `ui://widget/pomodoro.html`, and holds `mcp:server` + `widget:render`. |
| `server.mjs` | Zero-dependency Node MCP server. Validates the session settings and serves the widget HTML. Holds no timer state. |
| `pomodoro.html` | Self-contained skybridge widget: countdown, phase cycle, controls, chime. |

`plugin.json` and `mcp.json` are generated from `manifest.json` by
`tools/generate-agent-plugins.mjs`; do not edit them by hand.

### `pomodoro.start` arguments

All optional. Invalid values return an error result (no widget) naming the field,
instead of being clamped into a session the user did not ask for.

| Argument | Type | Range | Default |
| --- | --- | --- | --- |
| `task` | string | ≤ 120 characters | none |
| `focus_minutes` | integer | 1–180 | 25 |
| `short_break_minutes` | integer | 1–60 | 5 |
| `long_break_minutes` | integer | 1–120 | 15 |
| `rounds_before_long_break` | integer | 1–12 | 4 |
| `auto_start` | boolean | | `false` |

### Timer behavior

- **Start / Pause / Resume** run the current phase. A running phase stores its
  wall-clock deadline, so a reload or a backgrounded tab resumes at the right time.
- A focus round that runs to zero counts as completed. Every
  `rounds_before_long_break`-th completed round is followed by a long break; the
  others by a short break.
- With `auto_start`, the next phase starts on the exact deadline of the previous
  one; a late tick catches up on the original cadence. Without it, the timer waits
  at the next phase for **Start**.
- **Skip** moves to the next phase without crediting a focus round (a skipped
  focus round goes to a short break).
- **Reset** returns to round 1 and keeps the chime choice.
- **Chime** toggles a short Web Audio chime at each phase change. Browsers only
  allow audio after a click in the widget, so the chime is armed by **Start**.
- **Pop out** appears when the host supports display modes and asks for
  picture-in-picture.
- Phase changes are announced through a polite live region; the countdown is a
  `role="timer"` element that is not announced every second.

Progress is saved with `setWidgetState` under the `pomodoro` key. A failed save
keeps the timer running; it just will not survive a reload.

### Styling

The widget uses Ryu's semantic theme tokens (`--background`, `--foreground`,
`--primary`, `--muted`, `--muted-foreground`, `--accent`, `--border`, `--ring`,
`--radius`, `--font-sans`) that the host writes onto the frame's root element, so it
follows the user's light, dark or custom theme. The stylesheet carries the
`DESIGN.md` light/dark values as fallbacks for hosts that send only `theme`. The
countdown uses tabular figures in the sans font: the sandboxed frame cannot load
the host's Geist Mono. Transitions are off under `prefers-reduced-motion` and when
the host sets `--ryu-animations: off`.

## Privacy and permissions

The widget runs in the host's sandboxed iframe with `connect-src 'none'`: it makes no
network requests and keeps nothing outside the chat's widget state. The tool is not
widget-accessible (`openai/widgetAccessible: false`), so the widget cannot call tools
or post messages. A Community install needs the operator to approve `mcp:server`.

## Testing

```sh
node --test plugins-store/plugins/pomodoro/plugin.test.mjs
node --test plugins-store/plugins/pomodoro/ui.behavior.test.mjs
```

`plugin.test.mjs` drives the real server over stdio. `ui.behavior.test.mjs` runs the
widget module in happy-dom with a controlled clock (it resolves happy-dom through
`apps/desktop`'s dependencies).

Drive the server by hand:

```sh
cd plugins-store/plugins/pomodoro
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"start","arguments":{"task":"Inbox zero","focus_minutes":30}}}' \
  | node server.mjs
```
