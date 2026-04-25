import Foundation

enum Config {
    /// Override with `-CaptureAPIBaseURL https://api.example.com` at runtime for staging.
    static var apiBaseURL: String {
        if let override = UserDefaults.standard.string(forKey: "CaptureAPIBaseURL") {
            return override
        }
        #if DEBUG
        return "http://localhost:3000"
        #else
        return "https://api.capture.app"
        #endif
    }

    /// Fetched from `/config` at launch; default matches server defaults.
    static var stripePublishableKey: String = "pk_test_placeholder"
}
