import SwiftUI

@MainActor
@Observable
final class ReferralViewModel {
    var status: ReferralStatusResponse?
    var error: String?
    var claimDraft: String = ""
    var claimMessage: String?
    var isClaiming = false

    func load() async {
        do {
            status = try await APIClient.shared.get("/referrals/me")
        } catch {
            self.error = error.localizedDescription
        }
    }

    func claim() async {
        let code = claimDraft.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !code.isEmpty, !isClaiming else { return }
        isClaiming = true
        defer { isClaiming = false }
        struct Body: Encodable { let code: String }
        do {
            let resp: ReferralClaimResponse = try await APIClient.shared.post(
                "/referrals/claim",
                body: Body(code: code),
            )
            self.claimMessage = "Got it — \(formatCurrency(resp.creditCents)) added to your balance."
            self.claimDraft = ""
            Analytics.capture(.referralCodeClaimed, properties: ["credit_cents": resp.creditCents])
            await load()
        } catch {
            self.claimMessage = "Couldn't claim that code. Double-check and try again."
        }
    }
}

struct ReferralSection: View {
    @State private var vm = ReferralViewModel()
    @State private var showShareSheet = false

    var body: some View {
        Section("Refer friends") {
            if let status = vm.status {
                LabeledContent("Your code", value: status.code)
                LabeledContent("Credit balance", value: formatCurrency(status.creditCents))
                LabeledContent("Friends signed up", value: "\(status.referralsSent)")
                Button {
                    Analytics.capture(.referralCodeShared, properties: ["code": status.code])
                    showShareSheet = true
                } label: {
                    Label("Share my code", systemImage: "square.and.arrow.up")
                }
                .sheet(isPresented: $showShareSheet) {
                    ShareSheet(items: [shareText(for: status.code)])
                }
            } else {
                ProgressView()
            }

            if vm.status?.referralsSent == 0 {
                // Once a user has been referred we stop showing the claim
                // field (one-claim-per-user policy is enforced server-side
                // anyway, but no need to tease the option).
                claimRow
            }

            if let message = vm.claimMessage {
                Text(message).font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            }
            if let error = vm.error {
                Text(error).font(.captureCaption).foregroundStyle(.red)
            }
        }
        .task { await vm.load() }
    }

    private var claimRow: some View {
        HStack {
            TextField("Got a code? Paste it here", text: $vm.claimDraft)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.characters)
            Button("Claim") {
                Task { await vm.claim() }
            }
            .disabled(vm.claimDraft.trimmingCharacters(in: .whitespaces).isEmpty || vm.isClaiming)
        }
    }

    private func shareText(for code: String) -> String {
        "I'm on Capture — easy way to book a photographer near you. Use my code \(code) at signup and we both get $10 off our next booking. https://capture.app/r/\(code)"
    }
}

/// UIActivityViewController bridge so SwiftUI can hand off to the iOS share
/// sheet. `excludedActivityTypes` is empty on purpose — we want all share
/// targets surfaced (Messages, Mail, Twitter, etc).
private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
