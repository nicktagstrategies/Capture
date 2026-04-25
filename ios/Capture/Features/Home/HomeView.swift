import SwiftUI
import Kingfisher

@Observable
final class HomeViewModel {
    var searchText: String = ""
    var photographers: [PhotographerCard] = []
    var bookings: [BookingSummary] = []
    var isLoading = false
    var error: String?

    // San Diego fallback so the home screen has content even without permissions.
    var lat: Double = 32.7157
    var lng: Double = -117.1611

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let search: PhotographerSearchResponse = APIClient.shared.get(
                "/photographers",
                query: [
                    URLQueryItem(name: "lat", value: String(lat)),
                    URLQueryItem(name: "lng", value: String(lng)),
                    URLQueryItem(name: "radiusKm", value: "30"),
                ],
            )
            async let list: BookingListResponse = APIClient.shared.get("/bookings")
            let (s, b) = try await (search, list)
            photographers = s.photographers
            bookings = b.bookings
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct HomeView: View {
    @State private var vm = HomeViewModel()
    @Environment(SessionStore.self) private var session

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    searchField
                    bookingsSection
                    propositionsSection
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
            .background(Color.captureBackground.ignoresSafeArea())
            .navigationBarHidden(true)
            .task { await vm.load() }
            .refreshable { await vm.load() }
        }
    }

    private var header: some View {
        HStack {
            Image(systemName: "line.3.horizontal")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Color.captureBlue)
            Spacer()
            if case .signedIn(let user) = session.state {
                KFImage(URL(string: user.avatarUrl ?? ""))
                    .placeholder { Circle().fill(Color.captureInkMuted.opacity(0.2)) }
                    .resizable()
                    .scaledToFill()
                    .frame(width: 44, height: 44)
                    .clipShape(Circle())
            }
        }
        .padding(.top, 8)
    }

    private var searchField: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Welcome!").font(.captureLargeTitle).foregroundStyle(Color.captureInk)
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color.captureInkMuted)
                TextField("Find a photographer near you", text: $vm.searchText)
                    .textFieldStyle(.plain)
                Image(systemName: "location.fill")
                    .foregroundStyle(Color.captureBlue)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
        }
    }

    private var bookingsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: "Bookings", trailing: "See All (\(vm.bookings.count))")
            if vm.bookings.isEmpty && !vm.isLoading {
                Text("No upcoming bookings. Browse photographers below to get started.")
                    .font(.captureCaption).foregroundStyle(Color.captureInkMuted)
                    .padding(.vertical, 20)
            }
            ForEach(vm.bookings.prefix(3)) { booking in
                BookingRow(booking: booking)
            }
        }
    }

    private var propositionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: "Propositions", trailing: "See All (\(vm.photographers.count))")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 16) {
                    ForEach(vm.photographers) { p in
                        NavigationLink(value: p.id) {
                            PhotographerCardView(card: p)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationDestination(for: String.self) { photographerId in
                BookingView(photographerId: photographerId)
            }
        }
    }

    private func sectionHeader(title: String, trailing: String) -> some View {
        HStack {
            Text(title).font(.captureSectionHeader).foregroundStyle(Color.captureInk)
            Spacer()
            Text(trailing).font(.captureCaption).foregroundStyle(Color.captureInkMuted)
        }
    }
}

private struct BookingRow: View {
    let booking: BookingSummary

    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 2) {
                Text(dayString).font(.system(size: 24, weight: .bold)).foregroundStyle(Color.captureBlue)
                Text(weekday).font(.captureCaption).foregroundStyle(Color.captureBlue.opacity(0.9))
            }
            .frame(width: 70, height: 70)
            .background(Color.captureBlue.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 4) {
                Text(booking.photographer.name).font(.captureBodyStrong).foregroundStyle(Color.captureInk)
                Text(booking.service.title).font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            }
            .padding(.leading, 14)
            Spacer()
        }
        .padding(12)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    private var dayString: String {
        let f = DateFormatter(); f.dateFormat = "d"; return f.string(from: booking.startsAt)
    }

    private var weekday: String {
        let isToday = Calendar.current.isDateInToday(booking.startsAt)
        if isToday { return "Today" }
        let f = DateFormatter(); f.dateFormat = "EEE"; return f.string(from: booking.startsAt)
    }
}

private struct PhotographerCardView: View {
    let card: PhotographerCard

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            KFImage(URL(string: card.heroImageUrl ?? ""))
                .placeholder {
                    Rectangle().fill(Color.captureInkMuted.opacity(0.15))
                }
                .resizable()
                .scaledToFill()
                .frame(width: 260, height: 170)
                .clipped()
            VStack(alignment: .leading, spacing: 6) {
                Text(card.name).font(.captureBodyStrong).foregroundStyle(Color.captureInk)
                Text(card.homeCity).font(.captureCaption).foregroundStyle(Color.captureInkMuted)
                StarRating(rating: card.avgRating, count: card.ratingCount)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
        }
        .frame(width: 260)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
    }
}
