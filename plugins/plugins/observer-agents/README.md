# Observer Agents
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="observer-agents" width="96" />
  </picture>
</p>

An opt-in, quiet watchdog for long-running work. When **Observer** is enabled,
the plugin sends the latest bounded transcript activity to an independent side
model after each assistant turn. The observer sees data only; it cannot call
tools, change files, grant permissions, or stop the worker. It normally stays
silent and returns one concise advisory note only when it spots drift, a missed
constraint, or a shortcut.

This is Ryu's plugin-level implementation of the observer-agent pattern. It is
deliberately advisory rather than authoritative: an observer report is never
user consent and should not be used to justify changing permissions or config.

Enable the **Observer** composer toggle for a chat, and optionally choose the
observer model in Settings → Observer agents. Because this makes one side-model
call per assistant turn, it is best suited to high-risk, long-running tasks.
