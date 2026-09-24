#!/bin/sh
set -eu

smoke_dir=$(mktemp -d /tmp/aidlc-docker-smoke.XXXXXX)
smoke_name="aidlc-smoke-$$"

cleanup() {
  docker rm -f "$smoke_name" >/dev/null 2>&1 || true
  rm -rf "$smoke_dir"
}
trap cleanup EXIT INT TERM

start_container() {
  docker run -d --name "$smoke_name" -p 127.0.0.1:3401:3000 \
    -v "$smoke_dir:/data" aidlc-planner:local >/dev/null
  curl --retry 20 --retry-all-errors --retry-delay 1 --max-time 30 \
    -fsS http://127.0.0.1:3401/ >/dev/null
}

start_container
curl -fsS -X POST http://127.0.0.1:3401/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Admin","email":"smoke@example.test","password":"smoke-test-password"}' \
  | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const x=JSON.parse(s);if(!x.isAdmin)process.exit(1)})'

docker rm -f "$smoke_name" >/dev/null
start_container
curl -fsS -X POST http://127.0.0.1:3401/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.test","password":"smoke-test-password"}' \
  | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const x=JSON.parse(s);if(!x.isAdmin)process.exit(1)})'

printf 'Docker image boot and SQLite bind-mount persistence passed.\n'
