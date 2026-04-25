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

    var body: some View {
        NavigationStack {
            List(vm.bookings) { booking in
                VStack(alignment: .leading, spacing: 6) {
                    Text(booking.photographer.name).font(.captureBodyStrong)
                    Text(booking.service.title).font(.captureCaption).foregroundStyle(Color.captureInkMuted)
                    Text(booking.startsAt.formatted(date: .abbreviated, time: .shortened))
                        .font(.captureCaption)
                }
            }
            .navigationTitle("Bookings")
            .task { await vm.load() }
            .refreshable { await vm.load() }
        }
    }
}
