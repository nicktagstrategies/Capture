import SwiftUI
import Kingfisher

@Observable
final class PhotographerProfileViewModel {
    let photographerId: String
    var detail: PhotographerDetail?
    var error: String?
    var isLoading = false

    init(photographerId: String) {
        self.photographerId = photographerId
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            detail = try await APIClient.shared.get("/photographers/\(photographerId)")
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Closes the discovery gap between Home and the Booking screen — portfolio,
/// bio, services list, ratings, and a single Book Now CTA. This is the screen
/// designs implied but didn't show.
struct PhotographerProfileView: View {
    @State var vm: PhotographerProfileViewModel
    @State private var showBooking = false

    init(photographerId: String) {
        _vm = State(initialValue: PhotographerProfileViewModel(photographerId: photographerId))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                hero
                if let detail = vm.detail {
                    headlineRow(detail: detail)
                    if let bio = detail.bio { Text(bio).font(.captureBody).foregroundStyle(Color.captureInk) }
                    servicesSection(services: detail.services)
                    portfolioSection
                    reviewsSection
                }
                if let error = vm.error {
                    Text(error).font(.captureCaption).foregroundStyle(.red)
                }
            }
            .padding(20)
            .padding(.bottom, 120)
        }
        .background(Color.captureBackground.ignoresSafeArea())
        .task { await vm.load() }
        .safeAreaInset(edge: .bottom) { bookCTA }
        .navigationDestination(isPresented: $showBooking) {
            BookingView(photographerId: vm.photographerId)
        }
    }

    private var hero: some View {
        KFImage(URL(string: vm.detail?.heroImageUrl ?? ""))
            .placeholder { Rectangle().fill(Color.captureInkMuted.opacity(0.15)) }
            .resizable()
            .scaledToFill()
            .frame(height: 220)
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func headlineRow(detail: PhotographerDetail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(detail.name).font(.captureLargeTitle).foregroundStyle(Color.captureInk)
            Text(detail.homeCity).font(.captureBody).foregroundStyle(Color.captureInkMuted)
            StarRating(rating: detail.avgRating, count: detail.ratingCount)
        }
    }

    private func servicesSection(services: [ServiceDTO]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Services").font(.captureSectionHeader).foregroundStyle(Color.captureInk)
            ForEach(services) { service in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(service.title).font(.captureBodyStrong).foregroundStyle(Color.captureInk)
                        Text("\(service.durationMinutes) minutes")
                            .font(.captureCaption).foregroundStyle(Color.captureInkMuted)
                    }
                    Spacer()
                    Text(formatCurrency(service.priceCents))
                        .font(.captureBodyStrong)
                        .foregroundStyle(Color.capturePriceInk)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Color.capturePriceChip)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .padding(14)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
            }
        }
    }

    /// Placeholder until the photo upload + portfolio model lands in M3.
    private var portfolioSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Portfolio").font(.captureSectionHeader).foregroundStyle(Color.captureInk)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(0..<5, id: \.self) { _ in
                        Rectangle()
                            .fill(Color.captureInkMuted.opacity(0.12))
                            .frame(width: 160, height: 200)
                            .overlay {
                                Image(systemName: "photo")
                                    .font(.system(size: 28))
                                    .foregroundStyle(Color.captureInkMuted)
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
            Text("Portfolio uploads land in M3.")
                .font(.captureCaption).foregroundStyle(Color.captureInkMuted)
        }
    }

    /// Reviews list placeholder; wired to real `/photographers/:id/reviews` in M4.
    private var reviewsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Reviews").font(.captureSectionHeader).foregroundStyle(Color.captureInk)
            Text("Reviews appear here once customers complete sessions.")
                .font(.captureCaption).foregroundStyle(Color.captureInkMuted)
        }
    }

    private var bookCTA: some View {
        HStack {
            if let lowest = vm.detail?.services.min(by: { $0.priceCents < $1.priceCents }) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("From").font(.captureCaption).foregroundStyle(.white.opacity(0.8))
                    Text(formatCurrency(lowest.priceCents)).font(.captureTitle).foregroundStyle(.white)
                }
            }
            Spacer()
            BookNowButton(title: "Book Now") { showBooking = true }
                .frame(width: 160)
        }
        .padding(20)
        .background(Color.captureBlue)
    }
}
