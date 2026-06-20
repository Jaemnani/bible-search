# bible-reader 백엔드 (self-host: Postgres · PostgREST · MinIO · Caddy)

성경 리더의 **사용자 데이터 동기화(하이라이트·노트·낙서)** + **전역 캐시(TTS 오디오·구절 미디어)** 를
NAS에서 호스팅. `auction/deploy/synology` 스택 재사용. 본문/검색/AI는 별도 App API(웹 repo)가 담당.

## 구성
- `db` Postgres 16 · `rest` PostgREST(`/rest/v1/*`) · `auth` GoTrue(`/auth/v1/*`) · `storage` MinIO(`/storage/*`) · `proxy` Caddy(`:8081`)
- 포트는 auction(8080/9000/9001/5050)과 안 겹치게: **proxy 8081 · MinIO 9100/9101 · pgAdmin 5051**
- 인증: GoTrue 가 동일 `JWT_SECRET` 으로 `{role:authenticated, sub:<uuid>}` 토큰 발급 → PostgREST 검증 + RLS `auth.uid()`.
  supabase-js 가 `${SUPABASE_URL}/auth/v1/*`(로그인)·`/rest/v1/*`(데이터) 호출. OAuth(구글/애플)는 `.env` 에서 활성화.

## 셋업
```bash
cp .env.example .env            # 비밀번호 채우기: openssl rand -base64 24 (JWT_SECRET 은 -base64 48)
# bootstrap 의 authenticator 비번을 .env 와 동기화 (NAS=Linux: sed -i, macOS: sed -i ''):
sed -i "s/CHANGE_ME_SAME_AS_ENV/$(grep ^AUTHENTICATOR_PASSWORD= .env | cut -d= -f2-)/" bootstrap/00_roles.sql

# bind-mount 디렉터리 먼저 생성 (compose 가 자동 생성 안 함 — git 제외됨. 없으면 "Bind mount failed")
mkdir -p volumes/db/data volumes/storage volumes/caddy/data volumes/caddy/config

docker compose up -d
docker compose ps                # db/auth/rest/storage/proxy 정상 확인
bash apply-migrations.sh         # 스키마 + RLS 적용

node gen-keys.mjs "$(grep ^JWT_SECRET= .env | cut -d= -f2-)"   # ANON_KEY / SERVICE_KEY 발급
```

### MinIO 버킷
```bash
# bible-audio: TTS 오디오 — 공개 read 가능
# bible-notes: 사용자 낙서 — 비공개(개인 데이터) → 서명 URL/인증 프록시로만 접근(추후)
docker run --rm --network backend_internal --entrypoint /bin/sh \
  -e MC_HOST_local="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@bible-minio:9000" minio/mc -c "
    mc mb -p local/bible-audio local/bible-notes &&
    mc anonymous set download local/bible-audio
  "   # bible-notes 는 공개 설정하지 않음(비공개 유지)
```

## 검증
```bash
ANON="<ANON_KEY>"
curl -H "Authorization: Bearer $ANON" "http://<NAS_IP>:8081/rest/v1/verse_media?limit=1"   # [] = 정상(빈 데이터)
curl -s -o /dev/null -w "%{http_code}\n" http://<NAS_IP>:8081/health                          # 200
# 사용자별 테이블은 authenticated JWT(sub=user) 없이는 0행(RLS) — 정상.
```

## 환경변수 (App API / 클라이언트가 쓰는 값)
| 키 | 용도 | 노출 |
|---|---|---|
| `SUPABASE_URL` | `http://<NAS_IP>:8081` (내부) / `https://<DOMAIN>` (외부) | 공개 |
| `SUPABASE_KEY` (ANON_KEY) | 공개 read + RLS | 공개 |
| `SUPABASE_SERVICE_KEY` | 서버/크롤러 적재(RLS 우회) | **서버 전용** |
| `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | 낙서·오디오 업로드 | 서버 전용 |
| `STORAGE_PUBLIC_URL` | `https://<DOMAIN>/storage` | 공개 |

## 남은 코어
- **동기화 클라이언트**(다음 슬라이스): 웹/네이티브가 로그인 토큰으로 로컬 레코드를 PostgREST 로
  push/pull(updated_at LWW + deleted tombstone). supabase-js `createClient(SUPABASE_URL, ANON_KEY)`
  로 `.auth`(GoTrue) + `.from()`(PostgREST) 사용.
- **OAuth 설정**: 구글/애플 클라이언트 키 발급 → `.env` 활성화 + redirect URL 등록. iOS 는 Apple 필수.
- 백업: `pg_dump` + MinIO 볼륨(docs 02/06).
