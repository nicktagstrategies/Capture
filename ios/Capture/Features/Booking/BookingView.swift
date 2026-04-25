import SwiftUI
import StripePaymentSheet

@Observable
final class BookingViewModel {
    let photographerId: String
    var detail: PhotographerDetail?
    var slots: [Slot] = []
    var selectedService: ServiceDTO?
    var selectedSlot: Slot?
    var selectedVoucherId: String?
    var isLoading = false
    var error: String?
    var paymentSheet: PaymentSheet?
    var bookingConfirmed = false

    init(photographerId: String) {
        self.photographerId = photographerId
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let d: PhotographerDetail = APIClient.shared.get("/photographers/\(photographerId)")
            async let s: SlotsResponse = APIClient.shared.get("/photographers/\(photographerId)/availability")
            let (detail, slots) = try await (d, s)
            self.detail = detail
            self.slots = slots.slots
            self.selectedService = detail.services.first
            self.selectedSlot = slots.slots.first
        } catch {
            self.error = error.localizedDescription
        }
    }

    private var idempotencyKey = UUID().uuidString

    func beginCheckout() async {
        guard let service = selectedService, let slot = selectedSlot else { return }
        do {
            // Stable per-attempt key. If the network drops mid-request and we retry,
            // the server replays the original outcome instead of double-charging.
            let resp: BookingCreatedResponse = try await APIClient.shared.post(
                "/bookings",
                body: BookingRequest(
                    serviceId: service.id,
                    slotId: slot.id,
                    voucherId: selectedVoucherId,
                    bookingAddress: nil,
                ),
                headers: ["Idempotency-Key": idempotencyKey],
            )
            StripeAPI.defaultPublishableKey = Config.stripePublishableKey
            var config = PaymentSheet.Configuration()
            config.merchantDisplayName = "Capture"
            config.applePay = .init(merchantId: "merchant.com.capture.app", merchantCountryCode: "US")
            config.allowsDelayedPaymentMethods = false
            let sheet = PaymentSheet(paymentIntentClientSecret: resp.clientSecret, configuration: config)
            await MainActor.run { self.paymentSheet = sheet }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct BookingView: View {
    @State var vm: BookingViewModel
    @State private var showHelp = false
    @Environment(\.dismiss) private var dismiss

    init(photographerId: String) {
        _vm = State(initialValue: BookingViewModel(photographerId: photographerId))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let detail = vm.detail {
                    Text(detail.name).font(.captureLargeTitle).foregroundStyle(Color.captureInk)

                    servicePicker(services: detail.services)
                    photographerPicker(name: detail.name, avatarUrl: detail.avatarUrl)
                    dateTimePicker
                    paymentPicker
                }

                if let error = vm.error {
                    Text(error).font(.captureCaption).foregroundStyle(.red)
                }
            }
            .padding(20)
            .padding(.bottom, 140)
        }
        .background(Color.captureBackground.ignoresSafeArea())
        .navigationTitle("")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Help") { showHelp = true }
                    .foregroundStyle(Color.captureInkMuted)
            }
        }
        .sheet(isPresented: $showHelp) {
            HelpSheet(bookingId: nil)
        }
        .task { await vm.load() }
        .safeAreaInset(edge: .bottom) { checkoutBar }
        .paymentSheet(
            isPresented: .init(
                get: { vm.paymentSheet != nil },
                set: { if !$0 { vm.paymentSheet = nil } },
            ),
            paymentSheet: vm.paymentSheet ?? PaymentSheet(paymentIntentClientSecret: "", configuration: .init()),
        ) { result in
            switch result {
            case .completed:
                vm.bookingConfirmed = true
                dismiss()
            case .canceled:
                break
            case .failed(let error):
                vm.error = error.localizedDescription
            }
        }
    }

    private func servicePicker(services: [ServiceDTO]) -> some View {
        Menu {
            ForEach(services) { s in
                Button {
                    vm.selectedService = s
                } label: {
                    Text("\(s.title) — \(formatCurrency(s.priceCents))")
                }
            }
        } label: {
            PickerRow(
                label: "Select Service",
                title: vm.selectedService?.title ?? "Choose",
                subtitle: vm.selectedService.map { "\($0.durationMinutes) minutes" } ?? nil,
            ) {
                if let service = vm.selectedService {
                    Text(formatCurrency(service.priceCents))
                        .font(.captureBodyStrong)
                        .foregroundStyle(Color.capturePriceInk)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Color.capturePriceChip)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }

    private func photographerPicker(name: String, avatarUrl: String?) -> some View {
        PickerRow(label: "Select Photographer", title: name, subtitle: nil) {
            EmptyView()
        }
    }

    private var dateTimePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Date & Time").font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            VStack(spacing: 12) {
                monthHeader
                weekGrid
            }
            .padding(14)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .shadow(color: .black.opacity(0.04), radius: 6, y: 2)

            timeSlotStrip
        }
    }

    private var monthHeader: some View {
        HStack {
            Text(monthTitle).font(.captureBodyStrong).foregroundStyle(Color.captureInk)
            Spacer()
            Image(systemName: "chevron.down").foregroundStyle(Color.captureInkMuted)
        }
    }

    private var photographerTimeZone: TimeZone {
        TimeZone(identifier: vm.detail?.timezone ?? "America/Los_Angeles") ?? .current
    }

    private var photographerCalendar: Calendar {
        var cal = Calendar.current
        cal.timeZone = photographerTimeZone
        return cal
    }

    private func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.dateFormat = format
        f.timeZone = photographerTimeZone
        return f
    }

    private var monthTitle: String {
        formatter("LLLL yyyy").string(from: vm.selectedSlot?.startsAt ?? Date())
    }

    private var weekGrid: some View {
        let week = uniqueDays(in: vm.slots).prefix(7)
        return HStack(spacing: 4) {
            ForEach(Array(week), id: \.self) { day in
                VStack(spacing: 6) {
                    Text(weekdayShort(day)).font(.captureCaption).foregroundStyle(Color.captureInkMuted)
                    Text(dayNumber(day))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(isSelectedDay(day) ? .white : Color.captureInk)
                        .frame(width: 34, height: 34)
                        .background(isSelectedDay(day) ? Color.captureBlue : .clear)
                        .clipShape(Circle())
                }
                .frame(maxWidth: .infinity)
                .onTapGesture { selectDay(day) }
            }
        }
    }

    private var timeSlotStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(slotsOnSelectedDay) { slot in
                    Text(timeString(slot.startsAt))
                        .font(.captureBodyStrong)
                        .foregroundStyle(vm.selectedSlot?.id == slot.id ? .white : Color.captureInk)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(vm.selectedSlot?.id == slot.id ? Color.captureBlue : .clear)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .onTapGesture { vm.selectedSlot = slot }
                }
            }
            .padding(.horizontal, 4)
        }
        .padding(.vertical, 12)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    private var paymentPicker: some View {
        PickerRow(label: "Payment", title: "American Express", subtitle: "8890 4825 **** **** ****") {
            EmptyView()
        }
    }

    private var checkoutBar: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(formatCurrency(totalCents)).font(.captureLargeTitle).foregroundStyle(.white)
                Text("Service fee: \(formatCurrency(feeCents))")
                    .font(.captureCaption).foregroundStyle(.white.opacity(0.8))
            }
            Spacer()
            BookNowButton(title: "Book Now") {
                Task { await vm.beginCheckout() }
            }
            .frame(width: 140)
        }
        .padding(20)
        .background(Color.captureBlue)
    }

    private var feeCents: Int { 250 } // placeholder until /config is wired
    private var totalCents: Int {
        (vm.selectedService?.priceCents ?? 0) + feeCents
    }

    // MARK: - Day helpers (all calendar math happens in the photographer's TZ)

    private func uniqueDays(in slots: [Slot]) -> [Date] {
        let cal = photographerCalendar
        var seen = Set<DateComponents>()
        var days: [Date] = []
        for slot in slots {
            let comps = cal.dateComponents([.year, .month, .day], from: slot.startsAt)
            if seen.insert(comps).inserted { days.append(cal.date(from: comps)!) }
        }
        return days
    }

    private var slotsOnSelectedDay: [Slot] {
        guard let day = vm.selectedSlot?.startsAt else { return [] }
        let cal = photographerCalendar
        return vm.slots.filter { cal.isDate($0.startsAt, inSameDayAs: day) }
    }

    private func isSelectedDay(_ date: Date) -> Bool {
        guard let selected = vm.selectedSlot?.startsAt else { return false }
        return photographerCalendar.isDate(date, inSameDayAs: selected)
    }

    private func selectDay(_ date: Date) {
        let cal = photographerCalendar
        if let first = vm.slots.first(where: { cal.isDate($0.startsAt, inSameDayAs: date) }) {
            vm.selectedSlot = first
        }
    }

    private func weekdayShort(_ date: Date) -> String { formatter("EEE").string(from: date) }
    private func dayNumber(_ date: Date) -> String { formatter("d").string(from: date) }

    private func timeString(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateStyle = .none
        f.timeStyle = .short
        f.timeZone = photographerTimeZone
        return f.string(from: date).lowercased()
    }
}

func formatCurrency(_ cents: Int) -> String {
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.locale = Locale(identifier: "en_US")
    return f.string(from: NSNumber(value: Double(cents) / 100.0)) ?? "$\(cents / 100).\(cents % 100)"
}
