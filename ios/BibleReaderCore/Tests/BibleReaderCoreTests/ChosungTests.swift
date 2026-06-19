import XCTest
@testable import BibleReaderCore

final class ChosungTests: XCTestCase {
    func testToChosung() {
        XCTAssertEqual(Chosung.toChosung("하나님"), "ㅎㄴㄴ")
        XCTAssertEqual(Chosung.toChosung("천지"), "ㅊㅈ")
        XCTAssertEqual(Chosung.toChosung("태초에 하나님이"), "ㅌㅊㅇ ㅎㄴㄴㅇ")
        XCTAssertEqual(Chosung.toChosung("예수 그리스도"), "ㅇㅅ ㄱㄹㅅㄷ")
        XCTAssertEqual(Chosung.toChosung("ㅎㄴㄴ"), "ㅎㄴㄴ") // 호환 자음 통과
    }

    func testMatches() {
        XCTAssertTrue(Chosung.matches(query: "ㅎㄴㄴ", target: "태초에 하나님이"))
        XCTAssertTrue(Chosung.matches(query: "하나님", target: "태초에 하나님이"))
        XCTAssertTrue(Chosung.matches(query: "ㅊㅈ", target: "천지를 창조하시니라"))
        XCTAssertFalse(Chosung.matches(query: "ㅋㅋㅋ", target: "태초에 하나님이"))
        XCTAssertFalse(Chosung.matches(query: "", target: "아무거나"))
    }

    func testIsChosungQuery() {
        XCTAssertTrue(Chosung.isChosungQuery("ㅎㄴㄴ"))
        XCTAssertFalse(Chosung.isChosungQuery("하나님"))
    }

    func testModelDecoding() throws {
        let json = """
        {"book_en":"Genesis","book_ko":"창세기","chapter":1,
         "verses":[{"key":"Genesis:1:1","book_en":"Genesis","book_ko":"창세기","chapter":1,"verse":1,"ko":"태초에","en":"In the beginning"}]}
        """.data(using: .utf8)!
        let ch = try JSONDecoder().decode(ChapterResponse.self, from: json)
        XCTAssertEqual(ch.verses.count, 1)
        XCTAssertEqual(ch.verses[0].key, "Genesis:1:1")
    }
}
