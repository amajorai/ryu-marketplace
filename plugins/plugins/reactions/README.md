# Message Reactions
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="reactions" width="96" />
  </picture>
</p>

Adds the chat reaction picker as a `contributes.message_actions` declaration.
The desktop shell supplies the native renderer and Core-backed persistence; enabling or disabling
`@ryu/reactions` controls whether the reaction affordance and its realtime data path are active.
