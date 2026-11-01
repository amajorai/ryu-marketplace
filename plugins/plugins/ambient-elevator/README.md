# Ambient Elevator
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="ambient-elevator" width="96" />
  </picture>
</p>

Ambient Elevator is a desktop-only Ryu plugin. It contributes a user-scoped
on/off setting and volume control, then lets the desktop shell play one shared
track while at least one agent run is actively working.

The implementation is Ryu-owned. It consumes the existing aggregate agent-run
live-activity state, so concurrent runs do not create competing players. The
plugin contributes only the audio source metadata; the shell owns playback and
stops it when the last run stops working or needs input.

## Third-party audio

The bundled `elevator-4.mp3` is the requested track sourced from
[Codevator](https://codevator.dev/sounds/elevator-4.mp3). The upstream project
is [MIT licensed](https://github.com/educlopez/codevator/blob/master/LICENSE);
see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for the required notice.
