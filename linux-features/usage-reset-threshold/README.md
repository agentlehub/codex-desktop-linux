# Usage reset threshold

Choose how much Codex usage can remain when your assistant uses a reset,
including above the standard 10% remaining limit. The feature and its
**Use custom reset threshold** switch are disabled by default.

## Enable

Select **Usage reset threshold** with `make setup-native`, or add
`usage-reset-threshold` to the `enabled` array in your local
`linux-features/features.json`. Preserve your other selected features.

Rebuild and install with `make install-native`, or use your usual
[build and installation workflow](../../README.md). Fully quit ChatGPT Community,
including the tray, and launch the rebuilt app.

## Usage

Open **Settings → Usage**:

1. Enable **Allow your assistant to use resets**.
2. Enable **Use custom reset threshold**.
3. Enter a whole percentage from **1 to 99** in **Reset threshold**. The default
   is **10**.

Press **Enter** or leave the field to save. **Escape** restores the saved value.
Invalid values show an error and are not saved. Changing the threshold after
installation does not require rebuilding.

The percentage means usage **remaining**. For example, a threshold of **25%**
allows a reset when an available five-hour or weekly Codex limit has **25% or
less remaining**. Either limit can qualify; both do not need to be below the
threshold. A reset cannot proceed while usage information is unavailable.

You must still explicitly request each reset during a conversation. Reaching
the threshold, changing the percentage, or enabling either switch never uses
a reset automatically.

Turning **Use custom reset threshold** off restores the standard **10%** limit
and shows 10 in the disabled field. Turning it back on restores your saved
custom percentage. Turning **Allow your assistant to use resets** off disables
agent resets and both custom controls.

The saved threshold applies across chats and accounts in the same app profile.
If an existing chat still refers to the old 10% limit, try a new chat.

## Disable or remove

Turn **Use custom reset threshold** off to return to the standard limit.
To remove the extra controls, deselect the feature with `make setup-native`
or remove its ID from `linux-features/features.json`, then rebuild and install.
Your saved percentage is retained if you enable the feature again.

## Testing

```bash
node --test linux-features/usage-reset-threshold/test.js
```
