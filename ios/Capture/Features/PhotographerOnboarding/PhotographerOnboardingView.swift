import SwiftUI
import UIKit

@MainActor
@Observable
final class PhotographerOnboardingViewModel {
    enum Phase {
        case intro
        case starting
        case waitingForStripe(url: URL, accountId: String)
        case completed
        case failed(String)
    }

    var phase: Phase = .intro
    var pollTask: Task<Void, Never>?

    func start() async {
        phase = .starting
        Analytics.capture(.photographerOnboardingStarted)
        do {
            struct EmptyBody: Encodable {}
            let resp: OnboardingStartResponse = try await APIClient.shared.post(
                "/me/photographer/onboarding/start",
                body: EmptyBody(),
            )
            guard let url = URL(string: resp.accountLinkUrl) else {
                phase = .failed("Stripe link is invalid")
                return
            }
            phase = .waitingForStripe(url: url, accountId: resp.stripeAccountId)
            startPolling()
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    /// Polls /me/photographer once a second once the Stripe sheet is open.
    /// As soon as `onboardingCompletedAt` is non-null, advance to the
    /// dashboard. The webhook (or dev-bypass simulator) drives that flip.
    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                guard let self else { return }
                if case .waitingForStripe = self.phase {
                    await self.pollOnce()
                } else {
                    return
                }
            }
        }
    }

    func pollOnce() async {
        do {
            let me: PhotographerMe = try await APIClient.shared.get("/me/photographer")
            if me.onboardingCompletedAt != nil {
                pollTask?.cancel()
                phase = .completed
                Analytics.capture(.photographerOnboardingCompleted)
            }
        } catch {
            // Silent — 404 is expected before profile exists, 401 will be
            // handled by the auth refresher. Logged errors don't help here.
        }
    }

    func cancel() {
        pollTask?.cancel()
    }
}

struct PhotographerOnboardingView: View {
    @State private var vm = PhotographerOnboardingViewModel()
    @Environment(SessionStore.self) private var session

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                hero
                switch vm.phase {
                case .intro:
                    intro
                case .starting:
                    ProgressView("Connecting to Stripe…")
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 24)
                case .waitingForStripe(let url, _):
                    waiting(url: url)
                case .completed:
                    completed
                case .failed(let message):
                    failureCard(message: message)
                }
            }
            .padding(20)
        }
        .background(Color.captureBackground.ignoresSafeArea())
        .navigationTitle("Become a photographer")
        .navigationDestination(isPresented: Binding(
            get: { if case .completed = vm.phase { return true } else { return false } },
            set: { newValue in if !newValue { vm.phase = .intro } },
        )) {
            PhotographerDashboardView()
        }
        .onDisappear { vm.cancel() }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Earn doing what you love")
                .font(.captureLargeTitle).foregroundStyle(Color.captureInk)
            Text("Set your services, share your availability, get paid out automatically after each session.")
                .font(.captureBody).foregroundStyle(Color.captureInkMuted)
        }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 14) {
            checklist
            Button {
                Task { await vm.start() }
            } label: {
                Text("Continue with Stripe")
                    .font(.captureBodyStrong)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.captureBlue)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private var checklist: some View {
        VStack(alignment: .leading, spacing: 10) {
            checklistRow(icon: "person.crop.circle", title: "Verify your identity", subtitle: "Stripe handles ID verification securely.")
            checklistRow(icon: "creditcard", title: "Connect your payout account", subtitle: "Get paid directly to your bank.")
            checklistRow(icon: "calendar", title: "Set your services & calendar", subtitle: "Customers book the slots you offer.")
        }
    }

    private func checklistRow(icon: String, title: String, subtitle: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).font(.system(size: 22)).foregroundStyle(Color.captureBlue)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.captureBodyStrong).foregroundStyle(Color.captureInk)
                Text(subtitle).font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            }
        }
        .padding(14)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    private func waiting(url: URL) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Finish in Stripe")
                .font(.captureSectionHeader).foregroundStyle(Color.captureInk)
            Text("We'll auto-detect when you're done. If the page closes early, tap the button to reopen Stripe or refresh the link.")
                .font(.captureBody).foregroundStyle(Color.captureInkMuted)
            // capture:// URLs (dev bypass) can't be opened in Safari — just
            // show "I'm done" so the polling can flip the dashboard.
            if url.scheme == "https" {
                Link(destination: url) {
                    Text("Open Stripe again")
                        .font(.captureBodyStrong)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.captureBlue)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            Button {
                Task { await vm.pollOnce() }
            } label: {
                Text("I'm done — check status")
                    .font(.captureBodyStrong)
                    .foregroundStyle(Color.captureBlue)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.captureBlue.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            ProgressView().frame(maxWidth: .infinity, alignment: .center)
        }
        .onAppear {
            // Auto-launch Stripe the first time we land in this phase.
            if url.scheme == "https" {
                UIApplication.shared.open(url)
            }
        }
    }

    private var completed: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: "checkmark.seal.fill").font(.system(size: 44)).foregroundStyle(Color.captureBlue)
            Text("You're approved").font(.captureTitle).foregroundStyle(Color.captureInk)
            Text("Set up your services and availability — we'll send your first booking when a customer matches.")
                .font(.captureBody).foregroundStyle(Color.captureInkMuted)
        }
        .onAppear {
            // The webhook flipped the role; bring the in-memory user up to date.
            session.updateUserRole("photographer")
        }
    }

    private func failureCard(message: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Something went wrong").font(.captureBodyStrong).foregroundStyle(.red)
            Text(message).font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            Button("Try again") { Task { await vm.start() } }
                .font(.captureBodyStrong).foregroundStyle(Color.captureBlue)
        }
        .padding(14)
        .background(Color.red.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
