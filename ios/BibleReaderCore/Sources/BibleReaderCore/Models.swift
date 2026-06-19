import Foundation

/// App API(웹 repo의 /api/*) 응답과 1:1 대응하는 Codable 모델.
/// 절 키(verse_ref)는 불변 ID "book_en:chapter:verse".

public struct ReaderVerse: Codable, Identifiable, Hashable {
    public let key: String
    public let book_en: String
    public let book_ko: String
    public let chapter: Int
    public let verse: Int
    public let ko: String
    public let en: String
    public var id: String { key }
}

public struct ChapterResponse: Codable {
    public let book_en: String
    public let book_ko: String
    public let chapter: Int
    public let verses: [ReaderVerse]
}

public struct VerseHit: Codable, Identifiable, Hashable {
    public let key: String
    public let book_ko: String
    public let book_en: String
    public let chapter: Int
    public let verse: Int
    public let ko: String
    public var id: String { key }
}

public struct SearchResponse: Codable {
    public let query: String
    public let hits: [VerseHit]
}

public struct BookMeta: Codable, Identifiable, Hashable {
    public let book_en: String
    public let book_ko: String
    public let testament: String
    public let genre: String
    public let chapter_count: Int
    public let verse_counts: [Int]
    public let verse_total: Int
    public var id: String { book_en }
}

/// AI 질문/교차검증 (P3 껍데기 — status=coming_soon)
public struct AIResponse: Codable {
    public let status: String?
    public let message: String?
    public let answer: String?
}

/// 오디오 (P4 껍데기 — url=nil 동안 coming_soon)
public struct AudioResponse: Codable {
    public let status: String?
    public let url: String?
    public let message: String?
}

/// 구절 미디어 (P5 껍데기)
public struct MediaItem: Codable, Identifiable, Hashable {
    public let type: String
    public let title: String
    public let url: String
    public let source: String?
    public var id: String { url }
}
public struct MediaResponse: Codable {
    public let status: String?
    public let media: [MediaItem]
    public let message: String?
}
