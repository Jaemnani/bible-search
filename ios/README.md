# bible-reader iOS (SwiftUI) — 껍데기

플랫폼별 네이티브 중 iOS. **공유 코어(Swift 패키지) + SwiftUI 앱 껍데기**.
공유 계층 = 백엔드 App API 계약 + 성경 데이터. (Android 도 동일 계약 소비.)

## 구성
- `BibleReaderCore/` — 플랫폼 무관 Swift 패키지(Foundation only):
  - `Chosung.swift` — 초성(자음) 검색(웹 `chosung.ts` 와 동일 알고리즘 포팅)
  - `Models.swift` — App API 응답 Codable 모델
  - `APIClient.swift` — `/api/reader|ai|audio|verse-media` 클라이언트
  - `LocalStore.swift` — 하이라이트/노트 로컬 저장(updated/deleted, 동기화 대비)
- `App/` — SwiftUI 앱: `ReaderView`(장 읽기·책 메뉴·이전/다음), 검색(자음·본문), 절 액션(하이라이트·메모·AI/듣기/설교·책 껍데기)
- `project.yml` — **XcodeGen** 스펙(소스of truth). `.xcodeproj` 는 생성물(gitignore).

## 빌드/실행
```bash
brew install xcodegen          # 최초 1회
cd ios && xcodegen generate    # project.yml → BibleReader.xcodeproj
open BibleReader.xcodeproj     # Xcode 에서 실행(⌘R), 또는:
xcodebuild -project BibleReader.xcodeproj -scheme BibleReader \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build

# 공유 코어 단위 테스트(초성 패리티 등)
cd BibleReaderCore && swift test
```
- App API 베이스 URL 은 `App/BibleReaderApp.swift` 의 `Config.baseURL`
  (기본: 배포된 웹 API `https://bible-search.vercel.app` — 리더/AI/오디오/미디어 계약 동일).

## TODO (iOS-core)
- **PencilKit 자유낙서**(웹 DrawingCanvas 대응) — MinIO 업로드.
- **듣기 플레이어**(ElevenLabs url 재생) + 백그라운드/PiP, "메모하며 듣기".
- **동기화**: 로그인(Sign in with Apple) → PostgREST push/pull(LWW/tombstone).
- AI 질문/교차검증·설교·책: 현재 API 껍데기(coming_soon) — 코어 구현 후 자동 표시.
- 책/장/절 + 초성 네비 고도화, 글꼴/테마/읽던위치.
