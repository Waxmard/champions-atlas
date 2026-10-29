#!/bin/bash
set -euo pipefail

APPLE_TEAM_ID="${APPLE_TEAM_ID:-48TY2FP59S}"
IOS_BUNDLE_ID="${IOS_BUNDLE_ID:-com.maxwellward.championsatlas}"
MARKETING_VERSION="${MARKETING_VERSION:-$(node -p "require('./package.json').version")}"
IOS_BUILD_NUMBER="${IOS_BUILD_NUMBER:-1}"

if [[ ! "$IOS_BUILD_NUMBER" =~ ^[0-9]+(\.[0-9]+){0,2}$ ]]; then
  printf 'Invalid IOS_BUILD_NUMBER: %s\n' "$IOS_BUILD_NUMBER" >&2
  exit 1
fi

if [[ ! "$MARKETING_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  printf 'Invalid MARKETING_VERSION: %s\n' "$MARKETING_VERSION" >&2
  exit 1
fi

npx cap sync ios

missing=()
for var in ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY APPLE_CERTIFICATE_P12_BASE64 APPLE_CERTIFICATE_PASSWORD; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done
if ((${#missing[@]} > 0)); then
  printf 'Missing required environment variable(s): %s\n' "${missing[*]}" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/atlas-ios.XXXXXX")"
KEYCHAIN_PATH="$WORK_DIR/build.keychain-db"
KEYCHAIN_PASSWORD="$(openssl rand -hex 24)"
trap 'security delete-keychain "$KEYCHAIN_PATH" >/dev/null 2>&1 || true; rm -rf "$WORK_DIR"' EXIT

printf '%s' "$APPLE_CERTIFICATE_P12_BASE64" | base64 --decode >"$WORK_DIR/dist.p12"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

existing_keychains=()
while IFS= read -r line; do
  trimmed="${line#"${line%%[![:space:]]*}"}"
  trimmed="${trimmed%\"}"
  trimmed="${trimmed#\"}"
  [[ -n "$trimmed" ]] && existing_keychains+=("$trimmed")
done < <(security list-keychains -d user)
security list-keychains -d user -s "$KEYCHAIN_PATH" ${existing_keychains[@]+"${existing_keychains[@]}"}

security import "$WORK_DIR/dist.p12" -k "$KEYCHAIN_PATH" -P "$APPLE_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

AUTH_KEY_PATH="$WORK_DIR/AuthKey_${ASC_KEY_ID}.p8"
printf '%s\n' "$ASC_PRIVATE_KEY" >"$AUTH_KEY_PATH"
chmod 600 "$AUTH_KEY_PATH"

EXPORT_OPTIONS_PLIST="$WORK_DIR/ExportOptions.plist"
cat >"$EXPORT_OPTIONS_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>destination</key>
	<string>export</string>
	<key>manageAppVersionAndBuildNumber</key>
	<false/>
	<key>method</key>
	<string>app-store-connect</string>
	<key>signingStyle</key>
	<string>automatic</string>
	<key>teamID</key>
	<string>${APPLE_TEAM_ID}</string>
</dict>
</plist>
EOF

ARCHIVE_PATH="$WORK_DIR/App.xcarchive"
EXPORT_PATH="$WORK_DIR/export"

xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  ATLAS_BUNDLE_ID="$IOS_BUNDLE_ID" \
  MARKETING_VERSION="$MARKETING_VERSION" \
  CURRENT_PROJECT_VERSION="$IOS_BUILD_NUMBER" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$AUTH_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  archive

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS_PLIST" \
  -exportPath "$EXPORT_PATH" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$AUTH_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

API_PRIVATE_KEYS_DIR="$WORK_DIR" xcrun altool \
  --upload-app \
  -f "$EXPORT_PATH/App.ipa" \
  --type ios \
  --apiKey "$ASC_KEY_ID" \
  --apiIssuer "$ASC_ISSUER_ID"
