# Side Chats

Adds `/btw` as a plugin-contributed chat command. The desktop sends the current
main-chat transcript (including the latest in-flight messages) with the question,
so the side model has the same context the user is looking at. Core bounds the
transcript and persists the answer as a side-chat entry tied to the parent
conversation; it never becomes a normal transcript message.

The plugin owns the command, chat-feature declaration, route gate, and desktop
affordances. Core retains only the shared side-model and conversation-store
implementation.
