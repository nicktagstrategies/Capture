import Foundation
import Observation
import Security

enum SessionState: Equatable {
    case unknown
    case signedOut
    case signedIn(SessionUser)
}

@Observable
final class SessionStore {
    private(set) var state: SessionState = .unknown
    private(set) var accessToken: String?
    private var refreshToken: String?

    init() {
        APIClient.shared.session = self
    }

    // MARK: - Restore / sign in / out

    @MainActor
    func restore() async {
        guard let refresh = Keychain.read(key: .refreshToken) else {
            state = .signedOut
            return
        }
        refreshToken = refresh
        if await refreshIfPossible() {
            // After refresh we fetch the current user via /auth/me — for now fake a minimal user
            // until that endpoint exists.
            state = .signedOut
        } else {
            state = .signedOut
        }
    }

    @MainActor
    func apply(session: SessionResponse) {
        accessToken = session.accessToken
        refreshToken = session.refreshToken
        Keychain.write(key: .refreshToken, value: session.refreshToken)
        state = .signedIn(session.user)
    }

    @MainActor
    func signOut() {
        accessToken = nil
        refreshToken = nil
        Keychain.delete(key: .refreshToken)
        state = .signedOut
    }

    func refreshIfPossible() async -> Bool {
        guard let refresh = refreshToken ?? Keychain.read(key: .refreshToken) else { return false }
        struct Body: Encodable { let refreshToken: String }
        do {
            let response: TokenPairResponse = try await APIClient.shared.post(
                "/auth/refresh",
                body: Body(refreshToken: refresh),
            )
            await MainActor.run {
                self.accessToken = response.accessToken
                self.refreshToken = response.refreshToken
                Keychain.write(key: .refreshToken, value: response.refreshToken)
            }
            return true
        } catch {
            return false
        }
    }
}

// MARK: - Keychain helper

enum KeychainKey: String {
    case refreshToken = "capture.refresh"
}

enum Keychain {
    static func write(key: KeychainKey, value: String) {
        delete(key: key)
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    static func read(key: KeychainKey) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(key: KeychainKey) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
