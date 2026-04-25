import XCTest
@testable import Capture

final class FeeFormattingTests: XCTestCase {
    func testCurrencyFormatting() {
        XCTAssertEqual(formatCurrency(1800), "$18.00")
        XCTAssertEqual(formatCurrency(2050), "$20.50")
        XCTAssertEqual(formatCurrency(0), "$0.00")
    }
}
