// 순수 LWW(Last-Write-Wins) 동기화 계획 — 의존성 없음(단독 테스트 가능).
// 로컬 updated(ms) 맵 + 원격 행 → 로컬에 적용할 것(pull) / 서버로 올릴 것(push).

export interface RemoteRow {
  verse_ref: string;
  updated_ms: number;
  deleted: boolean;
}

export interface SyncPlan {
  pull: { ref: string; deleted: boolean }[]; // 서버가 최신 → 로컬 반영(삭제 포함)
  push: string[];                            // 로컬이 최신 → 서버 upsert
}

export function planSync(localUpdated: Record<string, number>, remote: RemoteRow[]): SyncPlan {
  const remoteMap = new Map<string, RemoteRow>();
  for (const r of remote) remoteMap.set(r.verse_ref, r);

  const pull: { ref: string; deleted: boolean }[] = [];
  for (const r of remote) {
    const lu = localUpdated[r.verse_ref] ?? 0;
    if (r.updated_ms > lu) pull.push({ ref: r.verse_ref, deleted: r.deleted });
  }

  const push: string[] = [];
  for (const ref of Object.keys(localUpdated)) {
    const rr = remoteMap.get(ref);
    if (!rr || localUpdated[ref] > rr.updated_ms) push.push(ref);
  }

  return { pull, push };
}
