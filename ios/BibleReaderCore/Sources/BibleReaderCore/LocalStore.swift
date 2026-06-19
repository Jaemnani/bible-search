import Foundation

/// 로컬 우선 주석 저장 — 불변 절-ID 키잉 + updated/deleted(추후 NAS 동기화 LWW/tombstone 대비).
/// 웹 readerStore.ts 와 동일 개념. UserDefaults 백엔드(Foundation only).

public struct HighlightRec: Codable, Equatable {
    public var color: String
    public var updated: Double   // epoch ms
    public var deleted: Bool
    public init(color: String, updated: Double = Date().timeIntervalSince1970 * 1000, deleted: Bool = false) {
        self.color = color; self.updated = updated; self.deleted = deleted
    }
}

public struct NoteRec: Codable, Equatable {
    public var md: String
    public var updated: Double
    public var deleted: Bool
    public init(md: String, updated: Double = Date().timeIntervalSince1970 * 1000, deleted: Bool = false) {
        self.md = md; self.updated = updated; self.deleted = deleted
    }
}

public final class LocalStore {
    private let defaults: UserDefaults
    private let hlKey = "bible.reader.highlights"
    private let noteKey = "bible.reader.notes"

    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    // 하이라이트
    public func highlights() -> [String: HighlightRec] { load(hlKey) }
    public func setHighlight(_ verseRef: String, color: String?) {
        var m = highlights()
        if let color { m[verseRef] = HighlightRec(color: color) } else { m.removeValue(forKey: verseRef) }
        save(hlKey, m)
    }

    // 노트(.md)
    public func notes() -> [String: NoteRec] { load(noteKey) }
    public func setNote(_ verseRef: String, md: String?) {
        var m = notes()
        if let md, !md.isEmpty { m[verseRef] = NoteRec(md: md) } else { m.removeValue(forKey: verseRef) }
        save(noteKey, m)
    }

    private func load<T: Decodable>(_ key: String) -> [String: T] {
        guard let data = defaults.data(forKey: key),
              let m = try? JSONDecoder().decode([String: T].self, from: data) else { return [:] }
        return m
    }
    private func save<T: Encodable>(_ key: String, _ value: [String: T]) {
        if let data = try? JSONEncoder().encode(value) { defaults.set(data, forKey: key) }
    }
}
