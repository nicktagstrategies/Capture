import Foundation

enum APIError: Error, LocalizedError {
    case badStatus(Int, String?)
    case decoding(Error)
    case transport(Error)
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .badStatus(let code, let body): "Request failed (\(code)) \(body ?? "")"
        case .decoding(let err): "Decode failed: \(err.localizedDescription)"
        case .transport(let err): "Network error: \(err.localizedDescription)"
        case .unauthorized: "Please sign in again."
        }
    }
}

/// Very small HTTP client. Appends `Authorization: Bearer <token>` when a
/// SessionStore is provided, and retries once after refreshing on 401.
final class APIClient {
    static let shared = APIClient()

    let baseURL: URL
    weak var session: SessionStore?

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        d.keyDecodingStrategy = .useDefaultKeys
        return d
    }()

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    init(baseURL: URL = URL(string: Config.apiBaseURL)!) {
        self.baseURL = baseURL
    }

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await perform(request(path: path, method: "GET", query: query))
    }

    func post<Body: Encodable, T: Decodable>(
        _ path: String,
        body: Body,
        headers: [String: String] = [:],
    ) async throws -> T {
        var req = request(path: path, method: "POST")
        req.httpBody = try encoder.encode(body)
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        return try await perform(req)
    }

    func patch<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T {
        var req = request(path: path, method: "PATCH")
        req.httpBody = try encoder.encode(body)
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await perform(req)
    }

    func delete<T: Decodable>(_ path: String) async throws -> T {
        try await perform(request(path: path, method: "DELETE"))
    }

    func upload(_ urlString: String, data: Data, mimeType: String) async throws {
        guard let url = URL(string: urlString) else { throw APIError.badStatus(0, "bad url") }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        req.setValue(mimeType, forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        let (_, response) = try await URLSession.shared.upload(for: req, from: data)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.badStatus((response as? HTTPURLResponse)?.statusCode ?? 0, nil)
        }
    }

    private func request(path: String, method: String, query: [URLQueryItem] = []) -> URLRequest {
        var comps = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { comps.queryItems = query }
        var req = URLRequest(url: comps.url!)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = session?.accessToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return req
    }

    private func perform<T: Decodable>(_ request: URLRequest, retried: Bool = false) async throws -> T {
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.badStatus(0, nil)
        }
        if http.statusCode == 401 {
            if !retried, let session, await session.refreshIfPossible() {
                var retry = request
                if let token = session.accessToken {
                    retry.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                }
                return try await perform(retry, retried: true)
            }
            throw APIError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.badStatus(http.statusCode, String(data: data, encoding: .utf8))
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }
}
