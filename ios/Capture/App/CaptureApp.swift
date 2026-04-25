import SwiftUI
import GoogleSignIn

@main
struct CaptureApp: App {
    @State private var session = SessionStore()

    init() {
        Appearance.configure()
        Observability.bootstrap()
        Analytics.capture(.appOpened)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .onOpenURL { url in
                    GIDSignIn.sharedInstance.handle(url)
                }
        }
    }
}
