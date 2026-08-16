#!/usr/bin/env bash
set -eu

app_dir="${CODEX_LINUX_APP_DIR:?}"
cli_path="${CODEX_CLI_PATH:-$app_dir/resources/codex}"

if [ "${CODEX_LINUX_APP_SERVER_BRIDGE_ATTACH_ONLY+x}" = x ] || [ "${CODEX_LINUX_APP_SERVER_BRIDGE_SOCKET+x}" = x ]; then
  printf '%s\n' 'env CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL=0'
  printf 'env CODEX_CLI_PATH=%s\n' "$cli_path"
  exit 0
fi

config_root="${XDG_CONFIG_HOME:-${HOME:?}/.config}"
app_id="${CODEX_LINUX_APP_ID:-codex-desktop}"
descriptor_path="$config_root/$app_id/app-server-attachment.json"
managed_node="$app_dir/resources/cua_node/bin/node"
reader="$app_dir/.codex-linux/features/external-app-server-attachment/descriptor-reader.js"

if [ ! -x "$managed_node" ] || [ ! -f "$reader" ]; then
  printf '%s\n' 'env CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL=1'
  exit 0
fi

if output="$("$managed_node" "$reader" "$descriptor_path")"; then
  printf '%s\n' 'env CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL=0'
  if [ -n "$output" ]; then printf '%s\n' "$output"; fi
  printf 'env CODEX_CLI_PATH=%s\n' "$cli_path"
else
  printf '%s\n' 'env CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL=1'
fi
