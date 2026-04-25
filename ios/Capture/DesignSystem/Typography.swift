import SwiftUI

extension Font {
    static let captureLargeTitle = Font.system(size: 32, weight: .bold, design: .default)
    static let captureTitle = Font.system(size: 22, weight: .bold, design: .default)
    static let captureSectionHeader = Font.system(size: 20, weight: .bold, design: .default)
    static let captureBody = Font.system(size: 16, weight: .regular, design: .default)
    static let captureBodyStrong = Font.system(size: 16, weight: .semibold, design: .default)
    static let captureCaption = Font.system(size: 13, weight: .regular, design: .default)
}

enum Appearance {
    static func configure() {
        let nav = UINavigationBarAppearance()
        nav.configureWithOpaqueBackground()
        nav.backgroundColor = UIColor(Color.captureBackground)
        nav.shadowColor = .clear
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
    }
}
