import XCTest

/// For an isolated real-Auth fixture runner only. Not part of a release target.
/// The runner must supply an unmapped session, force one POST acknowledgement
/// loss after COMMIT, and independently assert exactly one consent in the DB.
@MainActor
final class ExplicitEnrollmentInteractionTests: XCTestCase {
    /// Runs before any Auth fixture exists; warms Apple's automation stack only.
    func testPreparationCanReadLoginScreen() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.ouchi.review.enrollment")
        app.launchEnvironment["OUCHI_ISOLATED_DEVELOPMENT"] = "true"
        app.launchEnvironment["OUCHI_ISOLATED_PUBLISHABLE_KEY"] = "sb_publishable_synthetic_review_only"
        app.launchArguments = ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        waitForUsableLogin(in: app)
        XCTAssertTrue(app.secureTextFields["signin.password"].exists)
        XCTAssertTrue(app.buttons["signin.submit"].exists)
        app.terminate()
    }

    func testLostAcknowledgementUsesReadOnlyConfirmation() throws {
        continueAfterFailure = false
        let env = ProcessInfo.processInfo.environment
        guard env["OUCHI_ENROLLMENT_REAL_FIXTURE"] == "1",
              let email = env["OUCHI_ENROLLMENT_TEST_EMAIL"], email.hasSuffix("@fixture.invalid"),
              let password = env["OUCHI_ENROLLMENT_TEST_PASSWORD"], password.count >= 16 else {
            throw XCTSkip("Requires isolated real-Auth fixture credentials and acknowledgement-loss runner")
        }
        let app = XCUIApplication(bundleIdentifier: "dev.ouchi.review.enrollment")
        app.launchEnvironment["OUCHI_ISOLATED_DEVELOPMENT"] = "true"
        app.launchEnvironment["OUCHI_ISOLATED_PUBLISHABLE_KEY"] = "sb_publishable_synthetic_review_only"
        app.launchArguments = ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let emailField = app.textFields["signin.email"]
        waitForUsableLogin(in: app)
        emailField.tap(); emailField.typeText(email)
        let loginPassword = app.secureTextFields["signin.password"]
        loginPassword.tap(); loginPassword.typeText(password)
        if app.buttons["signin.dismiss-keyboard"].exists { app.buttons["signin.dismiss-keyboard"].tap() }
        XCTAssertEqual(emailField.value as? String, email, "Synthetic email must be entered intact")
        app.buttons["signin.submit"].tap()
        let denied = app.alerts["おうちメンテ"]
        XCTAssertTrue(denied.waitForExistence(timeout: 30))
        XCTAssertTrue(denied.staticTexts["このアカウントで記録を利用できません。ログイン状態を確認してください。"].exists)
        denied.buttons["閉じる"].tap()
        let settings = app.tabBars.buttons["設定"]
        XCTAssertTrue(settings.waitForExistence(timeout: 30)); settings.tap()
        let entry = app.buttons["enrollment.entry"]
        reach(entry, in: app); entry.tap()
        let refresh = app.buttons["enrollment.refresh"]
        XCTAssertTrue(refresh.waitForExistence(timeout: 10)); refresh.tap()
        let submit = app.buttons["enrollment.submit"]
        XCTAssertTrue(submit.waitForExistence(timeout: 20))
        XCTAssertFalse(submit.isEnabled, "Consent and password must both be explicit")
        let field = app.secureTextFields["enrollment.password"]
        field.tap(); field.typeText(password)
        let dismiss = app.buttons["enrollment.dismiss-keyboard"]
        XCTAssertTrue(dismiss.waitForExistence(timeout: 5)); dismiss.tap()
        XCTAssertFalse(submit.isEnabled, "A password alone is not consent")
        let consent = app.switches["enrollment.consent"]
        reach(consent, in: app)
        // SwiftUI exposes the whole multiline label row as the switch element.
        // Tap the visible trailing switch, not the noninteractive label center.
        consent.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        let consentSelected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "1"), object: consent)
        XCTAssertEqual(XCTWaiter.wait(for: [consentSelected], timeout: 3), .completed, "Consent must be explicitly selected")
        reach(submit, in: app); XCTAssertTrue(submit.isEnabled); submit.tap()
        // Failed acknowledgement must clear the form and any success claim.
        let uncertain = app.alerts["おうちメンテ"]
        XCTAssertTrue(uncertain.waitForExistence(timeout: 30))
        XCTAssertTrue(uncertain.staticTexts["登録結果を確認できません。パスワードと通信状態を確認し、まず登録状態を読み直してください。退会処理中は登録できません。"].exists)
        uncertain.buttons["閉じる"].tap()
        XCTAssertTrue(refresh.waitForExistence(timeout: 20))
        let ready = NSPredicate(format: "enabled == true")
        expectation(for: ready, evaluatedWith: refresh)
        waitForExpectations(timeout: 30)
        XCTAssertFalse(app.staticTexts["enrollment.confirmed"].exists)
        XCTAssertFalse(app.buttons["enrollment.submit"].exists)
        // Restart after the server committed but the acknowledgement was lost.
        // Registration must be recovered by status GET, not another consent POST.
        app.terminate()
        app.launch()
        XCTAssertTrue(settings.waitForExistence(timeout: 30), "Original login must survive restart")
        let restoredWarning = app.alerts["おうちメンテ"]
        if restoredWarning.waitForExistence(timeout: 5) {
            let recordDenied = restoredWarning.staticTexts["このアカウントで記録を利用できません。ログイン状態を確認してください。"].exists
            let notificationsUnavailable = restoredWarning.staticTexts["端末の通知を確認できませんでした。ログインは続けられます。通知の設定は後で確認してください。"].exists
            XCTAssertTrue(recordDenied || notificationsUnavailable, "Unexpected restart warning must not be dismissed")
            restoredWarning.buttons["閉じる"].tap()
        }
        settings.tap()
        reach(entry, in: app); entry.tap()
        XCTAssertTrue(refresh.waitForExistence(timeout: 10))
        XCTAssertFalse(app.secureTextFields["enrollment.password"].exists, "Restart must not restore a password form")
        XCTAssertFalse(app.buttons["enrollment.submit"].exists, "Restart must require status read before any new registration")
        refresh.tap()
        XCTAssertTrue(app.staticTexts["enrollment.confirmed"].waitForExistence(timeout: 20))
        XCTAssertFalse(app.secureTextFields["enrollment.password"].exists)
        XCTAssertFalse(app.buttons["enrollment.submit"].exists)
        if env["OUCHI_ENROLLMENT_VERIFY_RECORDS"] == "1" {
            let reload = app.buttons["enrollment.reload-records"]
            XCTAssertTrue(reload.waitForExistence(timeout: 10)); reload.tap()
            let products = app.tabBars.buttons["製品"]
            XCTAssertTrue(products.waitForExistence(timeout: 10)); products.tap()
            XCTAssertTrue(app.staticTexts["Synthetic existing appliance"].waitForExistence(timeout: 20), "Existing appliance must load through the actual data API after recovery")
        }
        // The runner checks DB consent count and family records after this.
    }

    private func waitForUsableLogin(in app: XCUIApplication) {
        let email = app.textFields["signin.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 30))
        // Startup may report unavailable notification services on a simulator.
        // Dismiss only this known warning; all unexpected errors remain visible.
        let warning = app.alerts["おうちメンテ"]
        let notice = "端末の通知を確認できませんでした。ログインは続けられます。通知の設定は後で確認してください。"
        let ready = NSPredicate { _, _ in
            if warning.exists {
                return warning.staticTexts[notice].exists
            }
            return email.isEnabled && email.isHittable
        }
        let result = XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: ready, object: nil)], timeout: 30)
        if result != .completed {
            // Capture before continueAfterFailure stops the case. Fixture accounts only.
            let diagnostic = XCTAttachment(string: app.debugDescription)
            diagnostic.name = "Isolated startup accessibility state"
            diagnostic.lifetime = .keepAlways
            add(diagnostic)
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "Isolated startup screen"
            screenshot.lifetime = .keepAlways
            add(screenshot)
        }
        XCTAssertEqual(result, .completed)
        if warning.exists {
            XCTAssertTrue(warning.staticTexts[notice].exists)
            warning.buttons["閉じる"].tap()
        }
        XCTAssertTrue(email.isEnabled && email.isHittable, "Login must be usable, not merely rendered")
        XCTAssertTrue(app.secureTextFields["signin.password"].isEnabled)
        XCTAssertFalse(app.buttons["signin.submit"].isEnabled, "Empty credentials must not be submitted")
    }

    private func reach(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<20 {
            if element.exists && element.isHittable { return }
            app.swipeUp()
        }
        XCTFail("Registration control is unreachable")
    }
}
