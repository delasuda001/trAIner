#!/bin/zsh
# Retire le travail de nuit de Sillage. Les rapports dans data/bench/ sont conservés.
set -euo pipefail
LABEL="com.sillage.nightly"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "Désinstallé : $LABEL"
