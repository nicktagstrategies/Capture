import SwiftUI

/// The large rounded "Book Now" pill used on voucher cards and the checkout bar.
struct BookNowButton: View {
    let title: String
    var isDark: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.captureBodyStrong)
                .foregroundStyle(isDark ? Color.white : Color.captureInk)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(isDark ? Color.captureBlue : Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: .black.opacity(0.05), radius: 12, y: 4)
        }
        .buttonStyle(.plain)
    }
}

/// Selectable row with a leading accent bar (used for Service, Photographer, Payment).
struct PickerRow<Trailing: View>: View {
    let label: String
    let title: String
    let subtitle: String?
    @ViewBuilder var trailing: Trailing

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.captureCaption)
                .foregroundStyle(Color.captureInkMuted)
            HStack {
                Rectangle()
                    .fill(Color.captureBlue)
                    .frame(width: 3)
                    .clipShape(RoundedRectangle(cornerRadius: 2))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.captureBodyStrong).foregroundStyle(Color.captureInk)
                    if let subtitle { Text(subtitle).font(.captureCaption).foregroundStyle(Color.captureInkMuted) }
                }
                Spacer()
                trailing
                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color.captureInkMuted)
            }
            .padding(.vertical, 14)
            .padding(.horizontal, 14)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
        }
    }
}

/// Star rating row (4 filled + 1 half/empty) used on the Propositions carousel.
struct StarRating: View {
    let rating: Double
    let count: Int

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<5) { i in
                Image(systemName: i < Int(rating.rounded()) ? "star.fill" : "star")
                    .foregroundStyle(Color.capturePriceInk)
                    .font(.system(size: 13))
            }
            Text("(\(count) ratings)")
                .font(.captureCaption)
                .foregroundStyle(Color.captureInkMuted)
        }
    }
}
