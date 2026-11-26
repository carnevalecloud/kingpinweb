#!/bin/bash
# Build the unmodified upstream engine into public/engine/upstream/.
# Run inside the pinned Emscripten container: `ddev engine build`.
#
# Sources are exported fresh from the pinned commits on every build, so local
# edits in engine/.upstream/ never leak into the output.
set -euo pipefail

engine_dir="$(cd "$(dirname "$0")/.." && pwd)"
root="$(dirname "$engine_dir")"
upstream="$engine_dir/.upstream"
build="$engine_dir/.build"
out="$root/public/engine/upstream"
jobs="$(nproc)"

verify=0
for arg in "$@"; do
  case "$arg" in
    --verify-reproducible) verify=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

command -v emmake >/dev/null || { echo "ERROR: emmake not found; run via 'ddev engine build'" >&2; exit 1; }

build_once() {
  rm -rf "$build"
  mkdir -p "$build"
  for name in qwasm2 gl4es; do
    mkdir -p "$build/$name"
    git -C "$upstream/$name" archive HEAD | tar -x -C "$build/$name"
  done

  # Upstream derives its build date from this, which keeps output stable.
  SOURCE_DATE_EPOCH="$(git -C "$upstream/qwasm2" log -1 --format=%ct)"
  export SOURCE_DATE_EPOCH

  # Qwasm2 needs a position-independent GL4ES. Upstream says to edit GL4ES's
  # CMakeLists.txt; passing -fPIC on the command line is equivalent and leaves
  # the source untouched.
  echo "===> GL4ES"
  emcmake cmake -S "$build/gl4es" -B "$build/gl4es/build" \
    -DCMAKE_BUILD_TYPE=RelWithDebInfo -DNOX11=ON -DNOEGL=ON -DSTATICLIB=ON \
    -DCMAKE_C_FLAGS=-fPIC >"$build/gl4es.log" 2>&1 || { cat "$build/gl4es.log" >&2; return 1; }
  cmake --build "$build/gl4es/build" -j "$jobs" >>"$build/gl4es.log" 2>&1 || { tail -50 "$build/gl4es.log" >&2; return 1; }

  # Two stages: upstream's client link consumes the side modules but does not
  # declare them as prerequisites, so a single parallel `make` fails.
  echo "===> Engine"
  (
    cd "$build/qwasm2"
    emmake make -j "$jobs" GL4ES_PATH="$build/gl4es" ref_soft ref_gl1 ref_gles3 game &&
    emmake make -j "$jobs" GL4ES_PATH="$build/gl4es" client
  ) >"$build/qwasm2.log" 2>&1 || { tail -80 "$build/qwasm2.log" >&2; return 1; }
}

artifacts=(index.html index.js index.wasm index.data game_baseq2.wasm ref_soft.wasm ref_gl1.wasm ref_gles3.wasm)

checksums() {
  (cd "$build/qwasm2/release" && sha256sum "${artifacts[@]}")
}

build_once
if [ "$verify" = 1 ]; then
  first="$(checksums)"
  build_once
  if [ "$first" != "$(checksums)" ]; then
    echo "ERROR: build is not reproducible" >&2
    diff <(echo "$first") <(checksums) >&2 || true
    exit 1
  fi
  echo "Reproducible: two clean builds produced identical artifacts."
fi

rm -rf "$out"
mkdir -p "$out/licenses" "$out/source"
for f in "${artifacts[@]}"; do
  cp "$build/qwasm2/release/$f" "$out/$f"
done

# GPL: ship licence texts and the corresponding source next to the binaries.
cp "$upstream/qwasm2/LICENSE" "$out/licenses/qwasm2-LICENSE"
cp "$upstream/gl4es/LICENSE" "$out/licenses/gl4es-LICENSE"
for name in qwasm2 gl4es; do
  git -C "$upstream/$name" archive --format=tar --prefix="$name/" HEAD | gzip -n >"$out/source/$name.tar.gz"
done
cp "$engine_dir/scripts/build.sh" "$engine_dir/upstream.lock" "$out/source/"

{
  echo '{'
  echo "  \"flavour\": \"upstream-unmodified\","
  echo "  \"emscripten\": \"$(emcc --version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)\","
  echo "  \"upstream\": {"
  echo "    \"qwasm2\": \"$(git -C "$upstream/qwasm2" rev-parse HEAD)\","
  echo "    \"gl4es\": \"$(git -C "$upstream/gl4es" rev-parse HEAD)\""
  echo "  },"
  echo "  \"sha256\": {"
  checksums | awk '{ printf "%s    \"%s\": \"%s\"", (NR > 1 ? ",\n" : ""), $2, $1 } END { print "" }'
  echo "  }"
  echo '}'
} >"$out/build-info.json"

echo "===> Engine installed to ${out#"$root"/}"
ls -l "$out"
