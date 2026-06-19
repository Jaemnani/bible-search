import SwiftUI

// 앱 진입점. App API 베이스 URL — 배포된 웹 API(리더/AI/오디오/미디어 계약) 기본값. 필요 시 교체.
enum Config {
    static let baseURL = "https://bible-search.vercel.app"
}

@main
struct BibleReaderApp: App {
    var body: some Scene {
        WindowGroup {
            ReaderView()
        }
    }
}
