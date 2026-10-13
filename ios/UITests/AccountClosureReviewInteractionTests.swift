import XCTest

/// Dedicated synthetic preview with actual protected custody; no real Auth/erasure.
@MainActor final class AccountClosureReviewInteractionTests: XCTestCase {
    private let original = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    private func launch(failRepeatedRead: Bool = false) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.ouchi.review.closure")
        let textMode = ProcessInfo.processInfo.environment["OUCHI_UI_TEXT_MODE"] ?? "ax5"
        XCTAssertTrue(["large", "ax5"].contains(textMode), "Only explicitly supported preview text modes may run")
        app.launchArguments = ["--ouchi-closure-review-preview", "-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        if textMode == "ax5" { app.launchArguments.append("--ouchi-large-text-preview") }
        if failRepeatedRead { app.launchArguments.append("--ouchi-closure-failed-reread-preview") }
        app.launch()
        XCTAssertTrue(app.staticTexts["closure-review.sample"].waitForExistence(timeout: 45))
        return app
    }
    private func reach(_ element: XCUIElement, in app: XCUIApplication, searchingUp: Bool = false) {
        for _ in 0..<60 {
            let top = max(app.navigationBars.firstMatch.frame.maxY, app.staticTexts["closure-review.sample"].frame.maxY) + 8
            let bottom = app.keyboards.firstMatch.exists ? app.keyboards.firstMatch.frame.minY - 8 : app.frame.maxY - 16
            if element.exists && element.isHittable && element.frame.minY >= top && element.frame.maxY <= bottom { return }
            let down = element.exists ? element.frame.minY < top : searchingUp
            let height = max(1, bottom - top)
            let startY = top + height * (down ? 0.3 : 0.8)
            let endY = top + height * (down ? 0.8 : 0.3)
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: (startY - app.frame.minY) / app.frame.height))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: (endY - app.frame.minY) / app.frame.height))
            start.press(forDuration: 0.05, thenDragTo: end)
        }
        XCTFail("Could not fully reach control: \(element)")
    }
    private func capture(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    func testFailedRereadClearsVisibleReceiptAndRetainsReference() {
        let app = launch(failRepeatedRead: true)
        let check = app.buttons["closure-review.check." + original]
        reach(check, in: app); check.tap()
        let status = app.staticTexts["closure-review.status"]
        reach(status, in: app)
        XCTAssertEqual(status.label, "退会依頼の受付を確認しました。削除処理はまだ完了していません。")
        capture(app, "review-confirmed-before-failure")
        reach(check, in: app, searchingUp: true); check.tap()
        let message = app.staticTexts["closure-review.message"]
        reach(message, in: app)
        XCTAssertEqual(message.label, "結果を確認できません。依頼番号は保持しています。通信できる状態で同じ依頼を再確認してください。")
        XCTAssertFalse(status.exists, "Prior receipt must disappear after failed reread")
        XCTAssertFalse(app.buttons["closure-review.cancel"].exists, "Cancellation must not use stale displayed receipt")
        capture(app, "review-failed-reread-message")
        let selected = app.staticTexts["closure-review.selected"]
        reach(selected, in: app, searchingUp: true); XCTAssertTrue(selected.label.contains("AAAAAAAA"))
        let count = app.staticTexts["closure-review.reference-count"]
        reach(count, in: app, searchingUp: true); XCTAssertEqual(count.label, "保存された依頼：2件")
        capture(app, "review-failed-reread-retained-reference")
        app.terminate()
    }
    func testKeyboardToolbarWarningDiagnostic() {
        let app = launch()
        let check = app.buttons["closure-review.check." + original]
        reach(check, in: app); check.tap()
        let status = app.staticTexts["closure-review.status"]
        reach(status, in: app); XCTAssertEqual(status.label, "退会依頼の受付を確認しました。削除処理はまだ完了していません。")
        let cancel = app.buttons["closure-review.cancel"]
        reach(cancel, in: app); capture(app, "diagnostic-before-cancel-ax5"); cancel.tap()
        app.buttons["依頼を取り消す"].tap()
        reach(status, in: app); XCTAssertEqual(status.label, "この退会依頼は取り消されています。")
        let password = app.secureTextFields["closure-review.password"]
        reach(password, in: app); capture(app, "diagnostic-password-visible-ax5")
        app.terminate()
    }
    func testProtectedReferenceReadCancelAndExplicitNewSubmission() {
        let app = launch()
        let check = app.buttons["closure-review.check." + original]
        reach(check, in: app); XCTAssertTrue(check.isEnabled); check.tap()
        capture(app, "review-after-select-before-scroll-ax5")
        let status = app.staticTexts["closure-review.status"]
        reach(status, in: app); XCTAssertTrue(status.waitForExistence(timeout: 20))
        XCTAssertEqual(status.label, "退会依頼の受付を確認しました。削除処理はまだ完了していません。")
        capture(app, "review-pending-ax5")
        let cancel = app.buttons["closure-review.cancel"]
        reach(cancel, in: app); cancel.tap()
        let confirm = app.buttons["依頼を取り消す"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 10)); confirm.tap()
        reach(status, in: app); XCTAssertEqual(status.label, "この退会依頼は取り消されています。")
        capture(app, "review-cancelled-ax5")
        let password = app.secureTextFields["closure-review.password"]
        reach(password, in: app); password.tap(); XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        reach(password, in: app); password.typeText("synthetic-preview-only")
        XCTAssertNotEqual(password.value as? String, "現在のパスワード", "Typed password must be retained before leaving the keyboard")
        let done = app.buttons["closure-review.keyboard-done"]
        XCTAssertTrue(done.waitForExistence(timeout: 10)); XCTAssertTrue(done.isHittable); done.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 10))
        let consent = app.switches["closure-review.consent"]
        reach(consent, in: app)
        XCTAssertEqual(consent.value as? String, "0")
        consent.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        XCTAssertEqual(consent.value as? String, "1", "The visible switch thumb must change the confirmation state")
        let submit = app.buttons["closure-review.submit"]
        reach(submit, in: app); capture(app, "review-request-reachable-ax5")
        XCTAssertTrue(submit.isEnabled, "Request must be enabled after retained password and explicit confirmation; inspect request-hint if disabled")
        submit.tap()
        let send = app.buttons["退会を依頼"]
        XCTAssertTrue(send.waitForExistence(timeout: 10)); send.tap()
        reach(status, in: app)
        XCTAssertEqual(status.label, "退会依頼の受付を確認しました。削除処理はまだ完了していません。")
        let selected = app.staticTexts["closure-review.selected"]
        reach(selected, in: app, searchingUp: true); XCTAssertFalse(selected.label.contains("AAAAAAAA"), "Explicit new request must retain a fresh submission")
        let count = app.staticTexts["closure-review.reference-count"]
        reach(count, in: app, searchingUp: true); XCTAssertEqual(count.label, "保存された依頼：3件", "Protected original references are retained alongside the new submission")
        capture(app, "review-new-submission-ax5"); app.terminate()
    }
}
