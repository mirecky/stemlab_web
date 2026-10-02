#!/usr/bin/env bash
# Zosynchronizuje lokálny priečinok s materiálmi do R2 bucketu.
# Použitie:  ./scripts/nahraj.sh ~/Materialy          (náhľad, nič nezmení)
#            ./scripts/nahraj.sh ~/Materialy --naozaj (skutočné nahranie)
# Predpoklad: rclone remote s názvom "r2" (pozri README.md).
set -euo pipefail

SRC="${1:?Zadaj cestu k priečinku s materiálmi}"
REMOTE="${R2_REMOTE:-r2}:stemlab-materialy"

if [[ "${2:-}" == "--naozaj" ]]; then
  # sync = to, čo zmažeš lokálne, zmizne aj z webu
  rclone sync "$SRC" "$REMOTE" --exclude ".*" --exclude ".*/**" --progress
else
  echo "Náhľad zmien (nič sa nenahráva). Spusti s --naozaj pre nahranie."
  rclone sync "$SRC" "$REMOTE" --exclude ".*" --exclude ".*/**" --dry-run
fi
