import SwiftUI
import BibleReaderCore

private let HL_COLORS: [String: Color] = [
    "yellow": Color(red: 0.99, green: 0.90, blue: 0.54),
    "green": Color(red: 0.73, green: 0.97, blue: 0.82),
    "blue": Color(red: 0.75, green: 0.86, blue: 0.99),
    "pink": Color(red: 0.98, green: 0.81, blue: 0.91),
    "orange": Color(red: 0.99, green: 0.84, blue: 0.67),
]
private let HL_ORDER = ["yellow", "green", "blue", "pink", "orange"]

@MainActor
final class ReaderViewModel: ObservableObject {
    @Published var books: [BookMeta] = []
    @Published var verses: [ReaderVerse] = []
    @Published var bookEn = "Genesis"
    @Published var bookKo = "창세기"
    @Published var chapter = 1
    @Published var loading = false
    @Published var highlights: [String: HighlightRec] = [:]

    let api = APIClient(baseURL: URL(string: Config.baseURL)!)
    let store = LocalStore()

    init() {
        highlights = store.highlights()
        Task { await loadBooks(); await load() }
    }

    func loadBooks() async {
        guard let url = URL(string: Config.baseURL + "/data/books_index.json") else { return }
        if let (data, _) = try? await URLSession.shared.data(from: url),
           let bs = try? JSONDecoder().decode([BookMeta].self, from: data) {
            books = bs
        }
    }

    func load() async {
        loading = true
        defer { loading = false }
        if let resp = try? await api.chapter(book: bookEn, chapter: chapter) {
            verses = resp.verses
            bookKo = resp.book_ko
        }
    }

    func goTo(bookEn: String, bookKo: String, chapter: Int) {
        self.bookEn = bookEn; self.bookKo = bookKo; self.chapter = chapter
        Task { await load() }
    }

    func step(_ dir: Int) {
        guard let b = books.first(where: { $0.book_en == bookEn }),
              let idx = books.firstIndex(where: { $0.book_en == bookEn }) else {
            goTo(bookEn: bookEn, bookKo: bookKo, chapter: max(1, chapter + dir)); return
        }
        var ci = idx, ch = chapter + dir
        if ch < 1 { ci -= 1; if ci < 0 { return }; ch = books[ci].chapter_count }
        else if ch > b.chapter_count { ci += 1; if ci >= books.count { return }; ch = 1 }
        goTo(bookEn: books[ci].book_en, bookKo: books[ci].book_ko, chapter: ch)
    }

    func setHighlight(_ ref: String, _ color: String?) {
        store.setHighlight(ref, color: color)
        highlights = store.highlights()
    }
    func color(for ref: String) -> Color? {
        guard let rec = highlights[ref], !rec.deleted else { return nil }
        return HL_COLORS[rec.color]
    }
}

struct ReaderView: View {
    @StateObject private var vm = ReaderViewModel()
    @State private var selected: ReaderVerse?
    @State private var showSearch = false

    var body: some View {
        NavigationStack {
            Group {
                if vm.loading {
                    ProgressView()
                } else {
                    List(vm.verses) { v in
                        HStack(alignment: .top, spacing: 6) {
                            Text("\(v.verse)").font(.caption2).foregroundStyle(.secondary).frame(minWidth: 18, alignment: .trailing)
                            Text(v.ko).font(.system(size: 18)).lineSpacing(4)
                        }
                        .listRowBackground(vm.color(for: v.key) ?? Color(.systemBackground))
                        .contentShape(Rectangle())
                        .onTapGesture { selected = v }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("\(vm.bookKo) \(vm.chapter)장")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        ForEach(vm.books) { b in
                            Button(b.book_ko) { vm.goTo(bookEn: b.book_en, bookKo: b.book_ko, chapter: 1) }
                        }
                    } label: { Image(systemName: "book") }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { showSearch = true } label: { Image(systemName: "magnifyingglass") }
                    Button { vm.step(-1) } label: { Image(systemName: "chevron.left") }
                    Button { vm.step(1) } label: { Image(systemName: "chevron.right") }
                }
            }
            .sheet(item: $selected) { v in VerseActionView(verse: v, vm: vm) }
            .sheet(isPresented: $showSearch) {
                SearchView(api: vm.api) { hit in
                    vm.goTo(bookEn: hit.book_en, bookKo: hit.book_ko, chapter: hit.chapter)
                    showSearch = false
                }
            }
        }
    }
}

