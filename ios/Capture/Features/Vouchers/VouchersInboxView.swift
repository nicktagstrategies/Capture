import SwiftUI

@Observable
final class VouchersViewModel {
    var vouchers: [Voucher] = []
    var isLoading = false
    var error: String?

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: VouchersResponse = try await APIClient.shared.get("/vouchers")
            vouchers = response.vouchers
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Mirrors the "Congrats, Jad!" voucher inbox screen.
struct VouchersInboxView: View {
    @State private var vm = VouchersViewModel()
    @Environment(SessionStore.self) private var session

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    header
                    ForEach(Array(vm.vouchers.enumerated()), id: \.element.id) { idx, v in
                        VoucherCard(voucher: v, palette: idx.isMultiple(of: 2) ? .blue : .pink)
                    }
                    if vm.vouchers.isEmpty && !vm.isLoading {
                        Text("No gift cards yet.")
                            .font(.captureBody).foregroundStyle(Color.captureInkMuted)
                            .padding(.top, 60)
                    }
                }
                .padding(20)
            }
            .background(Color.captureBackground.ignoresSafeArea())
            .navigationBarHidden(true)
            .task { await vm.load() }
            .refreshable { await vm.load() }
        }
    }

    private var header: some View {
        VStack(spacing: 10) {
            if case .signedIn(let user) = session.state {
                Text("Congrats, \(user.name.split(separator: " ").first.map(String.init) ?? user.name)!")
                    .font(.captureLargeTitle)
                    .foregroundStyle(Color.captureInk)
                    .multilineTextAlignment(.center)
            }
            if let firstSender = vm.vouchers.first?.sender.name {
                Text("You received \(vm.vouchers.count) gift card\(vm.vouchers.count == 1 ? "" : "s") from your friend ")
                    .font(.captureBody).foregroundStyle(Color.captureInk)
                + Text(firstSender).foregroundStyle(Color.captureBlue).font(.captureBodyStrong)
                + Text("!").foregroundStyle(Color.captureInk)
            }
        }
        .padding(.top, 20)
    }
}

private enum CardPalette { case blue, pink }

private struct VoucherCard: View {
    let voucher: Voucher
    let palette: CardPalette

    var body: some View {
        ZStack(alignment: .topLeading) {
            background
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 6) {
                    Image(systemName: "clock")
                    Text(dateString).font(.captureBodyStrong)
                }
                .foregroundStyle(.white.opacity(0.9))

                Spacer()

                VStack(alignment: .leading, spacing: 6) {
                    Text("-\(voucher.percentOff)%")
                        .font(.system(size: 44, weight: .bold))
                        .foregroundStyle(.white)
                    Text(descriptionText)
                        .font(.captureBody)
                        .foregroundStyle(.white.opacity(0.95))
                }

                BookNowButton(title: "Book Now") {}
                    .frame(width: 140)
            }
            .padding(20)
        }
        .frame(height: 260)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    private var descriptionText: String {
        switch voucher.category {
        case "wedding_video": "Voucher for any wedding video package"
        case "portrait": "Voucher for your next portrait session"
        case "event": "Voucher for your next event"
        case "family": "Voucher for a family session"
        case "headshot": "Voucher for a headshot session"
        default: "Voucher for any session"
        }
    }

    private var dateString: String {
        let f = DateFormatter(); f.dateFormat = "d MMMM yyyy"
        return f.string(from: voucher.expiresAt)
    }

    @ViewBuilder
    private var background: some View {
        switch palette {
        case .blue: Color.captureBlue
        case .pink: Color.capturePink
        }
    }
}
