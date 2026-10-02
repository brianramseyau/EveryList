import UIKit

/// The app's paper/ink colors, mirroring `--color-paper` / `--color-ink` from
/// `apps/web/src/routes/layout.css`. Pulled out of `MainViewController` as pure functions so the
/// exact values are unit-testable (`EveryListTests`) rather than only reachable through a live
/// `UITraitCollection`.
///
/// There's no live channel from the web layer's theme setting (light/dark/automatic, stored in
/// localStorage) to native code, so these follow the *system* appearance instead — matching the
/// common case (most users leave the in-app setting on "automatic") without needing a bridge call
/// just for the rubber-band overscroll region above content.
enum ThemeColors {
    /// @param dark whether the current interface style is dark.
    /// @returns the paper (background) color.
    static func paper(dark: Bool) -> UIColor {
        dark
            ? UIColor(red: 0x1b / 255, green: 0x1d / 255, blue: 0x1f / 255, alpha: 1)
            : UIColor(red: 0xf6 / 255, green: 0xf5 / 255, blue: 0xf1 / 255, alpha: 1)
    }

    /// @param dark whether the current interface style is dark.
    /// @returns the ink (foreground) color.
    static func ink(dark: Bool) -> UIColor {
        dark
            ? UIColor(red: 0xed / 255, green: 0xea / 255, blue: 0xe3 / 255, alpha: 1)
            : UIColor(red: 0x20 / 255, green: 0x1f / 255, blue: 0x1d / 255, alpha: 1)
    }
}
