import SwiftUI

struct ProfileView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        NavigationStack {
            List {
                if case .signedIn(let user) = session.state {
                    Section("Account") {
                        LabeledContent("Name", value: user.name)
                        LabeledContent("Email", value: user.email)
                        LabeledContent("Role", value: user.role.capitalized)
                    }
                    Section("Photographer") {
                        // The role string is the source of truth — `customer`
                        // hasn't started onboarding yet; `photographer` and
                        // `both` already have a profile and dashboard.
                        if user.role == "customer" {
                            NavigationLink("Become a photographer") {
                                PhotographerOnboardingView()
                            }
                        } else {
                            NavigationLink("Photographer dashboard") {
                                PhotographerDashboardView()
                            }
                        }
                    }
                    ReferralSection()
                }
                Section {
                    Button("Sign out", role: .destructive) {
                        Task { await session.signOut() }
                    }
                }
            }
            .navigationTitle("Profile")
        }
    }
}
