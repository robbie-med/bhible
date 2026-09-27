#!/usr/bin/env bash
# Build, verify and (optionally) install the BHible Android app.
#
# The APK is only a Trusted Web Activity shell around https://bhible.robbiemed.org,
# so app changes ship by pushing the site. Rebuild this only when the shell itself
# changes (icon, name, URL); bump versionCode in app/build.gradle.kts when you do.
#
#   ./release.sh              build + verify, copy to BHible.apk
#   ./release.sh --install    also install on the connected device

set -euo pipefail
cd "$(dirname "$0")"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
APK=app/build/outputs/apk/release/app-release.apk
DO_INSTALL=false
for arg in "$@"; do
  case "$arg" in
    --install) DO_INSTALL=true ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
fail()  { red "FAIL  $*"; exit 1; }
ok()    { green "ok    $*"; }
tool()  { ls "$ANDROID_HOME"/build-tools/*/"$1" | tail -1; }

[[ -f keystore.properties ]] || fail "keystore.properties missing (see keystore.properties.example).
      An unsigned or differently signed APK won't upgrade an existing install
      and won't match /.well-known/assetlinks.json, so the URL bar would show."

# IPv6 is broken on this host; preferIPv4Stack is also set for the build JVM in gradle.properties
./gradlew assembleRelease --no-daemon -Djava.net.preferIPv4Stack=true -q
[[ -f $APK ]] || fail "no APK produced"
ok "built $(du -h "$APK" | cut -f1) APK, versionCode $(grep -oP 'versionCode\s*=\s*\K[0-9]+' app/build.gradle.kts)"

# Signing key must be the one the site vouches for, or Chrome shows a URL bar
CERT=$("$(tool apksigner)" verify --print-certs "$APK" | grep -m1 'SHA-256 digest' | awk '{print $NF}')
LINKED=$(grep -oE '([0-9A-F]{2}:){31}[0-9A-F]{2}' ../.well-known/assetlinks.json | tr -d ':' | tr 'A-F' 'a-f')
[[ -n "$CERT" ]] || fail "APK is unsigned"
grep -qx "$CERT" <<<"$LINKED" || fail "signing cert $CERT is not listed in ../.well-known/assetlinks.json"
ok "signed with the key listed in assetlinks.json"

LIVE=$(curl -4 -fsS https://bhible.robbiemed.org/.well-known/assetlinks.json 2>/dev/null | tr -d ':' | tr 'A-F' 'a-f' || true)
if grep -q "$CERT" <<<"$LIVE"; then
  ok "live site serves matching assetlinks.json"
else
  red "warn  bhible.robbiemed.org doesn't serve a matching assetlinks.json yet (push, then wait for Pages)"
fi

PERMS=$("$(tool aapt2)" dump permissions "$APK" | grep '^uses-permission' \
        | grep -v 'DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION' || true)
[[ -z "$PERMS" ]] || fail "APK declares unexpected permissions:
$PERMS"
ok "no permissions"

cp "$APK" BHible.apk
ok "copied to android/BHible.apk"

if $DO_INSTALL; then
  mapfile -t online < <(adb devices | awk '$2=="device"{print $1}')
  [[ ${#online[@]} -eq 1 ]] || fail "need exactly one online device (have: ${online[*]:-none})"
  adb -s "${online[0]}" install -r BHible.apk >/dev/null
  ok "installed on ${online[0]}"
fi
