import SwiftUI
import Kingfisher

@Observable
final class GalleryViewModel {
    let galleryId: String
    var gallery: GalleryView?
    var error: String?
    var isLoading = false
    var shareToken: String?
    var portfolioConsent: Bool = false

    init(galleryId: String) {
        self.galleryId = galleryId
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let g: GalleryView = try await APIClient.shared.get("/galleries/\(galleryId)")
            gallery = g
            portfolioConsent = g.portfolioConsent
            Analytics.capture(.galleryOpened, properties: [
                "gallery_id": galleryId,
                "item_count": g.items.count,
            ])
        } catch {
            self.error = error.localizedDescription
        }
    }

    func toggleConsent(_ on: Bool) async {
        struct Body: Encodable { let portfolioConsent: Bool }
        struct Resp: Decodable { let portfolioConsent: Bool }
        do {
            let resp: Resp = try await APIClient.shared.patch("/galleries/\(galleryId)", body: Body(portfolioConsent: on))
            portfolioConsent = resp.portfolioConsent
        } catch {
            self.error = error.localizedDescription
        }
    }

    func generateShareLink() async {
        struct Empty: Encodable {}
        do {
            let resp: ShareLinkResponse = try await APIClient.shared.post(
                "/galleries/\(galleryId)/share",
                body: Empty(),
            )
            shareToken = resp.token
            Analytics.capture(.sharedGalleryLink, properties: ["gallery_id": galleryId])
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct GalleryScreen: View {
    @State var vm: GalleryViewModel
    @State private var fullscreenItem: GalleryItem?

    init(galleryId: String) {
        _vm = State(initialValue: GalleryViewModel(galleryId: galleryId))
    }

    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 4)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let g = vm.gallery {
                    header(gallery: g)
                    consentToggle
                    LazyVGrid(columns: columns, spacing: 4) {
                        ForEach(g.items) { item in
                            KFImage(URL(string: item.url))
                                .placeholder { Rectangle().fill(Color.captureInkMuted.opacity(0.15)) }
                                .resizable()
                                .scaledToFill()
                                .frame(height: 110)
                                .clipped()
                                .onTapGesture { fullscreenItem = item }
                        }
                    }
                    if g.items.isEmpty {
                        Text("Your photographer hasn't delivered photos yet.")
                            .font(.captureBody).foregroundStyle(Color.captureInkMuted)
                            .padding(.top, 60)
                    }
                }
                if let error = vm.error {
                    Text(error).font(.captureCaption).foregroundStyle(.red)
                }
            }
            .padding(20)
        }
        .background(Color.captureBackground.ignoresSafeArea())
        .navigationTitle("Gallery")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await vm.generateShareLink() }
                } label: { Image(systemName: "square.and.arrow.up") }
            }
        }
        .task { await vm.load() }
        .fullScreenCover(item: $fullscreenItem) { item in
            PhotoFullScreenView(item: item) { fullscreenItem = nil }
        }
        .sheet(isPresented: .init(
            get: { vm.shareToken != nil },
            set: { if !$0 { vm.shareToken = nil } },
        )) {
            if let token = vm.shareToken {
                ShareSheet(activityItems: [URL(string: "https://capture.app/g/\(token)") as Any])
            }
        }
    }

    private func header(gallery: GalleryView) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(gallery.status == "delivered" ? "Your photos are ready" : "Awaiting delivery")
                .font(.captureTitle).foregroundStyle(Color.captureInk)
            if let date = gallery.deliveredAt {
                Text("Delivered \(date.formatted(date: .abbreviated, time: .shortened))")
                    .font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            }
        }
    }

    private var consentToggle: some View {
        Toggle(isOn: Binding(
            get: { vm.portfolioConsent },
            set: { newValue in Task { await vm.toggleConsent(newValue) } },
        )) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Let your photographer use these photos in their portfolio")
                    .font(.captureBody).foregroundStyle(Color.captureInk)
                Text("You can change this any time.")
                    .font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            }
        }
        .padding(14)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }
}

private struct PhotoFullScreenView: View {
    let item: GalleryItem
    let dismiss: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            KFImage(URL(string: item.url))
                .resizable()
                .scaledToFit()
                .ignoresSafeArea()
            Button(action: dismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(12)
                    .background(.black.opacity(0.4))
                    .clipShape(Circle())
            }
            .padding()
        }
    }
}

/// Thin UIActivityViewController wrapper.
struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
