import Foundation

/// 한글 초성(자음) 검색 — 웹 `src/lib/chosung.ts` 와 동일 알고리즘의 Swift 포팅.
/// 카테고리/책/장/절 본문 자음검색의 공유 spec. (네이티브는 파생 파일 대신 알고리즘을 공유.)
public enum Chosung {
    // 한글 음절 초성 19자 (유니코드 음절 분해 순서)
    private static let cho: [Character] = [
        "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
        "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
    ]
    private static let base: UInt32 = 0xAC00
    private static let last: UInt32 = 0xD7A3
    private static let compatConsonants: Set<Character> = Set("ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ")

    /// 한글 음절→초성, 호환 자음→그대로, 공백→공백, 그 외→제거. 다중 공백 1개로.
    public static func toChosung(_ text: String) -> String {
        var out = ""
        for ch in text {
            if let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1,
               scalar.value >= base, scalar.value <= last {
                out.append(cho[Int((scalar.value - base) / 588)])
            } else if compatConsonants.contains(ch) {
                out.append(ch)
            } else if ch.isWhitespace {
                out.append(" ")
            }
            // 그 외(구두점·라틴·숫자)는 초성검색 대상 아님 → 제거
        }
        return out.split(separator: " ").joined(separator: " ")
    }

    /// 쿼리가 '초성/자음 위주'인지 — 자음검색 모드 판별.
    public static func isChosungQuery(_ q: String) -> Bool {
        var compat = 0, syllable = 0
        for ch in q {
            if compatConsonants.contains(ch) { compat += 1 }
            else if let s = ch.unicodeScalars.first, ch.unicodeScalars.count == 1,
                    s.value >= base, s.value <= last { syllable += 1 }
        }
        return compat > 0 && compat >= syllable
    }

    /// 초성 부분일치(공백 무시, substring). targetChosung 미리 계산해 두면 반복 비용 절약.
    public static func matches(query: String, target: String, targetChosung: String? = nil) -> Bool {
        let q = toChosung(query).replacingOccurrences(of: " ", with: "")
        if q.isEmpty { return false }
        let t = (targetChosung ?? toChosung(target)).replacingOccurrences(of: " ", with: "")
        return t.contains(q)
    }
}
