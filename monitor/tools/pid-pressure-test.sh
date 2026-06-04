#!/usr/bin/env bash
###############################################################################
#  pid-pressure-test.sh  —  GATED P7-RISK acceptance test (DESTRUCTIVE-ADJACENT)
#
#  PURPOSE
#    Prove the no-kill invariant LIVE: drive an ISOLATED throwaway container's
#    pids.current toward its pids.max so the watchdog fires WARN/CRIT Discord
#    alerts, and confirm NOTHING gets killed automatically. Then tear down.
#
#  WHY THIS IS SENSITIVE
#    It creates and exercises a real podman container on a SHARED CUBRID dev
#    host (~24 real containers). It is isolated by:
#      * a unique throwaway name (wd-pidtest), never touching real containers
#      * hard caps: --pids-limit 2048, --cpus 1, --memory 256m, --memory-swap
#        256m  (so the MEMORY axis cannot be perturbed — pids only)
#      * sleeping threads only (no CPU spin, no allocation)
#      * an EXIT/INT/TERM trap that ALWAYS runs `podman rm -f wd-pidtest`
#
#  RUN ONLY UNDER EXPLICIT CONFIRMATION. This script REFUSES to run unless you
#  pass --i-understand-this-is-destructive. Never run it unattended.
#
#  It never touches any container other than wd-pidtest. It does not stop, kill,
#  or remove any real workload.
###############################################################################

set -euo pipefail

CONTAINER=wd-pidtest
IMAGE="${WD_TEST_IMAGE:-registry.access.redhat.com/ubi8/ubi-minimal:latest}"
PIDS_LIMIT=2048
TARGET="${WD_TEST_TARGET:-1900}"   # spawn toward this many pids (< 2048 cap)
STEP_SLEEP="${WD_TEST_STEP_SLEEP:-0.05}"

confirm_gate() {
  if [[ "${1:-}" != "--i-understand-this-is-destructive" ]]; then
    cat <<EOF >&2
REFUSING TO RUN.

This is the GATED P7-RISK live test. It creates an isolated throwaway container
and drives it toward its PID limit to trigger watchdog alerts, then tears it
down. It must only be run with explicit confirmation:

  $0 --i-understand-this-is-destructive

Optional env:
  WD_TEST_IMAGE       small image (default ubi8/ubi-minimal)
  WD_TEST_TARGET      pids to approach (default ${TARGET}, cap ${PIDS_LIMIT})
  WD_TEST_STEP_SLEEP  delay between spawns (default ${STEP_SLEEP}s)
EOF
    exit 2
  fi
}

teardown() {
  echo "[pidtest] teardown: removing ${CONTAINER}"
  podman rm -f "${CONTAINER}" >/dev/null 2>&1 || true
}

preflight() {
  command -v podman >/dev/null 2>&1 || { echo "podman not found" >&2; exit 1; }
  if podman ps -a --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
    echo "[pidtest] stale ${CONTAINER} found; removing first"
    podman rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  fi
}

main() {
  confirm_gate "${1:-}"
  preflight
  trap teardown EXIT INT TERM

  echo "[pidtest] starting isolated container ${CONTAINER} (image ${IMAGE})"
  echo "[pidtest]   caps: --pids-limit ${PIDS_LIMIT} --cpus 1 --memory 256m --memory-swap 256m"
  podman run -d --rm \
    --name "${CONTAINER}" \
    --pids-limit "${PIDS_LIMIT}" \
    --cpus 1 \
    --memory 256m \
    --memory-swap 256m \
    "${IMAGE}" sleep infinity >/dev/null

  echo "[pidtest] spawning sleeping processes toward ${TARGET} pids (cap ${PIDS_LIMIT})"
  echo "[pidtest] watch your Discord channel + Cockpit widget for WARN/CRIT."
  echo "[pidtest] EXPECTED: alerts fire, but the watchdog kills NOTHING."

  # Spawn background `sleep` processes INSIDE the container, one at a time, while
  # printing pids.current so you can watch the ratio climb. Pure sleeps: no CPU,
  # no memory growth.
  podman exec "${CONTAINER}" sh -c '
    n=0
    while [ "$n" -lt '"${TARGET}"' ]; do
      sleep 100000 &
      n=$((n+1))
      if [ $((n % 100)) -eq 0 ]; then
        cur=$(cat /sys/fs/cgroup/pids/pids.current 2>/dev/null || cat /sys/fs/cgroup/pids.current 2>/dev/null || echo "?")
        echo "[pidtest:inner] spawned=$n pids.current=$cur"
      fi
      sleep '"${STEP_SLEEP}"'
    done
    echo "[pidtest:inner] reached target spawned=$n; holding 30s so alerts settle"
    sleep 30
  ' || echo "[pidtest] inner spawn loop ended (possibly hit the pids cap — that is the point)"

  echo "[pidtest] done; tearing down (trap will also ensure cleanup)"
}

main "$@"
