import SwiftUI

@MainActor
@Observable
final class ReviewPromptViewModel {
    let bookingId: String
    let photographerName: String
    var rating: Int = 0
    var body: String = ""
    var isSubmitting = false
    var error: String?
    var didSubmit = false

    init(bookingId: String, photographerName: String) {
        self.bookingId = bookingId
        self.photographerName = photographerName
    }

    var canSubmit: Bool { rating >= 1 && rating <= 5 && !isSubmitting }

    func submit() async {
        guard canSubmit else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        struct Body: Encodable {
            let bookingId: String
            let rating: Int
            let body: String?
        }
        struct Resp: Decodable {
            let id: String
            let rating: Int
        }
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            _ = try await APIClient.shared.post(
                "/reviews",
                body: Body(bookingId: bookingId, rating: rating, body: trimmed.isEmpty ? nil : trimmed),
            ) as Resp
            Analytics.capture(.reviewSubmitted, properties: [
                "booking_id": bookingId,
                "rating": rating,
            ])
            didSubmit = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ReviewPromptView: View {
    @State private var vm: ReviewPromptViewModel
    @Environment(\.dismiss) private var dismiss

    init(bookingId: String, photographerName: String) {
        _vm = State(initialValue: ReviewPromptViewModel(
            bookingId: bookingId,
            photographerName: photographerName,
        ))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 6) {
                Text("How was your session?").font(.captureTitle).foregroundStyle(Color.captureInk)
                Text("Your review helps \(vm.photographerName) and other customers.")
                    .font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            }

            HStack(spacing: 12) {
                ForEach(1...5, id: \.self) { star in
                    Button {
                        vm.rating = star
                    } label: {
                        Image(systemName: vm.rating >= star ? "star.fill" : "star")
                            .font(.system(size: 32))
                            .foregroundStyle(vm.rating >= star ? Color.capturePink : Color.captureInkMuted)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(star) star\(star == 1 ? "" : "s")")
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Anything else? (optional)").font(.captureCaption).foregroundStyle(Color.captureInkMuted)
                TextEditor(text: $vm.body)
                    .frame(minHeight: 120)
                    .padding(8)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            if let error = vm.error {
                Text(error).font(.captureCaption).foregroundStyle(.red)
            }

            Button {
                Task {
                    await vm.submit()
                    if vm.didSubmit { dismiss() }
                }
            } label: {
                Text(vm.isSubmitting ? "Submitting…" : "Submit review")
                    .font(.captureBodyStrong)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(vm.canSubmit ? Color.captureBlue : Color.captureInkMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(!vm.canSubmit)

            Spacer()
        }
        .padding(20)
        .background(Color.captureBackground.ignoresSafeArea())
        .navigationTitle("Leave a review")
    }
}
