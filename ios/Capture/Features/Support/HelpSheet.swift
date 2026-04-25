import SwiftUI

@Observable
final class HelpViewModel {
    var category: Category = .other
    var subject: String = ""
    var body: String = ""
    var isSubmitting = false
    var sentTicketId: String?
    var error: String?

    enum Category: String, CaseIterable, Identifiable {
        case booking, payment, photographer, account, other
        var id: String { rawValue }
        var label: String {
            switch self {
            case .booking: "Booking issue"
            case .payment: "Payment / refund"
            case .photographer: "Photographer concern"
            case .account: "Account"
            case .other: "Something else"
            }
        }
    }

    func submit(bookingId: String?) async {
        isSubmitting = true
        defer { isSubmitting = false }
        struct Body: Encodable {
            let category: String
            let subject: String
            let body: String
            let bookingId: String?
        }
        struct Resp: Decodable { let id: String; let status: String }
        do {
            let resp: Resp = try await APIClient.shared.post(
                "/support/tickets",
                body: Body(
                    category: category.rawValue,
                    subject: subject,
                    body: self.body,
                    bookingId: bookingId,
                ),
            )
            sentTicketId = resp.id
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct HelpSheet: View {
    /// Optional booking context — when surfaced from the booking screen, the
    /// ticket is associated with that booking so support can pull it up fast.
    let bookingId: String?
    @State private var vm = HelpViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                if let id = vm.sentTicketId {
                    Section {
                        Label("We got your message — ticket #\(id.prefix(8)). We'll reply via email.", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }
                } else {
                    Section("What's going on?") {
                        Picker("Category", selection: $vm.category) {
                            ForEach(HelpViewModel.Category.allCases) { c in
                                Text(c.label).tag(c)
                            }
                        }
                        TextField("Subject", text: $vm.subject)
                        TextEditor(text: $vm.body).frame(minHeight: 140)
                    }
                    if let error = vm.error {
                        Text(error).foregroundStyle(.red).font(.captureCaption)
                    }
                    Section {
                        Button {
                            Task { await vm.submit(bookingId: bookingId) }
                        } label: {
                            HStack {
                                if vm.isSubmitting { ProgressView() }
                                Text("Send")
                            }
                        }
                        .disabled(vm.subject.isEmpty || vm.body.isEmpty || vm.isSubmitting)
                    }
                }
            }
            .navigationTitle("Help")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(vm.sentTicketId == nil ? "Cancel" : "Done") { dismiss() }
                }
            }
        }
    }
}
