import SwiftUI

@MainActor
@Observable
final class PhotographerDashboardViewModel {
    var profile: PhotographerMe?
    var services: [OwnedService] = []
    var slots: [OwnedSlot] = []
    var error: String?
    var isLoading = false

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            // Profile is required; services + slots can fail independently.
            profile = try await APIClient.shared.get("/me/photographer")
            await refreshServices()
            await refreshSlots()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func refreshServices() async {
        guard let profile else { return }
        struct Resp: Decodable {
            let id: String
            let name: String
            let avatarUrl: String?
            let heroImageUrl: String?
            let homeCity: String
            let timezone: String
            let bio: String?
            let hourlyRateCents: Int
            let avgRating: Double
            let ratingCount: Int
            let services: [OwnedService]
        }
        // Reuse the public photographer detail to read services back. Keeps
        // us off a duplicated /me/photographer/services endpoint until we
        // have a reason to differentiate.
        do {
            let detail: Resp = try await APIClient.shared.get("/photographers/\(profile.id)")
            services = detail.services
        } catch {
            // Non-fatal — dashboard can render without services.
        }
    }

    func refreshSlots() async {
        guard let profile else { return }
        do {
            let resp: SlotsResponse = try await APIClient.shared.get(
                "/photographers/\(profile.id)/availability",
            )
            slots = resp.slots.map { OwnedSlot(id: $0.id, startsAt: $0.startsAt, endsAt: $0.endsAt, status: "open") }
        } catch {
            // Non-fatal.
        }
    }

    func patchProfile(_ patch: PhotographerProfilePatch) async {
        do {
            profile = try await APIClient.shared.patch("/me/photographer", body: patch)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func createService(_ body: ServiceUpsert) async {
        do {
            let _: OwnedService = try await APIClient.shared.post("/me/photographer/services", body: body)
            Analytics.capture(.photographerServiceCreated, properties: ["category": body.category])
            await refreshServices()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func deleteService(id: String) async {
        do {
            try await APIClient.shared.delete("/me/photographer/services/\(id)")
            await refreshServices()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func createSlots(_ inputs: [CreateSlotsBody.SlotInput]) async {
        do {
            struct Resp: Decodable { let slots: [OwnedSlot] }
            let _: Resp = try await APIClient.shared.post(
                "/me/photographer/availability/slots",
                body: CreateSlotsBody(slots: inputs),
            )
            Analytics.capture(.photographerSlotsCreated, properties: ["count": inputs.count])
            await refreshSlots()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func deleteSlot(id: String) async {
        do {
            try await APIClient.shared.delete("/me/photographer/availability/slots/\(id)")
            await refreshSlots()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct PhotographerDashboardView: View {
    @State private var vm = PhotographerDashboardViewModel()
    @State private var showAddService = false
    @State private var showAddSlots = false
    @State private var showEditProfile = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let profile = vm.profile {
                    profileCard(profile: profile)
                    servicesSection
                    availabilitySection
                } else if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
                if let error = vm.error {
                    Text(error).font(.captureCaption).foregroundStyle(.red)
                }
            }
            .padding(20)
        }
        .background(Color.captureBackground.ignoresSafeArea())
        .navigationTitle("Dashboard")
        .task { await vm.load() }
        .sheet(isPresented: $showAddService) {
            ServiceEditSheet { service in
                Task { await vm.createService(service); showAddService = false }
            }
        }
        .sheet(isPresented: $showAddSlots) {
            SlotsAddSheet(timezone: vm.profile?.timezone ?? TimeZone.current.identifier) { inputs in
                Task { await vm.createSlots(inputs); showAddSlots = false }
            }
        }
        .sheet(isPresented: $showEditProfile) {
            if let profile = vm.profile {
                ProfileEditSheet(profile: profile) { patch in
                    Task { await vm.patchProfile(patch); showEditProfile = false }
                }
            }
        }
    }

    private func profileCard(profile: PhotographerMe) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Profile").font(.captureSectionHeader).foregroundStyle(Color.captureInk)
                Spacer()
                Button { showEditProfile = true } label: {
                    Image(systemName: "pencil").foregroundStyle(Color.captureBlue)
                }
            }
            Text(profile.homeCity).font(.captureBody).foregroundStyle(Color.captureInk)
            if let bio = profile.bio, !bio.isEmpty {
                Text(bio).font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            }
            HStack(spacing: 16) {
                stat(label: "Rating", value: profile.ratingCount == 0 ? "—" : String(format: "%.1f", profile.avgRating))
                stat(label: "Reviews", value: "\(profile.ratingCount)")
                stat(label: "Hourly", value: formatCurrency(profile.hourlyRateCents))
            }
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    private func stat(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            Text(value).font(.captureBodyStrong).foregroundStyle(Color.captureInk)
        }
    }

    private var servicesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Services").font(.captureSectionHeader).foregroundStyle(Color.captureInk)
                Spacer()
                Button { showAddService = true } label: {
                    Image(systemName: "plus.circle.fill").font(.system(size: 22)).foregroundStyle(Color.captureBlue)
                }
            }
            if vm.services.isEmpty {
                Text("Add at least one service so customers can book you.")
                    .font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            } else {
                ForEach(vm.services) { service in
                    serviceRow(service: service)
                }
            }
        }
    }

    private func serviceRow(service: OwnedService) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(service.title).font(.captureBodyStrong).foregroundStyle(Color.captureInk)
                Text("\(service.durationMinutes) min · \(service.category)")
                    .font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            }
            Spacer()
            Text(formatCurrency(service.priceCents))
                .font(.captureBodyStrong).foregroundStyle(Color.capturePriceInk)
            Button { Task { await vm.deleteService(id: service.id) } } label: {
                Image(systemName: "trash").foregroundStyle(Color.captureInkMuted)
            }
        }
        .padding(14)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    private var availabilitySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Availability").font(.captureSectionHeader).foregroundStyle(Color.captureInk)
                Spacer()
                Button { showAddSlots = true } label: {
                    Image(systemName: "plus.circle.fill").font(.system(size: 22)).foregroundStyle(Color.captureBlue)
                }
            }
            if vm.slots.isEmpty {
                Text("Add open slots and customers can book them instantly.")
                    .font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            } else {
                ForEach(vm.slots) { slot in
                    slotRow(slot: slot)
                }
            }
        }
    }

    private func slotRow(slot: OwnedSlot) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(slot.startsAt, style: .date).font(.captureBodyStrong).foregroundStyle(Color.captureInk)
                Text("\(slot.startsAt, style: .time) – \(slot.endsAt, style: .time)")
                    .font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            }
            Spacer()
            Button { Task { await vm.deleteSlot(id: slot.id) } } label: {
                Image(systemName: "trash").foregroundStyle(Color.captureInkMuted)
            }
        }
        .padding(14)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }
}

