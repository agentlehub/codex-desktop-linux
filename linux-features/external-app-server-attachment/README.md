# External App-Server Attachment

This optional Linux feature attaches Desktop to an existing local Codex
app-server without taking ownership of its lifecycle. Enable
`external-app-server-attachment` in the ignored
`linux-features/features.json`. It conflicts with
`shared-app-server-socket`; enable only one.

## Descriptor

Unless `CODEX_LINUX_APP_SERVER_BRIDGE_ATTACH_ONLY` or
`CODEX_LINUX_APP_SERVER_BRIDGE_SOCKET` is already set, the launcher reads:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/${CODEX_LINUX_APP_ID:-codex-desktop}/app-server-attachment.json
```

The descriptor must be a regular file owned by the current user, have mode
`0600`, and contain exactly:

```json
{
  "schemaVersion": 1,
  "socketPath": "/absolute/normalized/path/app-server.sock",
  "transport": "unix"
}
```

The descriptor parent must be owned by the current user and not writable by
group or other. The socket parent must meet those same ownership and write
restrictions, grant owner read and execute access, and contain no symlink
components. The socket must be owned by the current user, grant owner read and
write access, and have no group or other permissions.
Malformed descriptors, unsafe permissions, and replaced paths fail closed. An
absent descriptor leaves ordinary startup unchanged.

A valid descriptor selects attach-only mode. Desktop validates the socket,
starts only its local proxy child, and stops that child on disconnect. It never
creates, starts, stops, replaces, locks, or removes the external app-server or
its socket.

Packaged support is advertised by the
`external-app-server-attachment-descriptor-v1` capability. Inspect it without
launching Desktop using `/opt/codex-desktop/start.sh --print-build-info`.
