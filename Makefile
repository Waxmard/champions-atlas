.PHONY: setup ci ios

setup:
	npm ci

ci:
	npm run ci

ios:
	@test -n "$(IOS_DEVICE)" || { echo 'Set IOS_DEVICE to the target device.' >&2; exit 1; }
	npm run build
	npx cap sync ios
	xcrun xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -derivedDataPath ios/DerivedData build
	xcrun devicectl device install app --device "$(IOS_DEVICE)" ios/DerivedData/Build/Products/Release-iphoneos/App.app
	xcrun devicectl device process launch --device "$(IOS_DEVICE)" com.maxwellward.championsatlas
