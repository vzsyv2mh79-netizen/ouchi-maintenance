import XCTest
import UIKit

/// In-memory sample only; never authenticates or purchases.
@MainActor
final class LargeTextInteractionTests: XCTestCase {
    private func launch(tab: Int, releaseLayout: Bool = false, twoHomes: Bool = false, requiresPhoneTabBar: Bool = true) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.ouchi.review.storecaptures")
        app.launchEnvironment["OUCHI_REVIEW_CAPTURE_TAB"] = String(tab)
        if releaseLayout { app.launchEnvironment["OUCHI_REVIEW_AUDIT_RELEASE_LAYOUT"] = "1" }
        if twoHomes { app.launchEnvironment["OUCHI_REVIEW_TWO_HOMES"] = "1" }
        app.launchArguments = ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        if !releaseLayout { XCTAssertTrue(app.staticTexts["ouchi.reviewSample"].waitForExistence(timeout: 45)) }
        if requiresPhoneTabBar {
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 45))
        } else {
            XCTAssertTrue(app.buttons["ホーム"].waitForExistence(timeout: 45), app.debugDescription)
        }
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

    private func visibleKeyboard(in app: XCUIApplication) -> XCUIElement? {
        app.keyboards.allElementsBoundByIndex.first { keyboard in
            guard keyboard.exists && keyboard.isHittable else { return false }
            let visible = keyboard.frame.intersection(app.frame)
            return !visible.isNull && visible.height >= 100
        }
    }

    private func capture(_ app: XCUIApplication, name: String, wholeScreen: Bool = false) {
        let attachment = XCTAttachment(screenshot: wholeScreen ? XCUIScreen.main.screenshot() : app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testIPadRotationKeepsNavigationReachable() throws {
        let app = launch(tab: 0, releaseLayout: true, requiresPhoneTabBar: false)
        defer {
            XCUIDevice.shared.orientation = .portrait
            app.terminate()
        }
        guard min(app.frame.width, app.frame.height) >= 700 else {
            throw XCTSkip("iPad rotation test requires an iPad destination")
        }
        let orientations: [(UIDeviceOrientation, String, Bool)] = [
            (.landscapeLeft, "landscape-left", true),
            (.landscapeRight, "landscape-right", true),
            (.portraitUpsideDown, "portrait-upside-down", false),
            (.portrait, "portrait", false)
        ]
        for (orientation, name, landscape) in orientations {
            XCUIDevice.shared.orientation = orientation
            let rotated = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                landscape ? app.frame.width > app.frame.height : app.frame.height > app.frame.width
            }, object: nil)
            XCTAssertEqual(XCTWaiter.wait(for: [rotated], timeout: 15), .completed,
                           "App viewport must actually rotate, not just the requested device orientation")
            for tab in ["ホーム", "製品", "設定"] {
                let candidates = app.buttons.matching(identifier: tab)
                let reachable = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                    candidates.allElementsBoundByIndex.contains(where: { $0.isHittable })
                }, object: nil)
                let readiness = XCTWaiter.wait(for: [reachable], timeout: 10)
                if readiness != .completed {
                    let tree = XCTAttachment(string: app.debugDescription)
                    tree.name = "ipad-\(name)-\(tab)-unreachable-tree"
                    tree.lifetime = .keepAlways
                    add(tree)
                    capture(app, name: "ipad-\(name)-\(tab)-unreachable", wholeScreen: true)
                }
                XCTAssertEqual(readiness, .completed)
                let button = try XCTUnwrap(candidates.allElementsBoundByIndex.first(where: { $0.isHittable }))
                button.tap()
                XCTAssertTrue(button.isSelected)
                capture(app, name: "ipad-\(name)-\(tab)", wholeScreen: true)
            }
        }
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
        // Match the shipping header; the extra sample banner changes the
        // available keyboard/form viewport and is not part of the release UI.
        let app = launch(tab: 2, releaseLayout: true)
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
        // iOS may expose an offscreen keyboard preview as firstMatch while
        // the real software keyboard is entering. Do not accept mere existence,
        // or weaken the visible-frame assertion: wait for a fresh onscreen,
        // hittable keyboard and then check the field against that exact frame.
        let keyboardReady = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            self.visibleKeyboard(in: app) != nil
        }, object: nil)
        let keyboardReadiness = XCTWaiter.wait(for: [keyboardReady], timeout: 10)
        let keyboard = visibleKeyboard(in: app) ?? app.keyboards.firstMatch
        let keyboardFrame = keyboard.exists ? keyboard.frame : .zero
        let visibleKeyboard = keyboardFrame.intersection(app.frame)
        let keyboardVisible = keyboard.exists && keyboard.isHittable && !visibleKeyboard.isNull && visibleKeyboard.height >= 100
        if !keyboardVisible {
            let diagnostic = XCTAttachment(string: "Keyboard readiness: \(keyboardReadiness)\nApp: \(app.frame)\nKeyboard: \(keyboardFrame)\n\(app.debugDescription)")
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

    // One independent case per viewport/category: an audit timeout must not hide
    // which category ran or prevent later viewports from receiving their own result.
    private func auditInitialTab(_ tab: Int, category: XCUIAccessibilityAuditType, name: String) throws {
        let app = launch(tab: tab, releaseLayout: true)
        defer { app.terminate() }
        capture(app, name: "audit-tab-\(tab)-\(name)-initial")
        try app.performAccessibilityAudit(for: category) { issue in
            NSLog("Accessibility audit tab %d (%@): %@; element=%@", tab, name,
                  issue.detailedDescription, issue.element?.debugDescription ?? "unavailable")
            return false // Report every issue. No handled issues or category suppression.
        }
    }

    func testAuditHomeContrast() throws { try auditInitialTab(0, category: .contrast, name: "contrast") }
    func testAuditHomeDynamicType() throws { try auditInitialTab(0, category: .dynamicType, name: "dynamicType") }
    func testAuditHomeElementDetection() throws { try auditInitialTab(0, category: .elementDetection, name: "elementDetection") }
    func testAuditHomeHitRegion() throws { try auditInitialTab(0, category: .hitRegion, name: "hitRegion") }
    func testAuditHomeDescription() throws { try auditInitialTab(0, category: .sufficientElementDescription, name: "sufficientElementDescription") }
    func testAuditHomeTextClipped() throws { try auditInitialTab(0, category: .textClipped, name: "textClipped") }
    func testAuditHomeTrait() throws { try auditInitialTab(0, category: .trait, name: "trait") }
    func testAuditCareContrast() throws { try auditInitialTab(1, category: .contrast, name: "contrast") }
    func testAuditCareDynamicType() throws { try auditInitialTab(1, category: .dynamicType, name: "dynamicType") }
    func testAuditCareElementDetection() throws { try auditInitialTab(1, category: .elementDetection, name: "elementDetection") }
    func testAuditCareHitRegion() throws { try auditInitialTab(1, category: .hitRegion, name: "hitRegion") }
    func testAuditCareDescription() throws { try auditInitialTab(1, category: .sufficientElementDescription, name: "sufficientElementDescription") }
    func testAuditCareTextClipped() throws { try auditInitialTab(1, category: .textClipped, name: "textClipped") }
    func testAuditCareTrait() throws { try auditInitialTab(1, category: .trait, name: "trait") }
    func testAuditProductsContrast() throws { try auditInitialTab(2, category: .contrast, name: "contrast") }
    func testAuditProductsDynamicType() throws { try auditInitialTab(2, category: .dynamicType, name: "dynamicType") }
    func testAuditProductsElementDetection() throws { try auditInitialTab(2, category: .elementDetection, name: "elementDetection") }
    func testAuditProductsHitRegion() throws { try auditInitialTab(2, category: .hitRegion, name: "hitRegion") }
    func testAuditProductsDescription() throws { try auditInitialTab(2, category: .sufficientElementDescription, name: "sufficientElementDescription") }
    func testAuditProductsTextClipped() throws { try auditInitialTab(2, category: .textClipped, name: "textClipped") }
    func testAuditProductsTrait() throws { try auditInitialTab(2, category: .trait, name: "trait") }
    func testAuditHistoryContrast() throws { try auditInitialTab(3, category: .contrast, name: "contrast") }
    func testAuditHistoryDynamicType() throws { try auditInitialTab(3, category: .dynamicType, name: "dynamicType") }
    func testAuditHistoryElementDetection() throws { try auditInitialTab(3, category: .elementDetection, name: "elementDetection") }
    func testAuditHistoryHitRegion() throws { try auditInitialTab(3, category: .hitRegion, name: "hitRegion") }
    func testAuditHistoryDescription() throws { try auditInitialTab(3, category: .sufficientElementDescription, name: "sufficientElementDescription") }
    func testAuditHistoryTextClipped() throws { try auditInitialTab(3, category: .textClipped, name: "textClipped") }
    func testAuditHistoryTrait() throws { try auditInitialTab(3, category: .trait, name: "trait") }
    func testAuditSettingsContrast() throws { try auditInitialTab(4, category: .contrast, name: "contrast") }
    func testAuditSettingsDynamicType() throws { try auditInitialTab(4, category: .dynamicType, name: "dynamicType") }
    func testAuditSettingsElementDetection() throws { try auditInitialTab(4, category: .elementDetection, name: "elementDetection") }
    func testAuditSettingsHitRegion() throws { try auditInitialTab(4, category: .hitRegion, name: "hitRegion") }
    func testAuditSettingsDescription() throws { try auditInitialTab(4, category: .sufficientElementDescription, name: "sufficientElementDescription") }
    func testAuditSettingsTextClipped() throws { try auditInitialTab(4, category: .textClipped, name: "textClipped") }
    func testAuditSettingsTrait() throws { try auditInitialTab(4, category: .trait, name: "trait") }

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
        let visibleTitle = app.navigationBars.staticTexts["おうちメンテ"].firstMatch
        XCTAssertTrue(visibleTitle.waitForExistence(timeout: 10))
        XCTAssertTrue(visibleTitle.isHittable, "The root title must be rendered, not only the navigation bar's label")
        XCTAssertGreaterThan(visibleTitle.frame.width, 0)
        XCTAssertGreaterThan(visibleTitle.frame.height, 0)
        XCTAssertTrue(app.navigationBars.firstMatch.frame.contains(visibleTitle.frame), "The complete title stays inside the navigation bar")
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
        let title = app.navigationBars["家族と共有"].staticTexts["家族と共有"]
        XCTAssertTrue(title.waitForExistence(timeout: 10))
        XCTAssertTrue(title.isHittable)
        capture(app, name: "family-navigation-title-visible")
        let member = app.staticTexts["家族のサンプル"]
        // Form rows below the viewport may not exist in the accessibility
        // tree until scrolled into view. Require the complete visible row.
        reach(member, in: app)
        XCTAssertTrue(member.exists)
        capture(app, name: "family-sample-member-fully-visible")
        let removal = app.buttons["家族のサンプルの共有を解除"]
        reach(removal, in: app)
        XCTAssertTrue(removal.isHittable)
        capture(app, name: "family-scoped-removal-control-fully-visible")
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
    private func retainTaskAuditIssue(_ issue: XCUIAccessibilityAuditIssue,
                                      in app: XCUIApplication) -> Bool {
        let element = issue.element
        let elementDescription = element?.debugDescription ?? "unavailable"
        let details = "Description: \(issue.detailedDescription)\n" +
            "Element: \(elementDescription)\n" +
            "Frame: \(String(describing: element?.frame))\n" +
            "Navigation: \(app.navigationBars.firstMatch.frame)\n" +
            "Tabs: \(app.tabBars.firstMatch.frame)\n" +
            "App: \(app.frame)\nTree: \(app.debugDescription)"
        let attachment = XCTAttachment(string: details)
        attachment.name = "task-audit-issue-geometry"
        attachment.lifetime = .keepAlways
        add(attachment)
        NSLog("Task audit geometry: %@", details)
        return false // Always report the finding; never suppress an issue.
    }

    func testCareTitleOpensEditorAndReturns() {
        let app = launch(tab: 1, releaseLayout: true)
        let title = app.buttons["フィルター確認（サンプル）"]
        reach(title, in: app)
        title.tap()
        XCTAssertTrue(app.navigationBars["お手入れを編集"].waitForExistence(timeout: 10))
        let name = app.textFields["お手入れ名"]
        XCTAssertTrue(name.exists)
        XCTAssertEqual(name.value as? String, "フィルター確認（サンプル）")
        capture(app, name: "care-title-opens-editor")
        let back = app.navigationBars.buttons.element(boundBy: 0)
        XCTAssertTrue(back.isHittable)
        back.tap()
        XCTAssertTrue(app.navigationBars["お手入れ"].waitForExistence(timeout: 10))
        reach(title, in: app)
        XCTAssertEqual(title.label, "フィルター確認（サンプル）")
        capture(app, name: "care-title-returned-to-same-task")
        app.terminate()
    }

    func testVisibleTaskProductClipping() {
        let app = launch(tab: 1, releaseLayout: true)
        let product = app.staticTexts["空気清浄機（サンプル）"]
        reach(product, in: app)
        capture(app, name: "task-product-fully-visible")
        do { try app.performAccessibilityAudit(for: .textClipped) { issue in
            self.retainTaskAuditIssue(issue, in: app)
        } }
        catch { XCTFail("Visible task product clipping audit failed: \(error)") }
        app.terminate()
    }

    func testVisibleNextDateContrast() {
        let app = launch(tab: 1, releaseLayout: true)
        let due = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "次回 ")).firstMatch
        reach(due, in: app)
        capture(app, name: "task-next-date-fully-visible")
        do { try app.performAccessibilityAudit(for: .contrast) { issue in
            self.retainTaskAuditIssue(issue, in: app)
        } }
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
