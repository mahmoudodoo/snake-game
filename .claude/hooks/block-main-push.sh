#!/bin/bash
# Block git push to main or master
if grep -qE "git push.* (main|master)" ; then
  echo "❌ Blocked: Pushing directly to main or master is not allowed. Use a feature branch and open a PR." >&2
  exit 2
fi
exit 0
