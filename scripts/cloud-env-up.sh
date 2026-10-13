#!/bin/sh
# D082: bring up a Claude Code cloud container for paid runs. Idempotent; the daemon and mount do not survive a restart.
# - Docker without the containerd snapshotter, so image IDs match the pinned lock (sha256:b47cc887...).
# - The repository bind-mounted at the Mac path recorded in the D066 catalog result (absolute catalog_path check).
# Run paid commands from the mount with NODE_USE_ENV_PROXY=1 (Node fetch otherwise bypasses the egress proxy).
set -e
REPO=$(cd "$(dirname "$0")/.." && pwd -P)
MOUNT=/Users/lee/workspace/plugins/jev-router
IMAGE=sha256:b47cc8871095d567c4f4c6a3116a5a26269fd37a3958b59e8586d6fc6b579eba
DIGEST=ghcr.io/facebookresearch/e2e-swe@sha256:6fff26a8c24b60f855046bc61e657af2112217addbb7d4ac553eb5d449a7dab5

if [ ! -f /etc/docker/daemon.json ]; then
  mkdir -p /etc/docker
  echo '{"features":{"containerd-snapshotter":false}}' > /etc/docker/daemon.json
fi
if ! docker info >/dev/null 2>&1; then
  setsid nohup dockerd > /tmp/dockerd.log 2>&1 < /dev/null &
  i=0; while [ $i -lt 30 ] && ! docker info >/dev/null 2>&1; do sleep 1; i=$((i+1)); done
fi
docker info >/dev/null 2>&1 || { echo "docker daemon did not start (see /tmp/dockerd.log)"; exit 1; }
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull "$DIGEST" >/dev/null
[ "$(docker image inspect "$DIGEST" --format '{{.Id}}')" = "$IMAGE" ] || { echo "image ID does not match the pinned lock"; exit 1; }
echo "docker ready, image $IMAGE"

if [ "$REPO" != "$MOUNT" ]; then
  mkdir -p "$MOUNT"
  mountpoint -q "$MOUNT" || mount --bind "$REPO" "$MOUNT"
  mountpoint -q "$MOUNT" || { echo "bind mount failed"; exit 1; }
fi
echo "repository at $MOUNT"
