import SwiftUI
import Kingfisher

@Observable
final class BookingDetailViewModel {
    let bookingId: String
    var detail: BookingDetail?
    var error: String?
    var isCancelling = false
    var availableSlots: [Slot] = []

    init(bookingId: String) {
        self.bookingId = bookingId
    }

    func load() async {
        do {
            detail = try await APIClient.shared.get("/bookings/\(bookingId)")
        } catch {
            self.error = error.localizedDescription
        }
    }

    func loadSlotsForReschedule() async {
        guard let photographerId = detail?.photographer.id else { return }
        do {
            let resp: SlotsResponse = try await APIClient.shared.get(
                "/photographers/\(photographerId)/availability",
            )
            availableSlots = resp.slots
        } catch {
            self.error = error.localizedDescription
        }
    }

    func cancel(reason: String?) async {
        isCancelling = true
        defer { isCancelling = false }
        struct Body: Encodable { let reason: String? }
        struct Resp: Decodable {
            let bookingId: String
            let cancelledBy: String
            let refund: RefundPreview
        }
        do {
            let resp: Resp = try await APIClient.shared.post(
                "/bookings/\(bookingId)/cancel",
                body: Body(reason: reason),
            )
            Analytics.capture(.bookingCancelled, properties: [
                "booking_id": resp.bookingId,
                "cancelled_by": resp.cancelledBy,
                "refund_rule": resp.refund.rule,
                "refund_cents": resp.refund.refundCents,
            ])
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func reschedule(to slotId: String) async {
        struct Body: Encodable { let slotId: String }
        struct Resp: Decodable { let bookingId: String; let startsAt: Date }
        do {
            _ = try await APIClient.shared.post(
                "/bookings/\(bookingId)/reschedule",
                body: Body(slotId: slotId),
            ) as Resp
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct BookingDetailView: View {
    @State var vm: BookingDetailViewModel
    @State private var showCancelConfirm = false
    @State private var showReschedule = false
    @State private var cancelReason = ""

    init(bookingId: String) {
        _vm = State(initialValue: BookingDetailViewModel(bookingId: bookingId))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let d = vm.detail {
                    headerCard(detail: d)
                    if let g = d.gallery, g.status == "delivered" {
                        NavigationLink(value: g.id) {
                            galleryCallout
                        }
                        .buttonStyle(.plain)
                    }
                    NavigationLink {
                        ThreadView(bookingId: d.id)
                    } label: {
                        messageCallout(role: d.role)
                    }
                    .buttonStyle(.plain)
                    receipt(detail: d)
                    actionButtons(detail: d)
                    if let cancelledAt = d.cancelledAt {
                        cancelledBanner(date: cancelledAt, refundCents: d.refundAmountCents ?? 0)
                    }
                }
                if let error = vm.error {
                    Text(error).font(.captureCaption).foregroundStyle(.red)
                }
            }
            .padding(20)
        }
        .background(Color.captureBackground.ignoresSafeArea())
        .navigationTitle("Booking")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Help") { /* HelpSheet trigger added at root */ }
                    .foregroundStyle(Color.captureInkMuted)
            }
        }
        .navigationDestination(for: String.self) { galleryId in
            GalleryScreen(galleryId: galleryId)
        }
        .task { await vm.load() }
        .alert("Cancel booking?", isPresented: $showCancelConfirm) {
            TextField("Reason (optional)", text: $cancelReason)
            Button("Cancel booking", role: .destructive) {
                Task { await vm.cancel(reason: cancelReason.isEmpty ? nil : cancelReason) }
            }
            Button("Keep booking", role: .cancel) {}
        } message: {
            if let preview = vm.detail?.refundPreview {
                Text(refundMessage(for: preview))
            }
        }
        .sheet(isPresented: $showReschedule) {
            RescheduleSheet(slots: vm.availableSlots, timezone: vm.detail?.photographer.timezone) { slot in
                Task { await vm.reschedule(to: slot.id) }
                showReschedule = false
            }
            .task { await vm.loadSlotsForReschedule() }
        }
    }

    private func headerCard(detail: BookingDetail) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                KFImage(URL(string: detail.photographer.avatarUrl ?? ""))
                    .placeholder { Circle().fill(Color.captureInkMuted.opacity(0.15)) }
                    .resizable().scaledToFill().frame(width: 56, height: 56).clipShape(Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(detail.photographer.name).font(.captureBodyStrong)
                    Text(detail.service.title).font(.captureCaption).foregroundStyle(Color.captureInkMuted)
                }
                Spacer()
            }
            Text(scheduledFormatter(timezone: detail.photographer.timezone).string(from: detail.startsAt))
                .font(.captureBody).foregroundStyle(Color.captureInk)
            if let address = detail.bookingAddress {
                Text(address).font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            }
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    private var galleryCallout: some View {
        HStack {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 22))
                .foregroundStyle(Color.captureBlue)
            VStack(alignment: .leading, spacing: 2) {
                Text("Your photos are ready").font(.captureBodyStrong).foregroundStyle(Color.captureInk)
                Text("Tap to view, share, or download").font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(Color.captureInkMuted)
        }
        .padding(16)
        .background(Color.captureBlue.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func messageCallout(role: String) -> some View {
        HStack {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 20))
                .foregroundStyle(Color.captureBlue)
            VStack(alignment: .leading, spacing: 2) {
                Text(role == "photographer" ? "Message customer" : "Message photographer")
                    .font(.captureBodyStrong).foregroundStyle(Color.captureInk)
                Text("Coordinate logistics, share location, send updates")
                    .font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(Color.captureInkMuted)
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    private func receipt(detail: BookingDetail) -> some View {
        VStack(spacing: 8) {
            row("Subtotal", value: formatCurrency(detail.subtotalCents))
            row("Service fee", value: formatCurrency(detail.customerFeeCents))
            Divider()
            row("Total", value: formatCurrency(detail.totalCents), strong: true)
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    private func row(_ label: String, value: String, strong: Bool = false) -> some View {
        HStack {
            Text(label).font(strong ? .captureBodyStrong : .captureBody).foregroundStyle(Color.captureInk)
            Spacer()
            Text(value).font(strong ? .captureBodyStrong : .captureBody).foregroundStyle(Color.captureInk)
        }
    }

    @ViewBuilder
    private func actionButtons(detail: BookingDetail) -> some View {
        if detail.status == "confirmed" || detail.status == "pending" {
            VStack(spacing: 10) {
                Button("Reschedule") { showReschedule = true }
                    .frame(maxWidth: .infinity).padding(14)
                    .background(Color.white).foregroundStyle(Color.captureInk)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                Button("Cancel booking") { showCancelConfirm = true }
                    .frame(maxWidth: .infinity).padding(14)
                    .foregroundStyle(.red)
            }
        }
    }

    private func cancelledBanner(date: Date, refundCents: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Cancelled \(date.formatted(date: .abbreviated, time: .shortened))")
                .font(.captureBodyStrong)
            if refundCents > 0 {
                Text("Refunded \(formatCurrency(refundCents))").font(.captureCaption)
            } else {
                Text("No refund per cancellation policy.").font(.captureCaption)
            }
        }
        .foregroundStyle(Color.captureInkMuted)
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.captureInkMuted.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func refundMessage(for preview: RefundPreview) -> String {
        switch preview.rule {
        case "full":    "You'll be refunded \(formatCurrency(preview.refundCents)) — the full amount."
        case "partial": "Refund: \(formatCurrency(preview.refundCents)) (50% — within 24-48h of session)."
        case "none":    "Cancellations within 24h are non-refundable."
        case "photographer_initiated": "Photographer cancellation triggers a full refund."
        case "platform_initiated":     "Capture is cancelling on your behalf — full refund."
        default: "Refund: \(formatCurrency(preview.refundCents))."
        }
    }

    private func scheduledFormatter(timezone: String) -> DateFormatter {
        let f = DateFormatter()
        f.dateStyle = .full
        f.timeStyle = .short
        f.timeZone = TimeZone(identifier: timezone) ?? .current
        return f
    }
}

private struct RescheduleSheet: View {
    let slots: [Slot]
    let timezone: String?
    let onPick: (Slot) -> Void

    var body: some View {
        NavigationStack {
            List(slots) { slot in
                Button {
                    onPick(slot)
                } label: {
                    Text(format(slot.startsAt))
                }
            }
            .navigationTitle("Reschedule")
        }
    }

    private func format(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        f.timeZone = TimeZone(identifier: timezone ?? "America/Los_Angeles") ?? .current
        return f.string(from: date)
    }
}
