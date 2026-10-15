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
        let diagnostic = XCTAttachment(string: "Target: \(element)\nExists: \(element.exists)\nApp: \(app.frame)\n\(app.debugDescription)")
        diagnostic.name = "unreachable-control-accessibility-tree"
        diagnostic.lifetime = .keepAlways
        add(diagnostic)
        capture(app, name: "unreachable-control-viewport")
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
        XCTAssertTrue(app.staticTexts["次回 \(next)"].waitForExistence(timeout: 30))
        let interval = app.staticTexts["30日ごと"]
        reach(interval, in: app)
        XCTAssertTrue(interval.exists)
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
        // A Form drag can dismiss the keyboard. Refocus as a person would before
        // entering text; typeText alone can otherwise use simulated hardware input.
        model.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        model.typeText("X")
        XCTAssertTrue((model.value as? String)?.contains("X") == true)
        let keyboard = app.keyboards.firstMatch
        let keyboardFrame = keyboard.exists ? keyboard.frame : .zero
        let visibleKeyboard = keyboardFrame.intersection(app.frame)
        let keyboardVisible = keyboard.exists && keyboard.isHittable && !visibleKeyboard.isNull && visibleKeyboard.height >= 100
        if !keyboardVisible {
            let diagnostic = XCTAttachment(string: "App: \(app.frame)\nKeyboard: \(keyboardFrame)\n\(app.debugDescription)")
            diagnostic.name = "editor-keyboard-visibility-tree"
            diagnostic.lifetime = .keepAlways
            add(diagnostic)
            capture(app, name: "editor-keyboard-not-visible-after-input")
        }
        XCTAssertTrue(keyboardVisible, "Software keyboard must remain visibly open after scrolling and typing")
        XCTAssertLessThanOrEqual(model.frame.maxY, keyboardFrame.minY - 8, "Entire model field must stay above the visible software keyboard")
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
                    .hitRegion, .sufficientElementDescription, .textClipped, .trait]) { issue in
                    // Record context without handling/filtering any audit issue.
                    NSLog("Accessibility audit tab %d: %@; element=%@", tab,
                          issue.detailedDescription, issue.element?.debugDescription ?? "unavailable")
                    return false
                }
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
        XCTAssertEqual(chooser.label, "住まいを切り替える")
        XCTAssertEqual(chooser.value as? String, "サンプルのわが家")
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
        // LabeledContent exposes both a visual child label and the semantic
        // label/value row. Reach the row people hear, including its count.
        let overdue = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@ AND label CONTAINS %@", "期限を過ぎたお手入れ", "件")).firstMatch
        reach(overdue, in: app)
        let reload = app.navigationBars.buttons["最新の記録を読み込む"]
        XCTAssertTrue(reload.isHittable, "Reload stays reachable after scrolling the home list")
        capture(app, name: "overdue-label-entirely-above-tab-bar")
        do {
            try app.performAccessibilityAudit(for: [.contrast, .dynamicType, .elementDetection,
                .hitRegion, .sufficientElementDescription, .textClipped, .trait]) { issue in
                    NSLog("Visible overdue audit: %@; element=%@", issue.detailedDescription,
                          issue.element?.debugDescription ?? "unavailable")
                    return false // Preserve every reported issue; diagnostics only.
                }
        } catch {
            XCTFail("Visible overdue-count accessibility audit failed: \(error)")
        }
        app.terminate()
    }

    // Isolate the previously reported category. This does not replace the
    // seven-category audit or turn the separate contrast finding into a pass.
    func testVisibleOverdueDynamicType() {
        let app = launch(tab: 0, releaseLayout: true)
        let overdue = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@ AND label CONTAINS %@", "期限を過ぎたお手入れ", "件")).firstMatch
        reach(overdue, in: app)
        capture(app, name: "overdue-dynamic-type-visible")
        do {
            try app.performAccessibilityAudit(for: .dynamicType) { issue in
                NSLog("Focused overdue Dynamic Type: %@; element=%@", issue.detailedDescription,
                      issue.element?.debugDescription ?? "unavailable")
                return false
            }
        } catch { XCTFail("Visible overdue Dynamic Type failed: \(error)") }
        app.terminate()
    }

    func testFamilyDetailsLoadAndRemainReachable() {
        let app = launch(tab: 4, releaseLayout: true)
        let sharing = app.buttons["家族と共有"]
        reach(sharing, in: app)
        sharing.tap()
        let member = app.staticTexts["家族のサンプル"]
        // Form rows below the viewport may not exist in the accessibility
        // tree until scrolled into view. Require the complete visible row.
        reach(member, in: app)
        XCTAssertTrue(member.exists)
        capture(app, name: "family-sample-member-fully-visible")
        reach(app.buttons["家族一覧を再読み込み"], in: app)
        XCTAssertTrue(app.buttons["家族一覧を再読み込み"].isHittable)
        capture(app, name: "family-reload-fully-visible")
        app.terminate()
    }

    func testReviewedLegalLinksAreReachableFromPrivacy() {
        let app = launch(tab: 4)
        let privacy = app.buttons["データの取り扱い"]
        reach(privacy, in: app)
        privacy.tap()
        for (identifier, label) in [("ouchi.legal.privacy", "プライバシーポリシーを開く"),
                                     ("ouchi.legal.terms", "利用規約を開く"),
                                     ("ouchi.legal.support", "問い合わせ先を開く")] {
            // Native Link may expose a link trait rather than a button trait.
            let link = app.descendants(matching: .any).matching(identifier: identifier).firstMatch
            reach(link, in: app)
            XCTAssertEqual(link.label, label)
            XCTAssertTrue(link.elementType == .link || link.elementType == .button)
            XCTAssertTrue(link.isEnabled)
        }
        capture(app, name: "reviewed-legal-links-visible")
        app.terminate()
    }

    // Diagnose the two reported findings without hiding or filtering any node.
    // These focused categories do not replace the failed seven-category full audit.
    func testVisibleTaskProductClipping() {
        let app = launch(tab: 1, releaseLayout: true)
        let product = app.staticTexts["空気清浄機（サンプル）"]
        reach(product, in: app)
        capture(app, name: "task-product-fully-visible")
        do { try app.performAccessibilityAudit(for: .textClipped) }
        catch { XCTFail("Visible task product clipping audit failed: \(error)") }
        app.terminate()
    }

    func testVisibleNextDateContrast() {
        let app = launch(tab: 1, releaseLayout: true)
        let due = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "次回 ")).firstMatch
        reach(due, in: app)
        capture(app, name: "task-next-date-fully-visible")
        do { try app.performAccessibilityAudit(for: .contrast) }
        catch { XCTFail("Visible next date contrast audit failed: \(error)") }
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
            let selected = app.buttons.matching(NSPredicate(format: "label == %@ AND value == %@", "住まいを切り替える", name)).firstMatch
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
