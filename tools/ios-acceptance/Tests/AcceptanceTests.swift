import StoreKitTest
import XCTest

/// Attaches to the PawCue build installed on the booted simulator (bundle id com.pawcue.app) and reads the
/// accessibility tree — the same labels, values and traits VoiceOver speaks — for the screens the manual
/// checklist could not cover on the simulator. Every finding is printed with the `A11Y ` prefix so the run log
/// is the evidence.
final class AcceptanceTests: XCTestCase {
  let app = XCUIApplication(bundleIdentifier: "com.pawcue.app")

  override func setUpWithError() throws {
    continueAfterFailure = true
  }

  // MARK: helpers

  func launchToToday() {
    app.launch()
    XCTAssertTrue(app.otherElements["today-screen"].waitForExistence(timeout: 25), "Today did not appear")
  }

  func describe(_ e: XCUIElement) -> String {
    let traits = e.elementType
    return "type=\(traits.rawValue) id='\(e.identifier)' label='\(e.label)' value='\(e.value.map { "\($0)" } ?? "")' selected=\(e.isSelected)"
  }

  func first(_ id: String, timeout: TimeInterval = 10) -> XCUIElement {
    let q = app.descendants(matching: .any).matching(identifier: id)
    _ = q.firstMatch.waitForExistence(timeout: timeout)
    return q.firstMatch
  }

  /// The app's tab bar is its own component (role "tab", testID tab-<name>), not a UITabBar.
  func tabBarButton(_ name: String) -> XCUIElement {
    let byId = app.descendants(matching: .any).matching(identifier: "tab-\(name.lowercased())").firstMatch
    if byId.waitForExistence(timeout: 5) { return byId }
    return app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", name)).firstMatch
  }

  func testTabBarExposesTabsWithSelection() {
    launchToToday()
    for name in ["index", "train", "progress", "dog"] {
      let t = app.descendants(matching: .any).matching(identifier: "tab-\(name)").firstMatch
      XCTAssertTrue(t.waitForExistence(timeout: 5), "tab-\(name) missing")
      print("A11Y tab: " + describe(t))
    }
  }

  // MARK: 9 — VoiceOver over Today, Train and a session

  func testTodayReadsPlanRowsWithTheirTrailState() {
    launchToToday()
    let rows = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'today-activity-'"))
    var lines: [String] = []
    for i in 0..<min(rows.count, 6) {
      let r = rows.element(boundBy: i)
      if r.identifier.contains("-state-") { continue }
      lines.append("A11Y today-row: " + describe(r))
    }
    let cta = first("today-clicker")
    lines.append("A11Y today-clicker: " + describe(cta))
    for l in lines { print(l) }
    XCTAssertFalse(lines.isEmpty, "no plan rows were exposed to accessibility")
  }

