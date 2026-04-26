import Foundation

// Keep these in lockstep with shared/openapi.yaml. These hand-written types
// will be replaced by OpenAPI codegen once the spec stabilizes.

struct SessionUser: Codable, Identifiable, Hashable {
    let id: String
    let email: String
    let name: String
    let role: String
    let avatarUrl: String?
}

struct SessionResponse: Codable {
    let accessToken: String
    let refreshToken: String
    let user: SessionUser
}

struct TokenPairResponse: Codable {
    let accessToken: String
    let refreshToken: String
}

struct PhotographerCard: Codable, Identifiable, Hashable {
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
    let distanceMeters: Double
}

struct PhotographerSearchResponse: Codable {
    let photographers: [PhotographerCard]
}

struct ServiceDTO: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let description: String?
    let durationMinutes: Int
    let priceCents: Int
    let category: String
}

struct PhotographerDetail: Codable, Identifiable, Hashable {
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
    let services: [ServiceDTO]
}

struct Slot: Codable, Identifiable, Hashable {
    let id: String
    let startsAt: Date
    let endsAt: Date
}

struct SlotsResponse: Codable {
    let slots: [Slot]
}

struct BookingRequest: Codable {
    let serviceId: String
    let slotId: String
    var voucherId: String?
    var bookingAddress: String?
}

struct BookingCreatedResponse: Codable {
    let bookingId: String
    let clientSecret: String
    let totalCents: Int
}

struct BookingSummary: Codable, Identifiable, Hashable {
    struct PhotographerRef: Codable, Hashable {
        let id: String
        let name: String
        let avatarUrl: String?
        let homeCity: String
        let timezone: String
    }
    struct ServiceRef: Codable, Hashable { let title: String }

    let id: String
    let status: String
    let startsAt: Date
    let endsAt: Date
    let totalCents: Int
    let photographer: PhotographerRef
    let service: ServiceRef
    let gallery: GalleryRef?
    let cancelledAt: Date?
    let refundAmountCents: Int?
}

struct GalleryRef: Codable, Hashable {
    let id: String
    let status: String
    let deliveredAt: Date?
}

struct BookingListResponse: Codable {
    let bookings: [BookingSummary]
}

struct RefundPreview: Codable, Hashable {
    let refundCents: Int
    let rule: String
}

struct BookingDetail: Codable, Identifiable, Hashable {
    struct PhotographerRef: Codable, Hashable {
        let id: String
        let name: String
        let avatarUrl: String?
        let homeCity: String
        let timezone: String
    }
    struct ServiceRef: Codable, Hashable {
        let id: String
        let title: String
        let durationMinutes: Int
        let priceCents: Int
    }
    let id: String
    let status: String
    let startsAt: Date
    let endsAt: Date
    let bookingAddress: String?
    let subtotalCents: Int
    let customerFeeCents: Int
    let totalCents: Int
    let refundAmountCents: Int?
    let cancelledAt: Date?
    let cancelledBy: String?
    let photographer: PhotographerRef
    let service: ServiceRef
    let gallery: GalleryRef?
    let refundPreview: RefundPreview
    let role: String
}

struct GalleryItem: Codable, Identifiable, Hashable {
    let id: String
    let mimeType: String
    let width: Int?
    let height: Int?
    let url: String
}

struct GalleryView: Codable, Hashable {
    let id: String
    let status: String
    let portfolioConsent: Bool
    let deliveredAt: Date?
    let bookingId: String
    let role: String
    let items: [GalleryItem]
}

struct ShareLinkResponse: Codable, Hashable {
    let token: String
    let expiresAt: Date?
}

struct Voucher: Codable, Identifiable, Hashable {
    struct SenderRef: Codable, Hashable {
        let id: String
        let name: String
        let avatarUrl: String?
    }

    let id: String
    let percentOff: Int
    let category: String
    let expiresAt: Date
    let note: String?
    let sender: SenderRef
}

struct VouchersResponse: Codable {
    let vouchers: [Voucher]
}

struct ConfigResponse: Codable {
    let stripePublishableKey: String
    let flatCustomerFeeCents: Int
    let commissionRate: Double
}

struct MessageLocation: Codable, Hashable {
    let lat: Double
    let lng: Double
    let expiresAt: Date
}

struct Message: Codable, Identifiable, Hashable {
    let id: String
    let threadId: String?
    let senderId: String
    let body: String?
    let attachmentUrl: String?
    let attachmentMime: String?
    let location: MessageLocation?
    let createdAt: Date
    let readAt: Date?
    let isMine: Bool
}

struct MessageThreadResponse: Codable, Hashable {
    let bookingId: String
    let threadId: String?
    let locked: Bool
    let messages: [Message]
}
