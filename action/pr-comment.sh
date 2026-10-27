#!/usr/bin/env bash
# Creates or updates the single RepoCanon comment on a pull request.
# Needs: gh (preinstalled on GitHub runners), GH_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, REPORT_FILE.
set -euo pipefail

marker='<!-- repocanon-report -->'
existing=$(gh api "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" --paginate \
  --jq ".[] | select(.body | contains(\"${marker}\")) | .id" | head -n 1)

if [ -n "${existing}" ]; then
  gh api -X PATCH "repos/${GITHUB_REPOSITORY}/issues/comments/${existing}" -F "body=@${REPORT_FILE}" > /dev/null
  echo "RepoCanon: updated PR comment ${existing}"
else
  gh api -X POST "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" -F "body=@${REPORT_FILE}" > /dev/null
  echo "RepoCanon: posted PR comment"
fi
