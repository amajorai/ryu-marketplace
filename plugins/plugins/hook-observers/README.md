# Hook Observers
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="hook-observers" width="96" />
  </picture>
</p>

A worked reference for the turn-hook events Ryu can fire: five observer hooks watching subagent-stop, session-end, notification, workflow-run-failed, and a third-party app event (`com.ryu.meetings#meeting.ended`), each returning a harmless note. Nothing in Core knows this plugin exists — copy the directory as the starting point for your own event-driven plugin.

Definition lives in `manifest.json`, its sandboxed hook bodies in `hooks/app-event-meeting-ended.js`, `hooks/notification.js`, `hooks/session-end.js`, `hooks/subagent-stop.js` and `hooks/workflow-run-failed.js`; Core compiles them all in from this package directory. Published to the grouped `ryu-marketplace` via `tools/mirror-plugins.sh`.