// 절 액션: 하이라이트 + 메모 + AI/듣기/설교·책(껍데기 — API 호출 후 메시지)
struct VerseActionView: View {
    let verse: ReaderVerse
    @ObservedObject var vm: ReaderViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var showMemo = false
    @State private var memo = ""
    @State private var info: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section(verse.ko) {
                    HStack {
                        ForEach(HL_ORDER, id: \.self) { c in
                            Circle().fill(HL_COLORS[c]!).frame(width: 26, height: 26)
                                .overlay(Circle().stroke(.primary.opacity(vm.highlights[verse.key]?.color == c ? 0.7 : 0), lineWidth: 2))
                                .onTapGesture {
                                    let cur = vm.highlights[verse.key]?.color
                                    vm.setHighlight(verse.key, cur == c ? nil : c)
                                }
                        }
                    }
                }
                Section {
                    Button { memo = vm.store.notes()[verse.key]?.md ?? ""; showMemo = true } label: { Label("메모", systemImage: "note.text") }
                    Button { call { try await vm.api.aiAsk(verseRef: verse.key, question: "이 구절의 의미는?").message } } label: { Label("AI 질문", systemImage: "sparkles") }
                    Button { call { try await vm.api.aiCrossCheck(verseRef: verse.key).message } } label: { Label("AI 교차검증", systemImage: "scalemass") }
                    Button { call { try await vm.api.audio(verseRef: verse.key).message } } label: { Label("말씀 듣기", systemImage: "headphones") }
                    Button { call { try await vm.api.media(verseRef: verse.key).message } } label: { Label("설교·책", systemImage: "play.rectangle") }
                }
                if busy { ProgressView() }
                if let info { Section { Text(info).font(.footnote).foregroundStyle(.secondary) } }
            }
            .navigationTitle("\(verse.book_ko) \(verse.chapter):\(verse.verse)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("닫기") { dismiss() } } }
            .sheet(isPresented: $showMemo) {
                NavigationStack {
                    TextEditor(text: $memo)
                        .padding()
                        .navigationTitle("메모")
                        .toolbar { ToolbarItem(placement: .topBarTrailing) {
                            Button("저장") { vm.store.setNote(verse.key, md: memo); showMemo = false }
                        } }
                }
            }
        }
    }

    private func call(_ op: @escaping () async throws -> String?) {
        busy = true; info = nil
        Task {
            let msg = (try? await op()) ?? "요청 실패"
            await MainActor.run { info = msg ?? "응답 없음"; busy = false }
        }
    }
}

// 자음/본문 검색
struct SearchView: View {
    let api: APIClient
    let onPick: (VerseHit) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var q = ""
    @State private var hits: [VerseHit] = []
    @State private var searching = false

    var body: some View {
        NavigationStack {
            VStack {
                HStack {
                    TextField("예: ㅎㄴㄴ, 하나님, 사랑은", text: $q)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit(run)
                    Button("검색", action: run)
                }.padding()
                if searching { ProgressView() }
                List(hits) { h in
                    Button { onPick(h) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(h.book_ko) \(h.chapter):\(h.verse)").font(.caption).foregroundStyle(.tint)
                            Text(h.ko).font(.subheadline).foregroundStyle(.primary)
                        }
                    }
                }.listStyle(.plain)
            }
            .navigationTitle("검색 (자음·본문)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("닫기") { dismiss() } } }
        }
    }

    private func run() {
        let t = q.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        searching = true
        Task {
            let resp = try? await api.search(t)
            await MainActor.run { hits = resp?.hits ?? []; searching = false }
        }
    }
}