// MARK: - Edit sheets

private struct ServiceEditSheet: View {
    let onSave: (ServiceUpsert) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var description = ""
    @State private var durationMinutes = 60
    @State private var priceDollars = "150"
    @State private var category = "portrait"

    private let categories = ["portrait", "wedding", "wedding_video", "event", "family", "headshot", "other"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Service") {
                    TextField("Title", text: $title)
                    TextField("Description (optional)", text: $description, axis: .vertical).lineLimit(3...)
                    Picker("Category", selection: $category) {
                        ForEach(categories, id: \.self) { Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0) }
                    }
                    Stepper("Duration: \(durationMinutes) min", value: $durationMinutes, in: 15...480, step: 15)
                    HStack {
                        Text("Price ($)")
                        Spacer()
                        TextField("150", text: $priceDollars).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                    }
                }
            }
            .navigationTitle("New service")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let cents = (Int(priceDollars) ?? 0) * 100
                        onSave(ServiceUpsert(
                            title: title,
                            description: description.isEmpty ? nil : description,
                            durationMinutes: durationMinutes,
                            priceCents: cents,
                            category: category,
                            active: true,
                        ))
                    }
                    .disabled(title.isEmpty || (Int(priceDollars) ?? 0) == 0)
                }
            }
        }
    }
}

private struct SlotsAddSheet: View {
    let timezone: String
    let onSave: ([CreateSlotsBody.SlotInput]) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date().addingTimeInterval(60 * 60 * 24)
    @State private var startTime = Calendar.current.date(bySettingHour: 10, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var durationMinutes = 60

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("Day", selection: $date, displayedComponents: .date)
                DatePicker("Start", selection: $startTime, displayedComponents: .hourAndMinute)
                Stepper("Duration: \(durationMinutes) min", value: $durationMinutes, in: 15...480, step: 15)
                Text("Times are in your local timezone (\(timezone)).")
                    .font(.captureCaption).foregroundStyle(Color.captureInkMuted)
            }
            .navigationTitle("Add slot")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        let cal = Calendar.current
                        let day = cal.dateComponents([.year, .month, .day], from: date)
                        let time = cal.dateComponents([.hour, .minute], from: startTime)
                        var combined = DateComponents()
                        combined.year = day.year
                        combined.month = day.month
                        combined.day = day.day
                        combined.hour = time.hour
                        combined.minute = time.minute
                        guard let starts = cal.date(from: combined) else { return }
                        let ends = starts.addingTimeInterval(TimeInterval(durationMinutes * 60))
                        onSave([CreateSlotsBody.SlotInput(startsAt: starts, endsAt: ends)])
                    }
                }
            }
        }
    }
}

private struct ProfileEditSheet: View {
    let profile: PhotographerMe
    let onSave: (PhotographerProfilePatch) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var bio: String
    @State private var homeCity: String
    @State private var hourlyDollars: String

    init(profile: PhotographerMe, onSave: @escaping (PhotographerProfilePatch) -> Void) {
        self.profile = profile
        self.onSave = onSave
        _bio = State(initialValue: profile.bio ?? "")
        _homeCity = State(initialValue: profile.homeCity)
        _hourlyDollars = State(initialValue: String(profile.hourlyRateCents / 100))
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Home city", text: $homeCity)
                TextField("Bio", text: $bio, axis: .vertical).lineLimit(4...)
                HStack {
                    Text("Hourly rate ($)")
                    Spacer()
                    TextField("150", text: $hourlyDollars).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                }
            }
            .navigationTitle("Edit profile")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        var patch = PhotographerProfilePatch()
                        patch.homeCity = homeCity
                        patch.bio = bio.isEmpty ? nil : bio
                        if let hourly = Int(hourlyDollars) { patch.hourlyRateCents = hourly * 100 }
                        onSave(patch)
                    }
                }
            }
        }
    }
}
