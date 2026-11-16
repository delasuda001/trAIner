#!/bin/zsh
# Installe le travail de nuit de Sillage (bilan du dimanche + banc de tests) à 22 h, heure du Mac.
# Niveau utilisateur uniquement (aucun sudo). Désinstallation : scripts/launchd/uninstall.sh
set -euo pipefail

LABEL="com.sillage.nightly"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
NPX="$(command -v npx)"
NODE_DIR="$(dirname "$(command -v node)")"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$REPO/data/bench"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NPX</string>
    <string>tsx</string>
    <string>--conditions=react-server</string>
    <string>scripts/nightly.ts</string>
    <string>--scheduled</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$NODE_DIR:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <!-- 22 h chaque jour. Si le Mac dort, launchd lance la tâche au réveil ; le script saute la nuit hors 22 h – 5 h. -->
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>22</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$LOG_DIR/launchd.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/launchd.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installé : $PLIST (tous les jours à 22 h). Journal : $LOG_DIR/nightly.log"
