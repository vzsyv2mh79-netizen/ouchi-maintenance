import XCTest

/// In-memory sample only; never authenticates or purchases.
@MainActor
final class LargeTextInteractionTests: XCTestCase {
    private func launch(tab: Int) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.ouchi.review.storecaptures")
        app.launchEnvironment["OUCHI_REVIEW_CAPTURE_TAB"] = String(tab)
        app.launchArguments = ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        XCTAssertTrue(app.staticTexts["ouchi.reviewSample"].waitForExistence(timeout: 45))
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 45))
        return app
    }

    private func reach(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<30 {
            var bottom = app.frame.maxY - 16
            if app.tabBars.firstMatch.exists { bottom = min(bottom, app.tabBars.firstMatch.frame.minY - 8) }
            if app.keyboards.firstMatch.exists { bottom = min(bottom, app.keyboards.firstMatch.frame.minY - 8) }
            let top = app.navigationBars.firstMatch.frame.maxY + 8
            if element.exists && element.isHittable && element.frame.minY >= top && element.frame.maxY <= bottom { return }
            // Hittable alone can accept a control obscured by the translucent
            // tab bar. Bring the entire control into the content viewport.
            let down = element.exists && element.frame.minY < top
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: down ? 0.45 : 0.70))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: down ? 0.70 : 0.45))
            start.press(forDuration: 0.05, thenDragTo: end)
        }
        XCTFail("Could not reach control: \(element)")
    }

    private func capture(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testCompletionUpdatesDueDateAndHistory() {
        let app = launch(tab: 1)
        let complete = app.buttons["空気清浄機（サンプル）のフィルター確認（サンプル）の完了を記録"]
        reach(complete, in: app)
        XCTAssertTrue(complete.isEnabled)
        capture(app, name: "completion-reachable")
        complete.tap()
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        let next = formatter.string(from: calendar.date(byAdding: .day, value: 30, to: Date())!)
        XCTAssertTrue(app.staticTexts["次回 \(next)・30日ごと"].waitForExistence(timeout: 30))
        app.tabBars.buttons["履歴"].tap()
        let entries = app.staticTexts.matching(NSPredicate(format: "label == %@", "フィルター確認（サンプル）"))
        XCTAssertTrue(entries.firstMatch.waitForExistence(timeout: 10))
        XCTAssertEqual(entries.count, 2, "Completion adds exactly one sample history entry")
        capture(app, name: "completion-history")
        app.terminate()
    }

    func testExportControlReachableAndProducesShareControl() {
        let app = launch(tab: 4)
        let export = app.buttons["すべての記録を書き出す"]
        reach(export, in: app)
        XCTAssertTrue(export.isEnabled)
        capture(app, name: "export-reachable")
        export.tap()
        let share = app.buttons["ファイルを共有・保存"]
        XCTAssertTrue(share.waitForExistence(timeout: 10))
        reach(share, in: app)
        capture(app, name: "export-created")
        app.terminate()
    }

    func testProductEditorKeyboardAndCancel() {
        let app = launch(tab: 2)
        let product = app.buttons["空気清浄機（サンプル）"]
        reach(product, in: app)
        product.tap()
        let model = app.textFields["品番"]
        XCTAssertTrue(model.waitForExistence(timeout: 10))
        reach(model, in: app)
        model.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10), "Software keyboard must really be open")
        reach(model, in: app)
        model.typeText("X")
        XCTAssertTrue((model.value as? String)?.contains("X") == true)
        capture(app, name: "editor-keyboard-model-visible")
        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.isHittable)
        back.tap()
        XCTAssertTrue(app.staticTexts["画面確認用 SAMPLE-001"].waitForExistence(timeout: 10), "Leaving without saving preserves the original sample model")
        capture(app, name: "editor-cancel-original-record")
        app.terminate()
    }
}
