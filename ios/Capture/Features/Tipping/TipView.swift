import SwiftUI
import StripePaymentSheet

@MainActor
@Observable
final class TipViewModel {
    let bookingId: String
    let photographerName: String
    var suggestions: [TipSuggestion] = []
    var minCents: Int = 100
    var maxCents: Int = 50_000
    var subtotalCents: Int = 0
    var selectedAmountCents: Int?
    var customDraft: String = ""
    var error: String?
    var paymentSheet: PaymentSheet?
    var didComplete = false

    init(bookingId: String, photographerName: String) {
        self.bookingId = bookingId
        self.photographerName = photographerName
    }

    func load() async {
        do {
            let resp: TipSuggestionsResponse = try await APIClient.shared.get(
                "/bookings/\(bookingId)/tip-suggestions",
            )
            self.suggestions = resp.suggestions
            self.minCents = resp.minCents
            self.maxCents = resp.maxCents
            self.subtotalCents = resp.subtotalCents
            // Default-select the middle suggestion (15%) so a single tap gets
            // the customer to PaymentSheet quickly.
            self.selectedAmountCents = resp.suggestions.dropFirst().first?.amountCents
                ?? resp.suggestions.first?.amountCents
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Resolves to the integer cents that will be charged. Custom dollars are
    /// parsed at submit time so the user can keep typing without us recomputing.
    var resolvedAmountCents: Int? {
        if let selected = selectedAmountCents { return selected }
        let cleaned = customDraft.replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespaces)
        guard let dollars = Double(cleaned), dollars > 0 else { return nil }
        return Int((dollars * 100).rounded())
    }

    var canSubmit: Bool {
        guard let cents = resolvedAmountCents else { return false }
        return cents >= minCents && cents <= maxCents
    }

    func submit() async {
        guard let amountCents = resolvedAmountCents else { return }
        Analytics.capture(.tipStarted, properties: [
            "booking_id": bookingId,
            "amount_cents": amountCents,
        ])
        struct Body: Encodable { let amountCents: Int }
        do {
            let resp: TipCreatedResponse = try await APIClient.shared.post(
                "/bookings/\(bookingId)/tip",
                body: Body(amountCents: amountCents),
                // Reuse the same key for retries so a flaky network doesn't
                // spawn two tips on the same booking.
                headers: ["Idempotency-Key": "tip-\(bookingId)"],
            )
            StripeAPI.defaultPublishableKey = Config.stripePublishableKey
            var config = PaymentSheet.Configuration()
            config.merchantDisplayName = "Capture"
            config.applePay = .init(merchantId: "merchant.com.capture.app", merchantCountryCode: "US")
            config.allowsDelayedPaymentMethods = false
            self.paymentSheet = PaymentSheet(
                paymentIntentClientSecret: resp.clientSecret,
                configuration: config,
            )
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct TipView: View {
    @State private var vm: TipViewModel
    @Environment(\.dismiss) private var dismiss

    init(bookingId: String, photographerName: String) {
        _vm = State(initialValue: TipViewModel(bookingId: bookingId, photographerName: photographerName))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                suggestionGrid
                customField
                if let error = vm.error {
                    Text(error).font(.captureCaption).foregroundStyle(.red)
                }
            }
            .padding(20)
        }
        .background(Color.captureBackground.ignoresSafeArea())
        .navigationTitle("Add a tip")
        .safeAreaInset(edge: .bottom) { submitBar }
        .task { await vm.load() }
        .paymentSheet(
            isPresented: .init(
                get: { vm.paymentSheet != nil },
                set: { if !$0 { vm.paymentSheet = nil } },
            ),
            paymentSheet: vm.paymentSheet ?? PaymentSheet(paymentIntentClientSecret: "", configuration: .init()),
        ) { result in
            switch result {
            case .completed:
                Analytics.capture(.tipCompleted, properties: [
                    "booking_id": vm.bookingId,
                    "amount_cents": vm.resolvedAmountCents ?? 0,
                ])
                vm.didComplete = true
                dismiss()
            case .canceled:
                break
            case .failed(let error):
                vm.error = error.localizedDescription
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Tip \(vm.photographerName)").font(.captureTitle).foregroundStyle(Color.captureInk)
            Text("100% goes to the photographer — Capture takes no cut on tips.")
                .font(.captureCaption).foregroundStyle(Color.captureInkMuted)
        }
    }

    private var suggestionGrid: some View {
        HStack(spacing: 10) {
            ForEach(vm.suggestions) { suggestion in
                Button {
                    vm.selectedAmountCents = suggestion.amountCents
                    vm.customDraft = ""
                } label: {
                    VStack(spacing: 4) {
                        Text("\(suggestion.percent)%").font(.captureBodyStrong)
                        Text(formatCurrency(suggestion.amountCents)).font(.captureCaption)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(isSelected(suggestion) ? Color.captureBlue : Color.white)
                    .foregroundStyle(isSelected(suggestion) ? .white : Color.captureInk)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var customField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Or a custom amount").font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            TextField("$0.00", text: $vm.customDraft)
                .keyboardType(.decimalPad)
                .padding(14)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .onChange(of: vm.customDraft) { _, newValue in
                    if !newValue.isEmpty { vm.selectedAmountCents = nil }
                }
        }
    }

    private var submitBar: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Tip amount").font(.captureCaption).foregroundStyle(.white.opacity(0.8))
                Text(submitTitle).font(.captureLargeTitle).foregroundStyle(.white)
            }
            Spacer()
            Button {
                Task { await vm.submit() }
            } label: {
                Text("Pay tip")
                    .font(.captureBodyStrong)
                    .foregroundStyle(Color.captureBlue)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .disabled(!vm.canSubmit)
            .opacity(vm.canSubmit ? 1.0 : 0.5)
        }
        .padding(20)
        .background(Color.captureBlue)
    }

    private var submitTitle: String {
        if let cents = vm.resolvedAmountCents { return formatCurrency(cents) }
        return "—"
    }

    private func isSelected(_ suggestion: TipSuggestion) -> Bool {
        vm.selectedAmountCents == suggestion.amountCents
    }
}
