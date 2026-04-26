import SwiftUI

@MainActor
@Observable
final class ThreadViewModel {
    let bookingId: String
    var messages: [Message] = []
    var locked = false
    var draft: String = ""
    var error: String?
    var isSending = false
    private var pollTask: Task<Void, Never>?

    init(bookingId: String) {
        self.bookingId = bookingId
    }

    func load() async {
        do {
            let resp: MessageThreadResponse = try await APIClient.shared.get("/messages/\(bookingId)")
            self.messages = resp.messages
            self.locked = resp.locked
        } catch {
            self.error = error.localizedDescription
        }
    }

    func send() async {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSending, !locked else { return }
        isSending = true
        defer { isSending = false }
        struct Body: Encodable { let body: String }
        do {
            let sent: Message = try await APIClient.shared.post(
                "/messages/\(bookingId)",
                body: Body(body: trimmed),
            )
            self.messages.append(sent)
            self.draft = ""
            Analytics.capture(.messageSent, properties: ["booking_id": bookingId])
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Lightweight polling — every 5s while the screen is open. Real-time
    /// delivery (WebSocket) is a follow-up; polling keeps this M2 cut simple
    /// and works fine for sub-thousand active threads.
    func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                if Task.isCancelled { break }
                await self?.load()
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }
}

struct ThreadView: View {
    @State private var vm: ThreadViewModel

    init(bookingId: String) {
        _vm = State(initialValue: ThreadViewModel(bookingId: bookingId))
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(vm.messages) { message in
                            MessageRow(message: message).id(message.id)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .onChange(of: vm.messages.count) { _, _ in
                    if let last = vm.messages.last {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }

            if let error = vm.error {
                Text(error).font(.captureCaption).foregroundStyle(.red).padding(.horizontal, 16)
            }

            composer
        }
        .background(Color.captureBackground.ignoresSafeArea())
        .navigationTitle("Messages")
        .task {
            await vm.load()
            vm.startPolling()
        }
        .onDisappear { vm.stopPolling() }
    }

    @ViewBuilder
    private var composer: some View {
        if vm.locked {
            Text("This thread is closed.")
                .font(.captureCaption)
                .foregroundStyle(Color.captureInkMuted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.captureInkMuted.opacity(0.08))
        } else {
            HStack(spacing: 8) {
                TextField("Message", text: $vm.draft, axis: .vertical)
                    .lineLimit(1...4)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                Button {
                    Task { await vm.send() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(canSend ? Color.captureBlue : Color.captureInkMuted)
                }
                .disabled(!canSend)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.captureBackground)
            .overlay(Rectangle().frame(height: 0.5).foregroundStyle(Color.captureInkMuted.opacity(0.3)), alignment: .top)
        }
    }

    private var canSend: Bool {
        !vm.isSending && !vm.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

private struct MessageRow: View {
    let message: Message

    var body: some View {
        HStack {
            if message.isMine { Spacer(minLength: 40) }
            VStack(alignment: message.isMine ? .trailing : .leading, spacing: 2) {
                if let body = message.body {
                    Text(body)
                        .font(.captureBody)
                        .foregroundStyle(message.isMine ? .white : Color.captureInk)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(message.isMine ? Color.captureBlue : Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                if let location = message.location {
                    LocationPin(location: location, fromMe: message.isMine)
                }
                Text(message.createdAt, style: .time)
                    .font(.system(size: 10))
                    .foregroundStyle(Color.captureInkMuted)
            }
            if !message.isMine { Spacer(minLength: 40) }
        }
    }
}

private struct LocationPin: View {
    let location: MessageLocation
    let fromMe: Bool

    var body: some View {
        let live = location.expiresAt > Date()
        HStack(spacing: 6) {
            Image(systemName: live ? "location.fill" : "location.slash")
                .font(.system(size: 12))
            Text(live ? "Live location" : "Location expired")
                .font(.captureCaption)
        }
        .foregroundStyle(fromMe ? .white : Color.captureInk)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(fromMe ? Color.captureBlue : Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}
