#!/usr/bin/env bash
# Install netviz user-level systemd units.
# Run as the user that owns /home/lasco/workspace/netviz/.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

mkdir -p "$TARGET"
cp -v "$REPO/systemd/netviz-backend.service"  "$TARGET/"
cp -v "$REPO/systemd/netviz-exporter.service" "$TARGET/"
cp -v "$REPO/systemd/netviz-exporter.timer"   "$TARGET/"

systemctl --user daemon-reload
systemctl --user enable --now netviz-exporter.timer
systemctl --user enable --now netviz-backend.service

echo
echo "Installed. Useful commands:"
echo "  systemctl --user status netviz-backend.service"
echo "  systemctl --user status netviz-exporter.timer"
echo "  systemctl --user list-timers netviz-exporter.timer"
echo "  journalctl --user -u netviz-backend.service -f"
echo
echo "Note: enable lingering so units run while you are logged out:"
echo "  sudo loginctl enable-linger \"\$USER\""
