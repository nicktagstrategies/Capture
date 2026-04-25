import SwiftUI
import GoogleSignIn

@main
struct CaptureApp: App {
    @State private var session = SessionStore()

    init() {
        Appearance.configure()
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
