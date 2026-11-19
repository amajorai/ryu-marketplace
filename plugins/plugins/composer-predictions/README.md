# Composer Predictions

Composer Predictions is the installable plugin for Core's next-message predictor.
After an assistant turn, the desktop asks Core through `/api/chat/prediction`.
Core reads only the conversation's recent turns. It quotes the user's own earlier
messages as style samples, then makes one background call to a cheap side model,
which returns the single message the user would most plausibly send next, in their
voice. The model may abstain, so a prediction does not appear after every reply.

The composer shows the prediction as ghost text. **Tab** moves it into the draft so
the user can edit it, and nothing is sent automatically. Predictions take precedence
over the first [Prompt Suggestions](../prompt-suggestions/README.md) chip as the ghost
text; the follow-up chips still render alongside.

Model resolution matches the other side-model features: the
`composer-predictions-model` preference, then the node's default side model, then
the resident local engine called directly, which keeps the transcript on the
machine. Gateway calls are tagged `x-ryu-priority: background` so they can't starve
the reply. Turn predictions off with the `composer-predictions-enabled` setting or
by disabling the plugin.