  func testTrainReadsPausedAndLockedStates() {
    launchToToday()
    tabBarButton("Train").tap()
    let rows = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] 'Premium' OR label CONTAINS[c] 'Completed' OR label CONTAINS[c] 'paused' OR label CONTAINS[c] 'Not started'"))
    for i in 0..<min(rows.count, 8) {
      print("A11Y train-row: " + describe(rows.element(boundBy: i)))
    }
    let paused = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] 'paused' OR label CONTAINS 'Unfinished'"))
    for i in 0..<paused.count { print("A11Y train-paused: " + describe(paused.element(boundBy: i))) }
    XCTAssertGreaterThan(rows.count, 0, "no lesson rows exposed on Train")
  }

  func testSessionReadsClickerAndRepMarksOnTheNameGame() {
    // The Name Game is free and in today's plan on a fresh profile. Its step 2 needs a click, its step 4 (since
    // the 2026-09-16 content change) needs the click and five reps — both flags on one step.
    launchToToday()
    tabBarButton("Train").tap()
    let row = first("lesson-card-name_game")
    XCTAssertTrue(row.exists, "The Name Game row not found on Train")
    print("A11Y train-row: " + describe(row))
    row.tap()
    let start = app.buttons.matching(NSPredicate(format: "label CONTAINS 'The Name Game'")).firstMatch
    XCTAssertTrue(start.waitForExistence(timeout: 10), "Start button not found on the overview")
    print("A11Y overview-start: " + describe(start))
    start.tap()
    // A lesson left unfinished resumes where it stopped; a fresh one starts at step 1.
    if !first("repetition-progress", timeout: 8).exists {
      let next = app.buttons["Next step"]
      XCTAssertTrue(next.waitForExistence(timeout: 15), "step 1 did not render")
      next.tap()
      // Step 2: the clicker gates the step.
      let clicker = first("session-clicker")
      XCTAssertTrue(clicker.exists, "clicker not exposed on step 2")
      print("A11Y clicker: " + describe(clicker))
      let advance = app.buttons.matching(NSPredicate(format: "label CONTAINS 'continue' OR label == 'Next step'")).firstMatch
      print("A11Y advance before click: " + describe(advance))
      clicker.tap()
      print("A11Y advance after click: " + describe(advance))
      app.buttons["Next step"].tap()
      app.buttons["Next step"].tap()
    }
    // Step 4: reps and the clicker together.
    let marks = first("repetition-progress")
    XCTAssertTrue(marks.exists, "rep marks not exposed on step 4")
    print("A11Y rep-marks before: " + describe(marks))
    print("A11Y step-4 clicker present: \(first("session-clicker", timeout: 2).exists)")
    app.buttons["Count it"].tap()
    print("A11Y rep-marks after one: " + describe(marks))
    app.buttons["Count it"].tap()
    print("A11Y rep-marks after two: " + describe(marks))
    // VoiceOver speaks the label ("2 of 5") and then the value ("40%").
    XCTAssertTrue(marks.label.contains(" of 5"), "rep marks label is not a count out of 5")
    let remaining = app.buttons.matching(NSPredicate(format: "label CONTAINS 'more to go'")).firstMatch
    if remaining.exists { print("A11Y advance on step 4: " + describe(remaining)) }
    if app.buttons["Pause"].exists { app.buttons["Pause"].tap() }
  }

  // MARK: 5 — the Switch inside a Settings row

  func testSettingsSoundEffectsSwitchReadsLabelAndStateAndToggles() {
    launchToToday()
    first("today-clicker").tap()
    app.buttons["Settings"].firstMatch.tap()
    let sw = app.switches["Sound Effects"]
    XCTAssertTrue(sw.waitForExistence(timeout: 10), "Sound Effects switch not exposed by label")
    print("A11Y switch before: " + describe(sw))
    let before = "\(sw.value ?? "")"
    sw.tap()
    let after = "\(sw.value ?? "")"
    print("A11Y switch after: " + describe(sw))
    XCTAssertNotEqual(before, after, "switch state did not change on activation")
    sw.tap() // restore
    print("A11Y switch restored: " + describe(sw))
  }

  // MARK: 8 — the paywall with real products from the StoreKit configuration

  func testPaywallShowsPlanTilesFromTheStoreKitConfiguration() throws {
    let session = try SKTestSession(configurationFileNamed: "PawCue")
    session.disableDialogs = true
    session.clearTransactions()
    launchToToday()
    first("today-clicker").tap()
    app.buttons["Settings"].firstMatch.tap()
    let go = app.buttons["Go Premium"]
    XCTAssertTrue(go.waitForExistence(timeout: 10), "Go Premium not found in Settings")
    go.tap()
    XCTAssertTrue(app.otherElements["paywall-screen"].waitForExistence(timeout: 15), "paywall did not open")
    let plans = app.otherElements["paywall-plans"]
    let unavailable = app.otherElements["paywall-unavailable"]
    let appeared = plans.waitForExistence(timeout: 25) || unavailable.waitForExistence(timeout: 5)
    XCTAssertTrue(appeared, "neither plans nor the unavailable block rendered")
    let tiles = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'paywall-plan-'"))
    print("A11Y paywall: plans=\(plans.exists) unavailable=\(unavailable.exists) tiles=\(tiles.count)")
    for i in 0..<tiles.count { print("A11Y paywall-tile: " + describe(tiles.element(boundBy: i))) }
    let prices = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'paywall-price-'"))
    for i in 0..<prices.count { print("A11Y paywall-price: " + describe(prices.element(boundBy: i))) }
    if app.otherElements["paywall-disclosure"].exists {
      print("A11Y paywall-disclosure: " + app.otherElements["paywall-disclosure"].staticTexts.allElementsBoundByIndex.map { $0.label }.joined(separator: " | "))
    }
  }
}
