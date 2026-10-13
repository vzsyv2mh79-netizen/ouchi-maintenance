import XCTest

/// In-memory sample only; never authenticates or purchases.
@MainActor
final class LargeTextInteractionTests: XCTestCase {
    private func launch(tab: Int, releaseLayout: Bool = false, twoHomes: Bool = false) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.ouchi.review.storecaptures")
        app.launchEnvironment["OUCHI_REVIEW_CAPTURE_TAB"] = String(tab)
        if releaseLayout { app.launchEnvironment["OUCHI_REVIEW_AUDIT_RELEASE_LAYOUT"] = "1" }
        if twoHomes { app.launchEnvironment["OUCHI_REVIEW_TWO_HOMES"] = "1" }
        app.launchArguments = ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        if !releaseLayout { XCTAssertTrue(app.staticTexts["ouchi.reviewSample"].waitForExistence(timeout: 45)) }
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

    func testInitialTabAccessibilityAudits() {
        for tab in 0...4 {
            let app = launch(tab: tab, releaseLayout: true)
            continueAfterFailure = true
            capture(app, name: "audit-tab-\(tab)-initial")
            do {
                try app.performAccessibilityAudit(for: [.contrast, .dynamicType, .elementDetection,
                    .hitRegion, .sufficientElementDescription, .textClipped, .trait])
            } catch {
                XCTFail("Initial tab \(tab) accessibility audit failed: \(error)")
            }
            app.terminate()
        }
    }

    func testHomeMenuCurrentHomeReselection() {
        let app = launch(tab: 0)
        let chooser = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "住まいを切り替える")).firstMatch
        reach(chooser, in: app)
        chooser.tap()
        let home = app.buttons["サンプルのわが家"]
        XCTAssertTrue(home.waitForExistence(timeout: 10))
        XCTAssertTrue(home.isHittable)
        capture(app, name: "home-menu-open")
        home.tap()
        XCTAssertTrue(chooser.waitForExistence(timeout: 10))
        XCTAssertTrue(app.navigationBars["おうちメンテ"].exists)
        capture(app, name: "home-menu-reselected")
        app.terminate()
    }

    func testVisibleProductMemoAccessibilityAudit() {
        let app = launch(tab: 2, releaseLayout: true)
        let memo = app.staticTexts["実際の製品・公式情報ではありません。"]
        reach(memo, in: app)
        capture(app, name: "product-memo-entirely-above-tab-bar")
        // Audit the unfiltered screen after the reported memo is wholly visible.
        // This distinguishes its visible appearance from the initial tab-bar overlap.
        do {
            try app.performAccessibilityAudit(for: [.contrast, .dynamicType, .elementDetection,
                .hitRegion, .sufficientElementDescription, .textClipped, .trait])
        } catch {
            XCTFail("Visible product memo accessibility audit failed: \(error)")
        }
        app.terminate()
    }

    func testVisibleOverdueCountAccessibilityAudit() {
        let app = launch(tab: 0, releaseLayout: true)
        let overdue = app.staticTexts["期限を過ぎたお手入れ"]
        reach(overdue, in: app)
        capture(app, name: "overdue-label-entirely-above-tab-bar")
        do {
            try app.performAccessibilityAudit(for: [.contrast, .dynamicType, .elementDetection,
                .hitRegion, .sufficientElementDescription, .textClipped, .trait])
        } catch {
            XCTFail("Visible overdue-count accessibility audit failed: \(error)")
        }
        app.terminate()
    }

    func testHomeSwitchKeepsRecordsInSelectedHome() {
        let app = launch(tab: 2, twoHomes: true)
        func selectHome(_ name: String) {
            let chooser = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "住まいを切り替える")).firstMatch
            reach(chooser, in: app)
            chooser.tap()
            let item = app.buttons[name]
            XCTAssertTrue(item.waitForExistence(timeout: 10))
            XCTAssertTrue(item.isHittable)
            item.tap()
            let selected = app.buttons.matching(NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", name, "住まいを切り替える")).firstMatch
            XCTAssertTrue(selected.waitForExistence(timeout: 10))
        }
        selectHome("サンプルの別の住まい")
        XCTAssertFalse(app.buttons["空気清浄機（サンプル）"].exists)
        capture(app, name: "second-home-products-empty")
        app.tabBars.buttons["履歴"].tap()
        XCTAssertFalse(app.staticTexts["フィルター確認（サンプル）"].exists)
        capture(app, name: "second-home-history-empty")
        selectHome("サンプルのわが家")
        XCTAssertTrue(app.staticTexts["フィルター確認（サンプル）"].waitForExistence(timeout: 10))
        app.tabBars.buttons["製品"].tap()
        let product = app.buttons["空気清浄機（サンプル）"]
        reach(product, in: app)
        capture(app, name: "first-home-product-restored")
        app.terminate()
    }

    func testAppearanceChoiceSurvivesRelaunch() {
        let app = launch(tab: 0)
        let initialDark = app.buttons["ダークモードに切り替える"]
        let initialLight = app.buttons["ライトモードに切り替える"]
        XCTAssertTrue(initialDark.exists || initialLight.exists)
        let toggle = initialDark.exists ? initialDark : initialLight
        let expected = initialDark.exists ? "ライトモードに切り替える" : "ダークモードに切り替える"
        let original = toggle.label
        XCTAssertTrue(toggle.isHittable)
        toggle.tap()
        XCTAssertTrue(app.buttons[expected].waitForExistence(timeout: 10))
        capture(app, name: "appearance-toggled")
        app.terminate()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 45))
        XCTAssertTrue(app.buttons[expected].waitForExistence(timeout: 10))
        capture(app, name: "appearance-restored-after-relaunch")
        app.buttons[expected].tap()
        XCTAssertTrue(app.buttons[original].waitForExistence(timeout: 10))
        app.terminate()
    }

}
