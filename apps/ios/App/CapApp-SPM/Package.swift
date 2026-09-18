// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.0"),
        .package(name: "AparajitaCapacitorBiometricAuth", path: "../../../../node_modules/.pnpm/@aparajita+capacitor-biometric-auth@10.0.0/node_modules/@aparajita/capacitor-biometric-auth"),
        .package(name: "CapacitorApp", path: "../../../../node_modules/.pnpm/@capacitor+app@8.1.1_@capacitor+core@8.5.0/node_modules/@capacitor/app"),
        .package(name: "CapacitorBrowser", path: "../../../../node_modules/.pnpm/@capacitor+browser@8.0.4_@capacitor+core@8.5.0/node_modules/@capacitor/browser"),
        .package(name: "CapacitorLocalNotifications", path: "../../../../node_modules/.pnpm/@capacitor+local-notifications@8.3.1_patch_hash=273bc3fcf97caeb4faa025d90a4b28e3368dab0_1adfd417bb8ac808a67db64f8c17ec1b/node_modules/@capacitor/local-notifications"),
        .package(name: "CapacitorScreenOrientation", path: "../../../../node_modules/.pnpm/@capacitor+screen-orientation@8.0.1_@capacitor+core@8.5.0/node_modules/@capacitor/screen-orientation"),
        .package(name: "CapawesomeCapacitorBadge", path: "../../../../node_modules/.pnpm/@capawesome+capacitor-badge@8.0.2_@capacitor+core@8.5.0/node_modules/@capawesome/capacitor-badge")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "AparajitaCapacitorBiometricAuth", package: "AparajitaCapacitorBiometricAuth"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorBrowser", package: "CapacitorBrowser"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapacitorScreenOrientation", package: "CapacitorScreenOrientation"),
                .product(name: "CapawesomeCapacitorBadge", package: "CapawesomeCapacitorBadge")
            ]
        )
    ]
)
