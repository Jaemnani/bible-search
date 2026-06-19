# bible-reader Android (Kotlin + Jetpack Compose) — 껍데기

플랫폼별 네이티브 중 Android. iOS와 **동일 App API 계약·동일 초성 알고리즘·동일 기능**.
요즘 표준대로 **Kotlin + Jetpack Compose**(자바 아님). Compose Canvas/PencilKit 대응 자유낙서는 후속.

## 구성
- `app/src/main/java/com/biblereader/core/` — 공유 코어(순수 Kotlin/JVM):
  - `Chosung.kt`(웹·iOS 동일 알고리즘) · `Models.kt`(@Serializable) · `ApiClient.kt`(HttpURLConnection+kotlinx.serialization) · `LocalStore.kt`(SharedPreferences, updated/deleted 동기화 대비)
- `ui/ReaderScreen.kt` — Compose: 장 읽기·책 드롭다운·이전/다음·하이라이트(로컬)·검색(자음·본문)·절 액션(메모 + AI/듣기/설교·책 껍데기)
- `MainActivity.kt` — 진입점. `API_BASE_URL`(기본: 배포 웹 API).
- Gradle Kotlin DSL + 버전 카탈로그(`gradle/libs.versions.toml`): AGP 8.7 · Kotlin 2.1 · Compose BOM 2024.12.

## 빌드/실행
```bash
# Android Studio(Ladybug+)로 android/ 열기 → Gradle 동기화(Wrapper/SDK 자동 provisioning) → Run.
# 또는 CLI(JDK17 + Android SDK + gradle 설치 시):
cd android && gradle wrapper && ./gradlew :app:assembleDebug   # APK
./gradlew test                                                  # 공유 코어 단위 테스트(초성)
```
> 이 스캐폴드는 Android 툴체인이 없는 환경에서 작성되어 **로컬 컴파일 미검증**입니다.
> Android Studio 에서 Gradle Sync 시 의존성/SDK 가 provisioning 됩니다.

## TODO (android-core)
- **Compose Canvas 자유낙서**(웹 DrawingCanvas / iOS PencilKit 대응) → MinIO 업로드.
- 듣기 플레이어(ElevenLabs url 재생) · "메모하며 듣기"(PiP/분할).
- 동기화: 로그인 → PostgREST push/pull(LWW/tombstone).
- 글꼴/테마/읽던위치, 책/장/절+초성 네비 고도화.
