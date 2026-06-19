// swift-tools-version:5.9
import PackageDescription

// 성경 리더 공유 코어 — 플랫폼 무관(Foundation only): 초성 검색·모델·API 클라이언트·로컬 저장.
// 웹(chosung.ts)과 동일 알고리즘을 Swift 로 포팅. SwiftUI 앱 타깃이 이 패키지를 의존.
let package = Package(
    name: "BibleReaderCore",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "BibleReaderCore", targets: ["BibleReaderCore"]),
    ],
    targets: [
        .target(name: "BibleReaderCore"),
        .testTarget(name: "BibleReaderCoreTests", dependencies: ["BibleReaderCore"]),
    ]
)
