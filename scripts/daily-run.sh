#!/usr/bin/env bash
# Everything a scheduled daily run needs, so the schedule itself can be trivial.
#
#   scripts/daily-run.sh
#
# The film runner assumes a developer is present: two dev servers already up, a
# Playwright binary on PATH-ish, a database URL exported by whoever last ran it.
# At 07:00 with nobody at the keyboard none of that is true, so this brings up
# what is missing, runs the ingest and the films, and puts back what it started.
#
# Exits non-zero if the run failed. A scheduler that ignores exit codes will at
# least have the log; one that does not will tell you.
set -euo pipefail

GIDEON="${GIDEON_REPO:-$HOME/Projects/Gideon}"
SOLOMON="${SOLOMON_REPO:-$HOME/Projects/NexusReach}"
LOG_DIR="${GIDEON}/logs"
LOG="${LOG_DIR}/daily-$(date +%Y-%m-%d).log"
mkdir -p "$LOG_DIR"

# Keep a fortnight of daily logs and cap launchd's own two. Nothing here rotates
# on its own: launchd appends to StandardOutPath forever, and a daily file per
# day is a slow leak that only becomes visible as a full disk.
ls -1t "$LOG_DIR"/daily-*.log 2>/dev/null | tail -n +15 | xargs rm -f 2>/dev/null || true
for capped in "$LOG_DIR/launchd.out.log" "$LOG_DIR/launchd.err.log"; do
  if [ -f "$capped" ] && [ "$(stat -f%z "$capped" 2>/dev/null || echo 0)" -gt 5242880 ]; then : > "$capped"; fi
done

exec > >(tee -a "$LOG") 2>&1

say() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
fail() { say "FAILED: $*"; exit 1; }

[ -d "$GIDEON" ]  || fail "no Gideon checkout at $GIDEON (set GIDEON_REPO)"
[ -d "$SOLOMON" ] || fail "no Solomon checkout at $SOLOMON (set SOLOMON_REPO)"

# The database. backend/.env may point at a host that no longer resolves, so an
# explicit URL wins and its absence is worth saying out loud rather than
# discovering three minutes into an ingest.
if [ -z "${NEXUSREACH_DATABASE_URL:-}" ]; then
  say "NEXUSREACH_DATABASE_URL is unset; the ingest will use whatever backend/.env points at."
fi

