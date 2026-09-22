# Native apps (iOS/Android)

Every `vX.Y.Z` tag also builds and attaches native app packages to the corresponding [GitHub Release](https://github.com/brianramseyau/EveryList/releases): a debug-signed Android APK (sideload-ready as-is) and an unsigned iOS Simulator build. Neither is store-signed yet — there's no release keystore or Apple Developer Program enrollment behind this build — so today this is a "build it yourself a real release, or sideload/simulate the CI one" situation, not an App/Play Store listing. The app itself doesn't care: on first launch it sends you to a `/server-setup` screen to enter your own instance's URL, so one build works against anyone's self-hosted server with no rebuild.

## Android home-screen widget

The Android build also ships a Google-Tasks-style home-screen widget: set it up once from `Settings → Home-screen widget` (which mints a scoped token just for the widget), then place it from your launcher's widget picker. It's network-backed against your instance (a native widget can't reach the WebView's offline cache), showing the last fetched snapshot with a "can't reach server" note when offline.
