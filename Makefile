.PHONY: setup ci ios

setup:
	npm ci

ci:
	npm run ci

ios:
	npm run build
	npx cap sync ios
	npx cap open ios
