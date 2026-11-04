#!/usr/bin/env bash
# One rehearsal from a fresh seed: stop the stacks, rebuild both databases, start both stacks, drive both journeys.
#
#   scripts/rehearse.sh            # both journeys
#   scripts/rehearse.sh clearance  # one journey (only that database is rebuilt)
#
# Exits non-zero if any step fails. Prints the elapsed time of each phase.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
which_journey="${1:-both}"
t0=$SECONDS
scripts/demo_stack.sh stop
if [ "$which_journey" = both ]; then scripts/demo_setup.sh --fresh | grep -E '^(-- |Both)'; else scripts/demo_setup.sh --fresh --only "$which_journey" | grep -E '^(-- |Both)'; fi
t1=$SECONDS
scripts/demo_stack.sh both
t2=$SECONDS
status=0
node scripts/rehearse.mjs "$which_journey" || status=$?
echo "reset $((t1 - t0)) s, stacks $((t2 - t1)) s, rehearsal $((SECONDS - t2)) s, total $((SECONDS - t0)) s (exit $status)"
exit $status
