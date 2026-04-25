import SwiftUI

@Observable
final class BookingsListViewModel {
    var bookings: [BookingSummary] = []
    var isLoading = false
    var error: String?

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let resp: BookingListResponse = try await APIClient.shared.get("/bookings")
            bookings = resp.bookings
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct BookingsListView: View {
    @State private var vm = BookingsListViewModel()
    @State private var showHelp = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(vm.bookings) { booking in
                    NavigationLink(value: booking.id) {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(booking.photographer.name).font(.captureBodyStrong)
                                Spacer()
                                statusBadge(booking)
                            }
                            Text(booking.service.title).font(.captureCaption).foregroundStyle(Color.captureInkMuted)
                            Text(booking.startsAt.formatted(date: .abbreviated, time: .shortened))
                                .font(.captureCaption)
                            if booking.gallery?.status == "delivered" {
                                Label("Photos ready", systemImage: "photo.on.rectangle.angled")
                                    .font(.captureCaption)
                                    .foregroundStyle(Color.captureBlue)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Bookings")
            .navigationDestination(for: String.self) { bookingId in
                BookingDetailView(bookingId: bookingId)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showHelp = true } label: { Image(systemName: "questionmark.circle") }
                }
            }
            .task { await vm.load() }
            .refreshable { await vm.load() }
            .sheet(isPresented: $showHelp) {
                HelpSheet(bookingId: nil)
            }
        }
    }

    @ViewBuilder
    private func statusBadge(_ booking: BookingSummary) -> some View {
        Text(booking.status.capitalized)
            .font(.captureCaption)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(badgeColor(booking.status).opacity(0.15))
            .foregroundStyle(badgeColor(booking.status))
            .clipShape(Capsule())
    }

    private func badgeColor(_ status: String) -> Color {
        switch status {
        case "confirmed": .captureBlue
        case "completed": .green
        case "cancelled", "refunded": .red
        default: .captureInkMuted
        }
    }
}
