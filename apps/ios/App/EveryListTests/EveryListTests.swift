import XCTest
@testable import App

/// Unit tests for the pure helpers extracted out of `MainViewController` (PLAN_36, the iOS half):
/// the SPA-fallback path decision and the paper/ink theme colors. Everything else in the shell is
/// Capacitor/UIKit boilerplate that needs a running app to exercise.
final class EveryListTests: XCTestCase {

    // MARK: - spaFallbackPath

    func testSpaFallbackPathRemapsExtensionlessPathsToTheSpaShell() {
        // iOS's Router receives the actual request path (unlike Android's RouteProcessor, which
        // gets the literal /index.html), so any extensionless path is a client route.
        XCTAssertEqual(spaFallbackPath(basePath: "", path: "/"), "/200.html")
        XCTAssertEqual(spaFallbackPath(basePath: "", path: "/index.html"), "/200.html")
        XCTAssertEqual(spaFallbackPath(basePath: "", path: "/lists"), "/200.html")
        XCTAssertEqual(spaFallbackPath(basePath: "/app", path: "/lists/74"), "/app/200.html")
    }

    func testSpaFallbackPathPassesRealAssetPathsThrough() {
        XCTAssertEqual(
            spaFallbackPath(basePath: "", path: "/_app/immutable/entry.js"),
            "/_app/immutable/entry.js")
        XCTAssertEqual(
            spaFallbackPath(basePath: "/base", path: "/_app/immutable/entry.css"),
            "/base/_app/immutable/entry.css")
        XCTAssertEqual(spaFallbackPath(basePath: "", path: "/favicon.png"), "/favicon.png")
    }

    // MARK: - ThemeColors

    func testPaperColorMatchesTheLightAndDarkTokens() {
        assertColor(ThemeColors.paper(dark: false), red: 0xf6, green: 0xf5, blue: 0xf1)
        assertColor(ThemeColors.paper(dark: true), red: 0x1b, green: 0x1d, blue: 0x1f)
    }

    func testInkColorMatchesTheLightAndDarkTokens() {
        assertColor(ThemeColors.ink(dark: false), red: 0x20, green: 0x1f, blue: 0x1d)
        assertColor(ThemeColors.ink(dark: true), red: 0xed, green: 0xea, blue: 0xe3)
    }

    /// Asserts an sRGB color's components (within a rounding tolerance) and full opacity.
    private func assertColor(
        _ color: UIColor,
        red: CGFloat,
        green: CGFloat,
        blue: CGFloat,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        var r: CGFloat = 0
        var g: CGFloat = 0
        var b: CGFloat = 0
        var a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(r, red / 255, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(g, green / 255, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(b, blue / 255, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(a, 1, accuracy: 0.001, file: file, line: line)
    }
}
