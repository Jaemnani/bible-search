import Foundation

/// 공유 App API 클라이언트 — 웹/Android/iOS 가 동일 계약 소비.
/// baseURL 예: https://bible-search.vercel.app  (또는 self-host App API).
public struct APIClient {
    public let baseURL: URL
    private let session: URLSession

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    enum APIError: Error { case badStatus(Int) }

    // --- 리더 ---
    public func chapter(book: String, chapter: Int) async throws -> ChapterResponse {
        try await get("/api/reader/chapter", query: ["book": book, "chapter": String(chapter)])
    }

    public func search(_ q: String) async throws -> SearchResponse {
        try await get("/api/reader/search", query: ["q": q])
    }

    // --- AI (P3 껍데기) ---
    public func aiAsk(verseRef: String, question: String) async throws -> AIResponse {
        try await post("/api/ai/ask", body: ["verseRef": verseRef, "question": question])
    }
    public func aiCrossCheck(verseRef: String, prompt: String = "") async throws -> AIResponse {
        try await post("/api/ai/cross-check", body: ["verseRef": verseRef, "prompt": prompt])
    }

    // --- 오디오 (P4 껍데기) ---
    public func audio(verseRef: String, voice: String = "default") async throws -> AudioResponse {
        try await get("/api/audio", query: ["verseRef": verseRef, "voice": voice])
    }

    // --- 구절 미디어 (P5 껍데기) ---
    public func media(verseRef: String) async throws -> MediaResponse {
        try await get("/api/verse-media", query: ["verseRef": verseRef])
    }

    // --- 내부 ---
    private func get<T: Decodable>(_ path: String, query: [String: String]) async throws -> T {
        var comp = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        comp.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        let (data, resp) = try await session.data(from: comp.url!)
        try Self.check(resp)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func post<T: Decodable>(_ path: String, body: [String: String]) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await session.data(for: req)
        try Self.check(resp)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private static func check(_ resp: URLResponse) throws {
        if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw APIError.badStatus(http.statusCode)
        }
    }
}
