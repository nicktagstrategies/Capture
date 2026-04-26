import Foundation
import Sentry
import PostHog

/// Wires up Sentry (crash + error reporting) and PostHog (product analytics).
/// Both are env-keyed and no-op when keys are absent so dev builds don't
/// pollute real projects.
enum Observability {
    static func bootstrap() {
        configureSentry()
        configurePostHog()
    }

    private static func configureSentry() {
        guard let dsn = Bundle.main.infoDictionary?["SENTRY_DSN"] as? String, !dsn.isEmpty else {
            return
        }
        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = appEnvironment
            options.releaseName = appRelease
            options.tracesSampleRate = appEnvironment == "production" ? 0.1 : 1.0
            options.enableAutoPerformanceTracing = true
        }
    }

    private static func configurePostHog() {
        guard let key = Bundle.main.infoDictionary?["POSTHOG_API_KEY"] as? String, !key.isEmpty else {
            return
        }
        let host = Bundle.main.infoDictionary?["POSTHOG_HOST"] as? String ?? "https://us.i.posthog.com"
        let config = PostHogConfig(apiKey: key, host: host)
        config.captureApplicationLifecycleEvents = true
        config.captureScreenViews = false // we'll instrument these explicitly
        PostHogSDK.shared.setup(config)
    }

    private static var appEnvironment: String {
        #if DEBUG
        "development"
        #else
        (Bundle.main.infoDictionary?["APP_ENVIRONMENT"] as? String) ?? "production"
        #endif
    }

    private static var appRelease: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        return "capture-ios@\(version)+\(build)"
    }
}

/// Funnel events. Add cases as we instrument new flows. Keeping them here
/// (rather than scattering string literals) prevents accidental rename drift
/// across the codebase and surfaces the funnel at a glance.
enum AnalyticsEvent: String {
    case appOpened = "app_opened"
    case authCompleted = "auth_completed"
    case homeViewed = "home_viewed"
    case searchPerformed = "search_performed"
    case photographerOpened = "photographer_opened"
    case bookingStarted = "booking_started"
    case bookingPaymentSheetPresented = "booking_payment_sheet_presented"
    case bookingCompleted = "booking_completed"
    case bookingCancelled = "booking_cancelled"
    case voucherSent = "voucher_sent"
    case voucherRedeemed = "voucher_redeemed"
    case galleryOpened = "gallery_opened"
    case sharedGalleryLink = "shared_gallery_link"
    case supportTicketSubmitted = "support_ticket_submitted"
    case messageSent = "message_sent"
    case tipStarted = "tip_started"
    case tipCompleted = "tip_completed"
    case referralCodeShared = "referral_code_shared"
    case referralCodeClaimed = "referral_code_claimed"
    case reviewSubmitted = "review_submitted"
}

enum Analytics {
    static func capture(_ event: AnalyticsEvent, properties: [String: Any] = [:]) {
        PostHogSDK.shared.capture(event.rawValue, properties: properties)
    }

    static func identify(userId: String, properties: [String: Any] = [:]) {
        PostHogSDK.shared.identify(userId, userProperties: properties)
        SentrySDK.setUser(User(userId: userId))
    }

    static func reset() {
        PostHogSDK.shared.reset()
        SentrySDK.setUser(nil)
    }
}
