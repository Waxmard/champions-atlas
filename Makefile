.PHONY: setup ci ios

IOS_DEVICE ?= Gengar Phone

setup:
	npm ci

ci:
	npm run ci

ios:
	@test -n "$(IOS_DEVICE)" || { echo 'Set IOS_DEVICE to the target device.' >&2; exit 1; }
	npm run build
	npx cap sync ios
	xcrun xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -derivedDataPath ios/DerivedData MARKETING_VERSION="$$(node -p "require('./package.json').version")" build
	@for attempt in 1 2 3; do \
		echo "Installing on $(IOS_DEVICE) (attempt $$attempt of 3)..."; \
		if xcrun devicectl device install app --device "$(IOS_DEVICE)" ios/DerivedData/Build/Products/Release-iphoneos/App.app; then exit 0; fi; \
		if [ "$$attempt" -eq 3 ]; then echo 'Install failed after 3 attempts; see docs/firebase.md for the Xcode fallback.' >&2; exit 1; fi; \
		echo "Install attempt $$attempt failed; retrying in 10s." >&2; \
		sleep 10; \
	done
	xcrun devicectl device process launch --device "$(IOS_DEVICE)" com.maxwellward.championsatlas
