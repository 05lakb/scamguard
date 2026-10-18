#!/usr/bin/env bash
# Saves test output from Cloud Shell into the separate, private results repo, so it can be read end to end.
#
#   bash infra/save_results.sh <label> [file ...]
#   bash infra/save_results.sh <label> --check-only [file ...]     (only checks, saves nothing)
#
# With no files named, it takes the JSON, JSONL, Markdown and text files in redteam/output
# (never the cache folder). It refuses to save anything that looks like a key, a token or an email address,
# or any file that is large or has a secret-sounding name. It never prints file contents.
#
# One-time setup (see the notes): a private repo, and a key made in Cloud Shell that can write to that repo only.

set -euo pipefail

RESULTS_REPO="${RESULTS_REPO:-git@github.com:05lakb/scamguard-results.git}"
KEY_FILE="${RESULTS_KEY:-$HOME/.ssh/lmg_results}"
CLONE_DIR="${RESULTS_DIR:-$HOME/scamguard-results}"
MAX_BYTES="${RESULTS_MAX_BYTES:-$((5 * 1024 * 1024))}"  # 5 MB unless a bigger limit is asked for, for example video clips

SECRET_PATTERNS='-----BEGIN|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_|AKIA[0-9A-Z]{12,}|ya29\.[0-9A-Za-z_-]{20,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
BAD_NAMES='(^|/)(\.env|.*\.pem|.*\.key|id_[a-z0-9]+|.*secret.*|.*token.*|.*credential.*)$'

label="${1:-}"
if [ -z "$label" ]; then
  echo "Give this save a short label, for example: bash infra/save_results.sh intel-first-run" >&2
  exit 1
fi
shift
case "$label" in
  *[!A-Za-z0-9._-]*) echo "The label may only use letters, numbers, dots, dashes and underscores." >&2; exit 1 ;;
esac

check_only=0
if [ "${1:-}" = "--check-only" ]; then
  check_only=1
  shift
fi

if [ "$#" -gt 0 ]; then
  files=("$@")
else
  mapfile -t files < <(find redteam/output -maxdepth 2 -type f \( -name '*.json' -o -name '*.jsonl' -o -name '*.md' -o -name '*.txt' \) -not -path '*/cache/*' | sort)
fi

if [ "${#files[@]}" -eq 0 ]; then
  echo "Nothing to save: no files found." >&2
  exit 1
fi

# Check every file before anything is copied.
for file in "${files[@]}"; do
  if [ ! -f "$file" ]; then echo "Not a file: $file" >&2; exit 1; fi
  if echo "$file" | grep -Eiq "$BAD_NAMES"; then echo "Refusing: the name of $file sounds like a secret." >&2; exit 1; fi
  size=$(wc -c < "$file")
  if [ "$size" -gt "$MAX_BYTES" ]; then echo "Refusing: $file is larger than $((MAX_BYTES / 1024 / 1024)) MB." >&2; exit 1; fi
  # Pictures and videos are compressed, so a text search cannot read them, and a byte pattern that looks like an email
  # address turns up in them by chance. They keep the name and size checks above; look at pictures by eye before sharing.
  case "$file" in
    *.png|*.jpg|*.jpeg|*.webp|*.mp4|*.webm) continue ;;
  esac
  # grep answers 0 when it finds a match, 1 when it finds none, and 2 or more when it fails.
  # A failure must count as "refuse", never as "nothing found".
  found=0
  grep -Eq -e "$SECRET_PATTERNS" -- "$file" || found=$?
  if [ "$found" -eq 0 ]; then
    echo "Refusing: $file contains something that looks like a key, a token or an email address." >&2
    exit 1
  elif [ "$found" -ne 1 ]; then
    echo "Refusing: the check could not run on $file." >&2
    exit 1
  fi
done
echo "Checked ${#files[@]} file(s): nothing that looks like a secret."

if [ "$check_only" -eq 1 ]; then
  printf '  %s\n' "${files[@]}"
  echo "Check only: nothing was saved."
  exit 0
fi

if [ ! -f "$KEY_FILE" ]; then
  echo "The results key $KEY_FILE does not exist. Make it first (see the setup notes)." >&2
  exit 1
fi
export GIT_SSH_COMMAND="ssh -i $KEY_FILE -o IdentitiesOnly=yes"

if [ ! -d "$CLONE_DIR/.git" ]; then
  git clone --quiet "$RESULTS_REPO" "$CLONE_DIR"
fi
cd "$CLONE_DIR"
git config user.name "results"
git config user.email "results@users.noreply.github.com"
git pull --quiet --rebase || true

stamp="$(date -u +%Y-%m-%d_%H%M)"
folder="$stamp-$label"
mkdir -p "$folder"
cd - > /dev/null
code_commit="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
for file in "${files[@]}"; do
  cp "$file" "$CLONE_DIR/$folder/$(basename "$file")"
done

(
  cd "$CLONE_DIR/$folder"
  {
    echo "label: $label"
    echo "saved: $stamp (UTC)"
    echo "code commit: $code_commit"
    echo "files:"
    sha256sum -- * | grep -v ' MANIFEST.txt$' | sed 's/^/  /'
  } > MANIFEST.txt
)

cd "$CLONE_DIR"
git add "$folder"
git commit --quiet -m "Results: $label ($stamp)"
git push --quiet origin HEAD
echo "Saved to the results repo in folder: $folder"
