#!/bin/bash
# Full build for hosts without Docker, such as Cloudflare Workers Builds:
# installs the pinned Emscripten toolchain, compiles the engine, builds dist/.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
tools="$root/engine/.tools"
# Keep in step with .ddev/docker-compose.emsdk.yaml.
emsdk_version=5.0.6
emsdk_commit=948c31acd3f369a5da276e33ab2ed57108c165e5
cmake_version=3.31.6
mkdir -p "$tools"

# A subshell, because emsdk puts its own older Node.js on PATH.
(
  if ! command -v cmake >/dev/null; then
    echo "===> Installing CMake $cmake_version"
    python3 -m pip install --quiet --target "$tools/cmake" "cmake==$cmake_version"
    export PYTHONPATH="$tools/cmake" PATH="$tools/cmake/bin:$PATH"
    cmake --version
  fi

  echo "===> Installing Emscripten $emsdk_version"
  if [ ! -d "$tools/emsdk/.git" ]; then
    git clone -q --depth 1 --branch "$emsdk_version" https://github.com/emscripten-core/emsdk.git "$tools/emsdk"
  fi
  actual="$(git -C "$tools/emsdk" rev-parse HEAD)"
  [ "$actual" = "$emsdk_commit" ] || { echo "ERROR: emsdk is at $actual, expected $emsdk_commit" >&2; exit 1; }
  "$tools/emsdk/emsdk" install "$emsdk_version"
  "$tools/emsdk/emsdk" activate "$emsdk_version"
  source "$tools/emsdk/emsdk_env.sh"

  engine/scripts/fetch.sh
  engine/scripts/build.sh
)

npm run build

for file in index.js index.wasm ref_gles3.wasm game_baseq2.wasm; do
  [ -f "dist/engine/upstream/$file" ] || { echo "ERROR: dist is missing the engine file $file" >&2; exit 1; }
done
echo "Site with engine ready in dist/"
