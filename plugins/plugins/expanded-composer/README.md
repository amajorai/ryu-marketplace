# Expanded Composer
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="expanded-composer" width="96" />
  </picture>
</p>

Adds an **Expand composer** ghost control to the chat composer. Selecting it
morphs the current composer into a larger in-place surface so longer prompts
are easier to write without creating a second draft or a second send path.

The desktop host owns the in-place motion and close control. This package owns
the feature declaration, so disabling `@ryu/expanded-composer` removes the
control without changing the base composer.
