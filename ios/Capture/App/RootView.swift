import SwiftUI

struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        Group {
            switch session.state {
            case .unknown:
                SplashView()
            case .signedOut:
                AuthView()
            case .signedIn:
                MainTabView()
            }
        }
        .task { await session.restore() }
    }
}

struct SplashView: View {
    var body: some View {
        ZStack {
            Color.captureBackground.ignoresSafeArea()
            ProgressView()
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house.fill") }
            BookingsListView()
                .tabItem { Label("Bookings", systemImage: "calendar") }
            VouchersInboxView()
                .tabItem { Label("Gifts", systemImage: "gift.fill") }
            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.fill") }
        }
        .tint(.captureBlue)
    }
}
