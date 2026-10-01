# Native apps (iOS/Android)

The native apps release on their **own streams**, separate from the server (`vX.Y.Z`): Android on `android-vX.Y.Z` and iOS on `ios-vX.Y.Z`. An `android-vX.Y.Z-rc.N` tag builds a debug-signed APK (sideload-ready as-is) attached to a prerelease [GitHub Release](https://github.com/brianramseyau/EveryList/releases); a real `android-vX.Y.Z` tag builds the AAB and publishes it to Play closed testing. An `ios-vX.Y.Z` tag builds an unsigned iOS Simulator app. Neither app is store-signed for direct install — there's no release keystore shipped publicly or Apple Developer Program enrollment — so today this is a "sideload/simulate the CI build" situation, not an App/Play Store listing. The app itself doesn't care: on first launch it sends you to a `/server-setup` screen to enter your own instance's URL, so one build works against anyone's self-hosted server with no rebuild. See [`foundational/PLAN_35_PHASE_NATIVE_RELEASE_STREAMS.md`](../foundational/PLAN_35_PHASE_NATIVE_RELEASE_STREAMS.md).

For the Play Store side, a real Android release's AAB is published to the closed-testing track by `android-build.yml`, with its "What's new" release notes taken from the newest entry's truncated summary block in [`apps/android/CHANGELOG.md`](../apps/android/CHANGELOG.md) (see the release process in [`AGENTS.md`](../AGENTS.md)).

## Android home-screen widget

The Android build also ships a Google-Tasks-style home-screen widget: set it up once from `Settings → Home-screen widget` (which mints a scoped token just for the widget), then place it from your launcher's widget picker. It's network-backed against your instance (a native widget can't reach the WebView's offline cache), showing the last fetched snapshot with a "can't reach server" note when offline.