# Playwright's browser. Capture films a real Chromium; without this the capture
# fails at the first shot with a message about a missing executable.
if [ -z "${PLAYWRIGHT_CHROMIUM_EXECUTABLE:-}" ]; then
  found=$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/*.app/Contents/MacOS/* 2>/dev/null | head -1 || true)
  [ -n "$found" ] || fail "no Playwright Chromium found; set PLAYWRIGHT_CHROMIUM_EXECUTABLE"
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE="$found"
fi
# Where the capture will look. Vite binds `localhost`, which resolves to ::1
# first, while the capture defaults to 127.0.0.1 -- so a cold run found the port
# open, the server listening, and the app "not answering". Every successful run
# during development had this exported by hand, which is exactly the kind of
# ambient state a scheduled run does not inherit.
export SOLOMON_DEMO_URL="${SOLOMON_DEMO_URL:-http://localhost:5173}"

say "chromium: $PLAYWRIGHT_CHROMIUM_EXECUTABLE"
say "solomon:  $SOLOMON_DEMO_URL"

listening() { lsof -ti ":$1" >/dev/null 2>&1; }

# Ports this run brought up, so cleanup can tell them from ones it found.
STARTED_PORTS=()

# Wait for an answer, not a socket, and for the URL the capture will actually
# use. An open port proves something bound; it does not prove the app is up, and
# it does not prove it is reachable by the name the next process will resolve.
wait_for_http() {
  local url="$1" name="$2" tries=90
  while [ $tries -gt 0 ]; do
    if curl -sf -o /dev/null --max-time 3 "$url"; then say "$name is answering at $url"; return 0; fi
    sleep 2; tries=$((tries - 1))
  done
  fail "$name never answered at $url"
}

# Installed before the first server starts, not after the last one is ready.
# A readiness check that times out calls `fail`, and with the trap installed
# later that exit left an already-started backend running with nothing to stop
# it -- the next run then found the port up and filmed against it.
# Only ever stop what this script started. A developer who happened to have the
# servers up should get them back.
#
# By port, not by the pid we recorded.
#
# The pid we record is npm's; the process actually holding 5173 is the vite child
# it spawns (measured: npm 37602, port held by 37625). Killing npm was tested and
# does free the port -- npm propagates the signal -- so this is defence rather
# than a fix for an observed leak. It matters when propagation does not happen:
# npm killed mid-startup before it has adopted the child, or a child that ignores
# SIGTERM. The failure mode is quiet and compounding -- the next run finds the
# port occupied, says "leaving it alone", and films against a server from a
# previous day -- so it is worth not depending on a signal being forwarded.
cleanup() {
  local port pids
  for port in "${STARTED_PORTS[@]:-}"; do
    [ -n "${port:-}" ] || continue
    pids=$(lsof -ti ":$port" 2>/dev/null || true)
    [ -n "$pids" ] || { say "nothing left on $port"; continue; }
    say "stopping what we started on $port: $(echo "$pids" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      sleep 1
      pids=$(lsof -ti ":$port" 2>/dev/null || true)
      [ -n "$pids" ] || break
    done
    if [ -n "$pids" ]; then
      say "forcing $(echo "$pids" | tr '\n' ' ') on $port"
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  done
  # Guarded: a failing rm inside an EXIT trap under `set -e` would replace the
  # real exit status with its own, turning a failed run into a successful one.
  rm -f "$LOG_DIR/backend.pid" "$LOG_DIR/frontend.pid" 2>/dev/null || true
}
trap cleanup EXIT

if listening 8000; then
  say "backend already running on 8000; leaving it alone"
  wait_for_http "http://localhost:8000/docs" backend
else
  say "starting backend"
  ( cd "$SOLOMON/backend" && nohup .venv/bin/python -m uvicorn app.main:app --port 8000 \
      >"$LOG_DIR/backend.log" 2>&1 & echo $! >"$LOG_DIR/backend.pid" )
  STARTED_PORTS+=(8000)
  wait_for_http "http://localhost:8000/docs" backend
fi

if listening 5173; then
  say "frontend already running on 5173; leaving it alone"
  wait_for_http "$SOLOMON_DEMO_URL" frontend
else
  # dev:bypass, not dev. Plain `npm run dev` walls every route behind Supabase
  # login, and the capture will film ten screenshots of a login screen and report
  # success.
  say "starting frontend (dev:bypass)"
  ( cd "$SOLOMON/frontend" && nohup npm run dev:bypass \
      >"$LOG_DIR/frontend.log" 2>&1 & echo $! >"$LOG_DIR/frontend.pid" )
  STARTED_PORTS+=(5173)
  wait_for_http "$SOLOMON_DEMO_URL" frontend
fi

# A marker to date the films against. `ls renders/*<today>*.mp4` matches films
# from every run today, including ones this run did not produce -- so a run that
# fails during render still lists yesterday-evening's output and reads as a
# success. That nearly went out as "here are the films the scheduled run made".
touch "$LOG_DIR/.run-started"

say "cutting today's films"
cd "$GIDEON"
node scripts/run-daily-series.mjs --ingest --all || fail "run-daily-series exited non-zero"

say "done. films this run produced:"
produced=$(find "$GIDEON/renders" -name 'solomon-daily-*.mp4' -newer "$LOG_DIR/.run-started" 2>/dev/null || true)
if [ -n "$produced" ]; then
  echo "$produced"
else
  # Reaching here means the films stage claimed success and wrote nothing, which
  # is a failure however green the log looks.
  fail "no film was written by this run"
fi
