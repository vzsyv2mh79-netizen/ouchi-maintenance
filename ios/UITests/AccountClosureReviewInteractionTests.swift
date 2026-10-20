import XCTest

/// Dedicated synthetic preview with actual protected custody; no real Auth/erasure.
@MainActor final class AccountClosureReviewInteractionTests: XCTestCase {
    func testManagementUnknownCommitRestartsWithSameProtectedReference() {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.ouchi.review.closure")
        app.launchArguments = ["--ouchi-management-preview", "--ouchi-management-lost-ack-preview", "-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        if ProcessInfo.processInfo.environment["OUCHI_UI_TEXT_MODE"] == "ax5" { app.launchArguments.append("--ouchi-large-text-preview") }
        func launchManagement() {
            app.launch()
            XCTAssertTrue(app.staticTexts["home-management.sample"].waitForExistence(timeout: 45))
        }
        func reachManagement(_ element: XCUIElement, searchingUp: Bool = false) {
            for _ in 0..<40 {
                let top = max(app.navigationBars.firstMatch.frame.maxY, app.staticTexts["home-management.sample"].frame.maxY) + 8
                let bottom = app.frame.maxY - 20
                // Controls must fit fully. A long paragraph may legitimately
                // scroll across screens at AX5; require its beginning visible.
                if element.exists {
                    let control = element.elementType == .button
                    let fits = control ? (element.isHittable && element.frame.maxY <= bottom) : element.frame.minY < bottom
                    if element.frame.minY >= top && fits { return }
                }
                let down = element.exists ? element.frame.minY < top : searchingUp
                let height = max(1, bottom - top)
                let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: (top + height * (down ? 0.3 : 0.8)) / app.frame.height))
                let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: (top + height * (down ? 0.8 : 0.3)) / app.frame.height))
                start.press(forDuration: 0.05, thenDragTo: end)
            }
            XCTFail("Management control not fully reachable")
        }
        launchManagement()
        let claim = app.buttons["home-management.claim"]
        reachManagement(claim); capture(app, "management-before-explicit-claim"); claim.tap()
        // iOS 27 exposes the same system confirmation button as a wrapper plus
        // nested button. Both represent one action; scope to the sheet wrapper.
        let confirm = app.sheets.buttons.matching(identifier: "home-management.confirm").firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 10)); confirm.tap()
        let message = app.staticTexts["home-management.message"]
        reachManagement(message); XCTAssertTrue(message.waitForExistence(timeout: 20))
        XCTAssertTrue(message.label.contains("結果を確認できませんでした"))
        capture(app, "management-unknown-commit")
        let reference = app.staticTexts["home-management.request-id"]
        reachManagement(reference, searchingUp: true); let saved = reference.label
        XCTAssertNotNil(UUID(uuidString: saved))
        XCTAssertFalse(app.buttons["home-management.remove-reference"].exists, "Unknown references must not be dismissed as confirmed")
        app.terminate(); launchManagement()
        let result = app.staticTexts["home-management.claimed"]
        reachManagement(result); XCTAssertTrue(result.waitForExistence(timeout: 20))
        capture(app, "management-recovered-after-process-restart")
        reachManagement(reference); XCTAssertEqual(reference.label, saved)
        let remove = app.buttons["home-management.remove-reference"]
        reachManagement(remove); remove.tap()
        XCTAssertTrue(confirm.waitForExistence(timeout: 10)); confirm.tap()
        let cleaned = app.staticTexts["home-management.reference-cleaned"]
        reachManagement(cleaned); XCTAssertTrue(cleaned.waitForExistence(timeout: 20), "Wait for durable local deletion acknowledgement before terminating the app")
        app.terminate(); launchManagement()
        XCTAssertTrue(app.buttons["home-management.check"].waitForExistence(timeout: 20))
        let managed = app.staticTexts["この住まいには管理者がいます。"]
        reachManagement(managed, searchingUp: true); XCTAssertTrue(managed.waitForExistence(timeout: 20))
        XCTAssertFalse(reference.exists, "Explicit cleanup removes only the local confirmed reference")
        XCTAssertFalse(claim.exists, "The simulated backend owner remains managed after local reference cleanup")
        capture(app, "management-after-local-reference-cleanup")
        app.terminate()
    }
    func testProtectedCustodySurvivesLostReplyAndRestartWithoutRotation() {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.ouchi.review.closure")
        app.launchArguments = ["--ouchi-closure-custody-preview", "--ouchi-custody-lost-ack-preview", "-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        if ProcessInfo.processInfo.environment["OUCHI_UI_TEXT_MODE"] == "ax5" { app.launchArguments.append("--ouchi-large-text-preview") }
        func launchCustody() { app.launch(); XCTAssertTrue(app.staticTexts["closure-custody.sample"].waitForExistence(timeout: 45)) }
        func reachCustody(_ element: XCUIElement, up: Bool = false, paragraph: Bool = false) {
            for _ in 0..<50 {
                let top = max(app.navigationBars.firstMatch.frame.maxY, app.staticTexts["closure-custody.sample"].frame.maxY) + 8
                let bottom = app.frame.maxY - 16
                if element.exists && element.isHittable && element.frame.minY >= top && (element.frame.maxY <= bottom || (paragraph && element.elementType == .staticText && element.frame.minY + 100 < bottom)) { return }
                let down = element.exists ? element.frame.minY < top : up
                let height = max(1, bottom - top)
                let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: (top + height * (down ? 0.3 : 0.8)) / app.frame.height))
                let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: (top + height * (down ? 0.8 : 0.3)) / app.frame.height))
                start.press(forDuration: 0.05, thenDragTo: end)
            }
            XCTFail("Custody control/paragraph beginning is not reachable")
        }
        launchCustody()
        let prepare = app.buttons["closure-custody.prepare"]
        reachCustody(prepare); XCTAssertTrue(prepare.isEnabled); prepare.tap()
        let message = app.staticTexts["closure-custody.message"]
        reachCustody(message, paragraph: true); XCTAssertTrue(message.label.contains("結果を確認できません"))
        XCTAssertFalse(app.staticTexts["closure-custody.confirmed"].exists)
        let saved = app.staticTexts["closure-custody.saved"]
        reachCustody(saved, up: true); XCTAssertEqual(saved.label, "処理番号：DDDDDDDD")
        capture(app, "ouchi-custody-lost-ack-key-retained")
        app.terminate()
        app.launchArguments += ["--ouchi-require-existing-custody-preview", "--ouchi-custody-unavailable-reread-preview"]
        launchCustody()
        reachCustody(saved); XCTAssertEqual(saved.label, "処理番号：DDDDDDDD")
        let check = app.buttons["closure-custody.check"]
        reachCustody(check); XCTAssertTrue(check.isEnabled); check.tap()
        let confirmed = app.staticTexts["closure-custody.confirmed"]
        reachCustody(confirmed, paragraph: true); XCTAssertTrue(confirmed.label.contains("登録されていることを確認"))
        let status = app.staticTexts["closure-custody.status"]
        reachCustody(status, paragraph: true); XCTAssertTrue(status.label.contains("削除処理を進めています"))
        capture(app, "ouchi-custody-recovered-after-process-restart")
        reachCustody(check, up: true); check.tap()
        reachCustody(message, paragraph: true); XCTAssertTrue(message.label.contains("最新の状況を確認できません"))
        XCTAssertFalse(confirmed.exists); XCTAssertFalse(status.exists)
        capture(app, "ouchi-custody-unavailable-clears-status")
        reachCustody(saved, up: true); XCTAssertEqual(saved.label, "処理番号：DDDDDDDD")
        app.terminate()
    }
    func testScopedLocalCleanupErasesOwnedFilesAndAuthButKeepsCapabilityAfterRestart() {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.ouchi.review.closure")
        app.launchArguments = ["--ouchi-closure-custody-preview", "--ouchi-custody-cleanup-preview", "-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        if ProcessInfo.processInfo.environment["OUCHI_UI_TEXT_MODE"] == "ax5" { app.launchArguments.append("--ouchi-large-text-preview") }
        func launchCleanup() { app.launch(); XCTAssertTrue(app.staticTexts["closure-custody.sample"].waitForExistence(timeout: 45)) }
        func reachCleanup(_ element: XCUIElement, up: Bool = false, paragraph: Bool = false) {
            for _ in 0..<50 {
                let top = max(app.navigationBars.firstMatch.frame.maxY, app.staticTexts["closure-custody.sample"].frame.maxY) + 8
                let bottom = app.frame.maxY - 16
                if element.exists && element.isHittable && element.frame.minY >= top && (element.frame.maxY <= bottom || (paragraph && element.elementType == .staticText && element.frame.minY + 100 < bottom)) { return }
                let down = element.exists ? element.frame.minY < top : up
                let height = max(1, bottom - top)
                let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: (top + height * (down ? 0.3 : 0.8)) / app.frame.height))
                let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: (top + height * (down ? 0.8 : 0.3)) / app.frame.height))
                start.press(forDuration: 0.05, thenDragTo: end)
            }
            XCTFail("Cleanup control/paragraph is not reachable")
        }
        launchCleanup()
        let verified = app.staticTexts["closure-custody.local-cleanup-verified"]
        XCTAssertFalse(verified.exists)
        let prepare = app.buttons["closure-custody.prepare"]
        XCTAssertFalse(app.buttons["closure-custody.forget-expired"].exists, "An unexpired capability cannot be forgotten through the expired-only action")
        reachCleanup(prepare); prepare.tap()
        let check = app.buttons["closure-custody.check"]
        reachCleanup(check); XCTAssertTrue(check.isEnabled); check.tap()
        let status = app.staticTexts["closure-custody.status"]
        reachCleanup(status, paragraph: true); XCTAssertTrue(status.label.contains("サーバー側の退会処理の完了"))
        XCTAssertTrue(app.staticTexts["closure-custody.last-confirmed"].exists)
        let cleanup = app.buttons["closure-custody.cleanup"]
        reachCleanup(cleanup); XCTAssertTrue(cleanup.isEnabled); capture(app, "local-cleanup-before-explicit-confirmation"); cleanup.tap()
        let confirm = app.alerts.buttons.matching(identifier: "端末内の情報を整理").firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 10)); confirm.tap()
        let cleanupVerified = verified.waitForExistence(timeout: 30)
        if !cleanupVerified { capture(app, "local-cleanup-unconfirmed-diagnostic"); print(app.debugDescription) }
        XCTAssertTrue(cleanupVerified, "Real scoped Auth/files/marker must be absent, foreign export and protected capability retained")
        XCTAssertFalse(prepare.exists, "Local Auth is erased; a new capability must not be prepared implicitly")
        capture(app, "local-cleanup-owned-files-and-auth-erased-capability-kept")
        reachCleanup(check, up: true); check.tap()
        reachCleanup(status, paragraph: true); XCTAssertTrue(status.label.contains("サーバー側の退会処理の完了"))
        app.terminate(); app.launchArguments.append("--ouchi-require-existing-custody-preview"); launchCleanup()
        XCTAssertTrue(verified.waitForExistence(timeout: 30), "Restart must not reseed erased Auth/files, or lose original protected capability")
        XCTAssertFalse(prepare.exists)
        reachCleanup(check); check.tap(); reachCleanup(status, paragraph: true)
        XCTAssertTrue(status.label.contains("サーバー側の退会処理の完了"))
        capture(app, "local-cleanup-restart-capability-only-status")
        app.terminate()
        let originalArguments = app.launchArguments
        app.launchArguments = ["--ouchi-closure-custody-preview", "--ouchi-custody-expired-preview", "-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        if ProcessInfo.processInfo.environment["OUCHI_UI_TEXT_MODE"] == "ax5" { app.launchArguments.append("--ouchi-large-text-preview") }
        launchCleanup()
        let forget = app.buttons["closure-custody.forget-expired"]
        reachCleanup(forget); XCTAssertTrue(forget.isEnabled)
        XCTAssertFalse(prepare.exists)
        XCTAssertFalse(check.isEnabled, "Expired custody cannot read or renew status")
        XCTAssertFalse(app.staticTexts["closure-custody.last-confirmed"].exists)
        forget.tap()
        let forgetConfirm = app.alerts.buttons.matching(identifier: "期限切れの確認情報を消去").firstMatch
        XCTAssertTrue(forgetConfirm.waitForExistence(timeout: 10))
        let back = app.alerts.buttons.matching(identifier: "戻る").firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 10)); back.tap()
        app.terminate(); launchCleanup()
        reachCleanup(forget); XCTAssertTrue(forget.exists, "Cancelling must retain the original expired key")
        forget.tap(); XCTAssertTrue(forgetConfirm.waitForExistence(timeout: 10)); forgetConfirm.tap()
        let outcome = app.staticTexts["closure-custody.message"]
        reachCleanup(outcome, paragraph: true); XCTAssertTrue(outcome.label.contains("期限切れの確認情報をこの端末から消去しました"))
        XCTAssertFalse(forget.exists); XCTAssertFalse(prepare.exists); XCTAssertFalse(status.exists)
        capture(app, "expired-custody-explicit-local-forget")
        app.terminate(); app.launchArguments = originalArguments; launchCleanup()
        // require-existing preview checks exactly one original protected key
        // against the durable server hash: expired key gone, live key untouched.
        XCTAssertTrue(verified.waitForExistence(timeout: 30))
        reachCleanup(check); check.tap(); reachCleanup(status, paragraph: true)
        XCTAssertTrue(status.label.contains("サーバー側の退会処理の完了"))
        capture(app, "expired-custody-removed-original-live-key-retained-after-restart")
        app.terminate()
    }
    func testRealRootRetiredOwnerCleanupLoginRecoveryAndFamilyAccountFiltering() {
        runRealRootFlow(interruptAfterAuth: false)
    }
    func testRealRootRecoversAfterProcessTerminationBetweenAuthErasureAndMarkerFinalization() {
        runRealRootFlow(interruptAfterAuth: true)
    }
    private func runRealRootFlow(interruptAfterAuth: Bool) {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.ouchi.review.closure")
        app.launchArguments = ["--ouchi-closure-root-preview", "-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        if interruptAfterAuth { app.launchArguments.append("--ouchi-root-interrupt-after-auth") }
        if ProcessInfo.processInfo.environment["OUCHI_UI_TEXT_MODE"] == "ax5" { app.launchArguments.append("--ouchi-large-text-preview") }
        func launchRoot() { app.launch(); XCTAssertTrue(app.staticTexts["closure-root.sample"].waitForExistence(timeout: 45)) }
        func reachRoot(_ element: XCUIElement, up: Bool = false, paragraph: Bool = false) {
            for _ in 0..<80 {
                // During root replacement XCTest may report an infinite frame
                // for a navigation bar that has just disappeared. Never turn
                // that transient snapshot into an invalid drag coordinate.
                let bounds = app.frame
                guard bounds.height.isFinite, bounds.height > 0 else { continue }
                let navigationBottom = app.navigationBars.firstMatch.exists ? app.navigationBars.firstMatch.frame.maxY : bounds.minY
                let sampleBottom = app.staticTexts["closure-root.sample"].frame.maxY
                let top = max(navigationBottom.isFinite ? navigationBottom : bounds.minY, sampleBottom.isFinite ? sampleBottom : bounds.minY) + 8
                let tabTop = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : bounds.maxY
                let contentBottom = min(bounds.maxY - 16, tabTop.isFinite ? tabTop - 12 : bounds.maxY - 16)
                let keyboardTop = app.keyboards.firstMatch.exists ? app.keyboards.firstMatch.frame.minY : bounds.maxY
                let bottom = min(contentBottom, keyboardTop.isFinite ? keyboardTop - 8 : contentBottom)
                guard top.isFinite, bottom.isFinite, bottom > top else { continue }
                if element.exists && element.isHittable && element.frame.minY >= top && (element.frame.maxY <= bottom || (paragraph && element.elementType == .staticText && element.frame.minY + 100 < bottom)) { return }
                let down = element.exists ? element.frame.minY < top : up
                let height = max(1, bottom - top)
                let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: (top + height * (down ? 0.3 : 0.8)) / bounds.height))
                let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: (top + height * (down ? 0.8 : 0.3)) / bounds.height))
                start.press(forDuration: 0.05, thenDragTo: end)
            }
            capture(app, "root-control-not-reachable"); print(app.debugDescription)
            XCTFail("Normal root control/paragraph is not reachable")
        }
        func waitEnabled(_ button: XCUIElement) {
            let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: button)
            XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
            XCTAssertTrue(button.isEnabled)
        }
        func signIn(_ email: String) {
            let address = app.textFields["signin.email"]
            reachRoot(address); XCTAssertTrue(address.exists); address.tap(); address.typeText(email + "\n")
            // Next focuses the password row. Close the keyboard using the real
            // toolbar before searching a potentially virtualized Form row;
            // dragging across the keyboard cannot scroll that Form.
            let finishEmail = app.buttons["signin.dismiss-keyboard"]
            if app.keyboards.firstMatch.exists && finishEmail.exists { finishEmail.tap() }
            let password = app.secureTextFields["signin.password"]
            reachRoot(password); password.tap(); password.typeText("Sample-only-123\n")
            let dismiss = app.buttons["signin.dismiss-keyboard"]
            if app.keyboards.firstMatch.exists && dismiss.exists { dismiss.tap() }
            let submit = app.buttons["signin.submit"]
            reachRoot(submit)
            waitEnabled(submit); submit.tap()
            XCTAssertTrue(app.tabBars.buttons["設定"].waitForExistence(timeout: 30))
        }
        func settingsReferences() {
            app.tabBars.buttons["設定"].tap()
            let entry = app.buttons["closure-custody.saved-entry"]
            reachRoot(entry); waitEnabled(entry); entry.tap()
        }
        let owner = app.buttons["closure-reference-dddddddd-dddd-4ddd-8ddd-dddddddddddd"]
        let family = app.buttons["closure-reference-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]
        let check = app.buttons["closure-custody.check"]
        let status = app.staticTexts["closure-custody.status"]
        launchRoot()
        signIn("review-owner@example.invalid")
        // Exact retired-enrollment rejection must not hide saved progress.
        let retiredNotice = app.alerts.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "このアカウントで記録を利用できません")).firstMatch
        let retiredNoticeVisible = retiredNotice.waitForExistence(timeout: 20)
        if !retiredNoticeVisible { capture(app, "root-retired-notice-unconfirmed"); print(app.debugDescription) }
        XCTAssertTrue(retiredNoticeVisible)
        app.alerts.buttons["閉じる"].firstMatch.tap()
        settingsReferences(); reachRoot(owner)
        XCTAssertFalse(family.exists, "Signed-in owner cannot enumerate a different account's protected references")
        owner.tap(); reachRoot(check); check.tap(); reachRoot(status, paragraph: true)
        XCTAssertTrue(status.label.contains("サーバー側の退会処理の完了"))
        let cleanup = app.buttons["closure-custody.cleanup"]
        reachRoot(cleanup); capture(app, "root-owner-retired-enrollment-local-cleanup"); cleanup.tap()
        let confirm = app.alerts.buttons.matching(identifier: "端末内の情報を整理").firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 10)); confirm.tap()
        if interruptAfterAuth {
            let pause = app.staticTexts["closure-root.auth-erased-pause"]
            XCTAssertTrue(pause.waitForExistence(timeout: 30), "Must pause after actual durable Auth erase and before pending marker finalization")
            capture(app, "root-interruption-after-real-auth-erasure-before-marker-finalization")
            app.terminate(); launchRoot()
            XCTAssertTrue(app.staticTexts["closure-root.interruption-restored"].waitForExistence(timeout: 30), "Restart must independently verify absent Auth, matching real marker, original protected key hashes and removed owned pending files")
            XCTAssertFalse(app.tabBars.firstMatch.exists)
            let recoveryEntry = app.buttons["closure-custody.saved-entry"]
            reachRoot(recoveryEntry); waitEnabled(recoveryEntry); recoveryEntry.tap()
            reachRoot(owner); owner.tap(); reachRoot(check); check.tap(); reachRoot(status, paragraph: true)
            XCTAssertTrue(status.label.contains("サーバー側の退会処理の完了"))
            XCTAssertFalse(app.buttons["closure-custody.prepare"].exists, "Recovery must never require sign-in, registration or a replacement read key")
            reachRoot(cleanup); capture(app, "root-interrupted-cleanup-resumes-with-original-key-no-auth"); cleanup.tap()
            XCTAssertTrue(confirm.waitForExistence(timeout: 10)); confirm.tap()
        }
        let cleaned = app.alerts.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "この端末内の整理が完了" )).firstMatch
        let complete = cleaned.waitForExistence(timeout: 30)
        if !complete { capture(app, "root-cleanup-unconfirmed"); print(app.debugDescription) }
        XCTAssertTrue(complete)
        app.alerts.buttons["閉じる"].firstMatch.tap()
        if interruptAfterAuth {
            // This retry began while already logged out, so retain the current
            // detail until the user explicitly navigates back to sign-in.
            app.navigationBars.buttons.firstMatch.tap()
            app.navigationBars.buttons.firstMatch.tap()
        }
        reachRoot(app.textFields["signin.email"], up: true); XCTAssertTrue(app.textFields["signin.email"].exists)
        let loggedOutEntry = app.buttons["closure-custody.saved-entry"]
        reachRoot(loggedOutEntry); waitEnabled(loggedOutEntry); loggedOutEntry.tap()
        reachRoot(family); XCTAssertTrue(family.exists)
        reachRoot(owner); owner.tap(); reachRoot(check); check.tap(); reachRoot(status, paragraph: true)
        XCTAssertTrue(status.label.contains("サーバー側の退会処理の完了"))
        XCTAssertFalse(app.buttons["closure-custody.prepare"].exists)
        capture(app, "root-logged-out-original-capability-status")
        app.terminate(); launchRoot()
        // Restart must use actual erased Auth storage and original capability
        // hashes. Factory refuses missing/rotated keys or implicit reseeding.
        signIn("review-family@example.invalid")
        settingsReferences(); reachRoot(family)
        XCTAssertFalse(owner.exists, "Family settings must clear the retired owner's previous result and reference")
        family.tap(); reachRoot(check); check.tap(); reachRoot(status, paragraph: true)
        XCTAssertTrue(status.label.contains("削除処理を進めています"))
        XCTAssertFalse(app.buttons["closure-custody.cleanup"].exists)
        capture(app, "root-family-scoped-reference-running-result")
        app.navigationBars.buttons.firstMatch.tap()
        app.navigationBars.buttons.firstMatch.tap()
        let logout = app.buttons["settings.logout"]
        reachRoot(logout); logout.tap()
        let logoutConfirm = app.sheets.buttons.matching(identifier: "ログアウト").firstMatch
        XCTAssertTrue(logoutConfirm.waitForExistence(timeout: 10)); logoutConfirm.tap()
        reachRoot(app.textFields["signin.email"]); XCTAssertTrue(app.textFields["signin.email"].exists)
        let finalVerified = app.staticTexts["closure-root.verified"].waitForExistence(timeout: 30)
        if !finalVerified { capture(app, "root-final-proof-unconfirmed"); print(app.debugDescription) }
        XCTAssertTrue(finalVerified, "Actual Auth/files/capability checks and durable synthetic local-only logout journal must all pass")
        reachRoot(loggedOutEntry); waitEnabled(loggedOutEntry); loggedOutEntry.tap(); reachRoot(owner); owner.tap()
        reachRoot(check); check.tap(); reachRoot(status, paragraph: true)
        XCTAssertTrue(status.label.contains("サーバー側の退会処理の完了"))
        capture(app, "root-family-local-logout-keeps-original-owner-read-key")
        app.terminate()
    }
    func testRetainedFamilyFilesReachableWithoutDeletionControls() {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.ouchi.review.closure")
        app.launchArguments = ["--ouchi-retained-files-preview", "-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        if ProcessInfo.processInfo.environment["OUCHI_UI_TEXT_MODE"] == "ax5" { app.launchArguments.append("--ouchi-large-text-preview") }
        app.launch()
        XCTAssertTrue(app.staticTexts["retained-files.sample"].waitForExistence(timeout: 45))
        let reload = app.buttons["retained-files.reload"]
        reach(reload, in: app); XCTAssertTrue(reload.isEnabled); reload.tap()
        let pdf = app.buttons["retained-files.download.11111111-1111-4111-8111-111111111111"]
        reach(pdf, in: app); capture(app, "retained-family-pdf-control"); pdf.tap()
        let result = app.staticTexts["retained-files.result"]
        reach(result, in: app, longParagraph: true)
        XCTAssertEqual(result.label, "サンプルPDFの取得操作を確認しました")
        let photo = app.buttons["retained-files.download.22222222-2222-4222-8222-222222222222"]
        reach(photo, in: app, searchingUp: true); photo.tap()
        reach(result, in: app, longParagraph: true)
        XCTAssertEqual(result.label, "サンプル写真の取得操作を確認しました")
        let more = app.buttons["retained-files.more"]
        reach(more, in: app, searchingUp: true); more.tap()
        reach(result, in: app, longParagraph: true)
        XCTAssertEqual(result.label, "サンプルの続きを確認しました")
        XCTAssertFalse(more.exists)
        XCTAssertFalse(app.buttons["このファイルを削除"].exists)
        capture(app, "retained-family-pagination-result")
        app.terminate()
    }

    func testRetainedFamilyRemovalCancelAndUncertainRetry() {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.ouchi.review.closure")
        app.launchArguments = ["--ouchi-retained-files-preview", "-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        if ProcessInfo.processInfo.environment["OUCHI_UI_TEXT_MODE"] == "ax5" { app.launchArguments.append("--ouchi-large-text-preview") }
        app.launch()
        XCTAssertTrue(app.staticTexts["retained-files.sample"].waitForExistence(timeout: 45))
        let reload = app.buttons["retained-files.reload"]
        reach(reload, in: app); reload.tap()
        let id = "11111111-1111-4111-8111-111111111111"
        let photoID = "22222222-2222-4222-8222-222222222222"
        let remove = app.buttons["retained-files.remove." + id]
        reach(remove, in: app); XCTAssertTrue(remove.isEnabled); remove.tap()
        let cancel = app.buttons["キャンセル"]
        let dismissPopover = app.otherElements["PopoverDismissRegion"]
        let dismissalReady = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            cancel.exists || dismissPopover.exists
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [dismissalReady], timeout: 10), .completed)
        capture(app, "retained-removal-cancel-or-popover-dismissal")
        if cancel.exists { cancel.tap() }
        else { XCTAssertTrue(dismissPopover.isHittable); dismissPopover.tap() }
        reach(remove, in: app, searchingUp: true)
        XCTAssertTrue(remove.isEnabled, "Cancelling must preserve the existing sample file")
        XCTAssertFalse(app.buttons["retained-removals.retry." + id].exists)
        capture(app, "retained-removal-cancel-preserves-file")
        remove.tap()
        let simulate = app.buttons["削除後の通信断を確認"]
        XCTAssertTrue(simulate.waitForExistence(timeout: 10))
        capture(app, "retained-removal-explicit-sample-confirmation")
        simulate.tap()
        let retry = app.buttons["retained-removals.retry." + id]
        reach(retry, in: app)
        XCTAssertTrue(retry.isEnabled)
        XCTAssertFalse(app.buttons["retained-files.download." + id].exists, "Pending removal must not remain downloadable")
        XCTAssertFalse(remove.exists)
        capture(app, "retained-removal-uncertain-same-file-retry")
        retry.tap()
        let result = app.staticTexts["retained-files.result"]
        reach(result, in: app, longParagraph: true)
        XCTAssertEqual(result.label, "サンプルの削除結果の再確認を完了しました")
        XCTAssertFalse(retry.exists)
        XCTAssertFalse(app.buttons["retained-files.download." + id].exists)
        let photo = app.buttons["retained-files.download." + photoID]
        reach(photo, in: app, searchingUp: true)
        XCTAssertTrue(photo.isEnabled, "The other family sample file must remain available")
        capture(app, "retained-removal-complete-other-file-preserved")
        app.terminate()
    }

    private let original = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    private func launch(failRepeatedRead: Bool = false, progress: Bool = false, missingIntake: Bool = false) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.ouchi.review.closure")
        let textMode = ProcessInfo.processInfo.environment["OUCHI_UI_TEXT_MODE"] ?? "ax5"
        XCTAssertTrue(["large", "ax5"].contains(textMode), "Only explicitly supported preview text modes may run")
        app.launchArguments = ["--ouchi-closure-review-preview", "-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        if textMode == "ax5" { app.launchArguments.append("--ouchi-large-text-preview") }
        if progress { app.launchArguments.append("--ouchi-closure-progress-preview") }
        if missingIntake { app.launchArguments.append("--ouchi-closure-missing-intake-preview") }
        if failRepeatedRead { app.launchArguments.append("--ouchi-closure-failed-reread-preview") }
        app.launch()
        XCTAssertTrue(app.staticTexts["closure-review.sample"].waitForExistence(timeout: 45))
        return app
    }
    private func reach(_ element: XCUIElement, in app: XCUIApplication, searchingUp: Bool = false, longParagraph: Bool = false) {
        for _ in 0..<60 {
            let sample = app.staticTexts["closure-review.sample"]
            let top = max(app.navigationBars.firstMatch.frame.maxY, sample.exists ? sample.frame.maxY : 0) + 8
            let bottom = app.keyboards.firstMatch.exists ? app.keyboards.firstMatch.frame.minY - 8 : app.frame.maxY - 16
            // A paragraph may span more than one screen at AX5. Its beginning
            // must be visible; interactive controls still have to fit entirely.
            if element.exists && element.isHittable && element.frame.minY >= top {
                if element.frame.maxY <= bottom { return }
                if longParagraph && element.elementType == .staticText && element.frame.minY + 100 < bottom { return }
            }
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
    func testRealJobProgressHidesMutationsAndKeepsUncertainReference() {
        let app = launch(progress: true)
        let check = app.buttons["closure-review.check." + original]
        let status = app.staticTexts["closure-review.progress"]
        let labels = ["削除処理を受け付けています。完了はまだ確認されていません。",
            "削除処理を進めています。完了はまだ確認されていません。",
            "削除処理は完了していません。新しい依頼は送らず、この依頼の状況を再確認してください。",
            "サーバーで退会処理の完了を確認しました。この端末に残る登録・ファイルの消去状況は別途確認が必要です。"]
        for (index, label) in labels.enumerated() {
            reach(check, in: app, searchingUp: index > 0); check.tap()
            reach(status, in: app, longParagraph: true); XCTAssertTrue(status.waitForExistence(timeout: 20)); XCTAssertEqual(status.label, label)
            XCTAssertFalse(app.buttons["closure-review.cancel"].exists)
            XCTAssertFalse(app.buttons["closure-review.submit"].exists)
            XCTAssertFalse(app.secureTextFields["closure-review.password"].exists)
            capture(app, "closure-job-state-" + String(index))
            let jobID = app.staticTexts["closure-review.job-id"]
            reach(jobID, in: app); XCTAssertEqual(jobID.label, "処理番号：DDDDDDDD")
            capture(app, "closure-job-state-end-" + String(index))
        }
        reach(check, in: app, searchingUp: true); check.tap()
        let message = app.staticTexts["closure-review.message"]
        reach(message, in: app, longParagraph: true); XCTAssertTrue(message.label.contains("最新の処理状況を確認できません"))
        XCTAssertFalse(status.exists, "A prior complete result must disappear after an unavailable reply")
        XCTAssertFalse(app.buttons["closure-review.cancel"].exists)
        XCTAssertFalse(app.buttons["closure-review.submit"].exists)
        capture(app, "closure-job-unavailable-retains-reference")
        app.swipeUp(); capture(app, "closure-job-unavailable-end")
        let count = app.staticTexts["closure-review.reference-count"]
        reach(count, in: app, searchingUp: true); XCTAssertEqual(count.label, "保存された依頼：2件")
        app.terminate()
    }
    func testFailedRereadClearsVisibleReceiptAndRetainsReference() {
        let app = launch(failRepeatedRead: true)
        let check = app.buttons["closure-review.check." + original]
        reach(check, in: app); check.tap()
        let status = app.staticTexts["closure-review.status"]
        reach(status, in: app)
        XCTAssertEqual(status.label, "退会依頼の受付を確認しました。運営の確認が必要です。削除処理はまだ完了していません。")
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
        reach(status, in: app); XCTAssertEqual(status.label, "退会依頼の受付を確認しました。運営の確認が必要です。削除処理はまだ完了していません。")
        let cancel = app.buttons["closure-review.cancel"]
        reach(cancel, in: app); capture(app, "diagnostic-before-cancel-ax5"); cancel.tap()
        app.buttons["依頼を取り消す"].tap()
        reach(status, in: app); XCTAssertEqual(status.label, "この退会依頼は取り消されています。")
        let password = app.secureTextFields["closure-review.password"]
        reach(password, in: app); capture(app, "diagnostic-password-visible-ax5")
        app.terminate()
    }
    func testMissingIntakeExplicitlyRetriesOriginalProtectedNumber() {
        let app = launch(missingIntake: true)
        let check = app.buttons["closure-review.check." + original]
        reach(check, in: app); check.tap()
        let hint = app.staticTexts["closure-review.same-number-hint"]
        XCTAssertTrue(app.staticTexts["closure-review.message"].waitForExistence(timeout:20))
        capture(app,"same-number-after-missing-read-before-scroll")
        // Missing review scrolls the result message into view below this hint.
        // At AX5 the off-screen row is virtualized, so search upward first.
        reach(hint, in: app, searchingUp: true, longParagraph: true)
        XCTAssertTrue(hint.label.contains("同じ依頼番号"))
        let selected = app.staticTexts["closure-review.selected"]
        reach(selected, in: app, searchingUp: true); let savedLabel = selected.label
        XCTAssertTrue(savedLabel.contains("AAAAAAAA"))
        let password = app.secureTextFields["closure-review.password"]
        reach(password, in: app); password.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        reach(password, in: app); password.typeText("synthetic-preview-only")
        let done = app.buttons["closure-review.keyboard-done"]
        XCTAssertTrue(done.waitForExistence(timeout: 10)); done.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 10))
        let consent = app.switches["closure-review.consent"]
        reach(consent, in: app); consent.coordinate(withNormalizedOffset:CGVector(dx:0.92,dy:0.5)).tap()
        XCTAssertEqual(consent.value as? String,"1")
        let submit = app.buttons["closure-review.submit"]
        reach(submit, in: app); XCTAssertEqual(submit.label,"同じ依頼番号で再送する"); XCTAssertTrue(submit.isEnabled)
        capture(app,"same-number-retry-confirmation")
        submit.tap()
        let confirm = app.buttons["同じ依頼番号で再送"]
        XCTAssertTrue(confirm.waitForExistence(timeout:10)); confirm.tap()
        let status = app.staticTexts["closure-review.status"]
        XCTAssertTrue(status.waitForExistence(timeout:20))
        print("Same-number accepted paragraph frame: \(status.frame); viewport: \(app.frame)")
        capture(app,"same-number-accepted-before-paragraph-scroll")
        // A result paragraph can span screens at AX5; controls still must fit.
        reach(status,in:app,longParagraph:true); XCTAssertTrue(status.label.contains("受付を確認"))
        capture(app,"same-number-accepted-paragraph-beginning")
        XCTAssertFalse(hint.exists)
        reach(selected,in:app,searchingUp:true); XCTAssertEqual(selected.label,savedLabel)
        let count = app.staticTexts["closure-review.reference-count"]
        reach(count,in:app,searchingUp:true); XCTAssertEqual(count.label,"保存された依頼：2件")
        capture(app,"same-number-accepted-original-reference")
        app.terminate()
    }
    func testProtectedReferenceReadCancelAndExplicitNewSubmission() {
        let app = launch()
        let check = app.buttons["closure-review.check." + original]
        reach(check, in: app); XCTAssertTrue(check.isEnabled); check.tap()
        capture(app, "review-after-select-before-scroll-ax5")
        let status = app.staticTexts["closure-review.status"]
        reach(status, in: app); XCTAssertTrue(status.waitForExistence(timeout: 20))
        XCTAssertEqual(status.label, "退会依頼の受付を確認しました。運営の確認が必要です。削除処理はまだ完了していません。")
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
        XCTAssertEqual(status.label, "退会依頼の受付を確認しました。運営の確認が必要です。削除処理はまだ完了していません。")
        let selected = app.staticTexts["closure-review.selected"]
        reach(selected, in: app, searchingUp: true); XCTAssertFalse(selected.label.contains("AAAAAAAA"), "Explicit new request must retain a fresh submission")
        let count = app.staticTexts["closure-review.reference-count"]
        reach(count, in: app, searchingUp: true); XCTAssertEqual(count.label, "保存された依頼：3件", "Protected original references are retained alongside the new submission")
        capture(app, "review-new-submission-ax5"); app.terminate()
    }
}
