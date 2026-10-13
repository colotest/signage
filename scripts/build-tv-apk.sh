#!/usr/bin/env bash
# Builds the Fire TV app (android/) and puts it at public/tv.apk, where a
# stick's Downloader app fetches it from: colo-cloud.app/tv.apk.
#
# Needs a JDK 17 and the Android SDK. On a Mac:
#   brew install openjdk@17 && brew install --cask android-commandlinetools
# The first run creates android/release.jks, the key every later version
# must be signed with to install over the last one. Back it up, together
# with android/keystore.properties.
set -euo pipefail

cd "$(dirname "$0")/../android"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$JAVA_HOME/bin:$PATH"

if [ ! -d "$ANDROID_HOME/platforms/android-35" ]; then
  # `yes` dies of SIGPIPE once the licences are accepted, hence the || true;
  # the check after is what says whether it worked.
  yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$ANDROID_HOME" \
    "platforms;android-35" "build-tools;35.0.0" >/dev/null || true
  [ -d "$ANDROID_HOME/platforms/android-35" ] || { echo "Android SDK install failed"; exit 1; }
fi
echo "sdk.dir=$ANDROID_HOME" > local.properties

if [ ! -f keystore.properties ]; then
  password="$(openssl rand -hex 16)"
  keytool -genkeypair -v -keystore release.jks -alias colocloud -keyalg RSA -keysize 2048 \
    -validity 36500 -storepass "$password" -keypass "$password" -dname "CN=Colo Cloud" >/dev/null
  printf 'storeFile=release.jks\nstorePassword=%s\nkeyAlias=colocloud\nkeyPassword=%s\n' "$password" "$password" \
    > keystore.properties
  echo "Created android/release.jks — back it up with android/keystore.properties."
fi

./gradlew --quiet assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../public/tv.apk
echo "Built public/tv.apk ($(du -h ../public/tv.apk | cut -f1))"
