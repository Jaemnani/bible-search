package com.biblereader.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.biblereader.API_BASE_URL
import com.biblereader.core.*
import kotlinx.coroutines.launch

private val HL = mapOf(
    "yellow" to Color(0xFFFDE68A), "green" to Color(0xFFBBF7D0), "blue" to Color(0xFFBFDBFE),
    "pink" to Color(0xFFFBCFE8), "orange" to Color(0xFFFED7AA),
)
private val HL_ORDER = listOf("yellow", "green", "blue", "pink", "orange")

@Composable
fun ReaderScreen() {
    val ctx = LocalContext.current
    val api = remember { ApiClient(API_BASE_URL) }
    val store = remember { LocalStore(ctx) }
    val scope = rememberCoroutineScope()

    var books by remember { mutableStateOf<List<BookMeta>>(emptyList()) }
    var bookEn by remember { mutableStateOf("Genesis") }
    var bookKo by remember { mutableStateOf("창세기") }
    var chapter by remember { mutableIntStateOf(1) }
    var verses by remember { mutableStateOf<List<ReaderVerse>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var highlights by remember { mutableStateOf(store.highlights()) }

    var selected by remember { mutableStateOf<ReaderVerse?>(null) }
    var showSearch by remember { mutableStateOf(false) }
    var bookMenu by remember { mutableStateOf(false) }

    fun loadChapter() {
        scope.launch {
            loading = true
            runCatching { api.chapter(bookEn, chapter) }.getOrNull()?.let {
                verses = it.verses; bookKo = it.book_ko
            }
            loading = false
        }
    }
    LaunchedEffect(Unit) {
        runCatching { api.books() }.getOrNull()?.let { books = it }
    }
    LaunchedEffect(bookEn, chapter) { loadChapter() }

    fun goTo(en: String, ko: String, ch: Int) { bookEn = en; bookKo = ko; chapter = ch }
    fun step(dir: Int) {
        val b = books.firstOrNull { it.book_en == bookEn }
        val idx = books.indexOfFirst { it.book_en == bookEn }
        if (b == null || idx < 0) { if (chapter + dir >= 1) chapter += dir; return }
        var ci = idx; var ch = chapter + dir
        if (ch < 1) { ci -= 1; if (ci < 0) return; ch = books[ci].chapter_count }
        else if (ch > b.chapter_count) { ci += 1; if (ci >= books.size) return; ch = 1 }
        goTo(books[ci].book_en, books[ci].book_ko, ch)
    }

    Column(Modifier.fillMaxSize()) {
        // 헤더
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box {
                TextButton(onClick = { bookMenu = true }) { Text("$bookKo ${chapter}장 ▾", fontWeight = FontWeight.SemiBold) }
                DropdownMenu(expanded = bookMenu, onDismissRequest = { bookMenu = false }) {
                    books.forEach { b ->
                        DropdownMenuItem(text = { Text(b.book_ko) }, onClick = { bookMenu = false; goTo(b.book_en, b.book_ko, 1) })
                    }
                }
            }
            Spacer(Modifier.weight(1f))
            TextButton(onClick = { showSearch = true }) { Text("검색") }
            TextButton(onClick = { step(-1) }) { Text("◀") }
            TextButton(onClick = { step(1) }) { Text("▶") }
        }
        HorizontalDivider()

        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                items(verses) { v ->
                    val hl = highlights[v.key]?.takeUnless { it.deleted }?.let { HL[it.color] }
                    Row(
                        Modifier.fillMaxWidth().background(hl ?: Color.Transparent)
                            .clickable { selected = v }.padding(vertical = 4.dp, horizontal = 4.dp),
                    ) {
                        Text("${v.verse}", fontSize = 11.sp, color = Color.Gray, modifier = Modifier.padding(end = 6.dp, top = 4.dp))
                        Text(v.ko, fontSize = 18.sp, lineHeight = 28.sp)
                    }
                }
            }
        }
    }

    // 절 액션
    selected?.let { v ->
        VerseActionDialog(verse = v, api = api, store = store,
            currentColor = highlights[v.key]?.takeUnless { it.deleted }?.color,
            onHighlight = { color -> store.setHighlight(v.key, color); highlights = store.highlights() },
            onClose = { selected = null })
    }

    // 검색
    if (showSearch) {
        SearchDialog(api = api, onPick = { hit -> goTo(hit.book_en, hit.book_ko, hit.chapter); showSearch = false }, onClose = { showSearch = false })
    }
}

@Composable
private fun VerseActionDialog(
    verse: ReaderVerse, api: ApiClient, store: LocalStore,
    currentColor: String?, onHighlight: (String?) -> Unit, onClose: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var msg by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var showMemo by remember { mutableStateOf(false) }

    fun call(op: suspend () -> String?) {
        busy = true; msg = null
        scope.launch { msg = runCatching { op() }.getOrNull() ?: "요청 실패"; busy = false }
    }

    AlertDialog(
        onDismissRequest = onClose,
        confirmButton = { TextButton(onClick = onClose) { Text("닫기") } },
        title = { Text("${verse.book_ko} ${verse.chapter}:${verse.verse}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(verse.ko, fontSize = 15.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    HL_ORDER.forEach { c ->
                        Box(Modifier.size(26.dp).background(HL[c]!!, CircleShape)
                            .clickable { onHighlight(if (currentColor == c) null else c) })
                    }
                }
                TextButton(onClick = { showMemo = true }) { Text("메모") }
                TextButton(onClick = { call { api.aiAsk(verse.key, "이 구절의 의미는?").message } }) { Text("AI 질문") }
                TextButton(onClick = { call { api.aiCrossCheck(verse.key).message } }) { Text("AI 교차검증") }
                TextButton(onClick = { call { api.audio(verse.key).message } }) { Text("말씀 듣기") }
                TextButton(onClick = { call { api.media(verse.key).message } }) { Text("설교·책") }
                if (busy) CircularProgressIndicator(Modifier.size(20.dp))
                msg?.let { Text(it, fontSize = 13.sp, color = Color.Gray) }
            }
        },
    )

    if (showMemo) {
        var memo by remember { mutableStateOf(store.notes()[verse.key]?.md ?: "") }
        AlertDialog(
            onDismissRequest = { showMemo = false },
            confirmButton = { TextButton(onClick = { store.setNote(verse.key, memo); showMemo = false }) { Text("저장") } },
            dismissButton = { TextButton(onClick = { showMemo = false }) { Text("취소") } },
            title = { Text("메모") },
            text = { OutlinedTextField(value = memo, onValueChange = { memo = it }, modifier = Modifier.fillMaxWidth(), minLines = 4) },
        )
    }
}

@Composable
private fun SearchDialog(api: ApiClient, onPick: (VerseHit) -> Unit, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var q by remember { mutableStateOf("") }
    var hits by remember { mutableStateOf<List<VerseHit>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }

    fun run() {
        if (q.isBlank()) return
        searching = true
        scope.launch { hits = runCatching { api.search(q.trim()) }.getOrNull()?.hits ?: emptyList(); searching = false }
    }

    AlertDialog(
        onDismissRequest = onClose,
        confirmButton = { TextButton(onClick = ::run) { Text("검색") } },
        dismissButton = { TextButton(onClick = onClose) { Text("닫기") } },
        title = { Text("검색 (자음·본문)") },
        text = {
            Column(Modifier.heightIn(max = 420.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = q, onValueChange = { q = it }, modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("예: ㅎㄴㄴ, 하나님, 사랑은") }, singleLine = true)
                if (searching) CircularProgressIndicator(Modifier.size(20.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(hits) { h ->
                        Column(Modifier.fillMaxWidth().clickable { onPick(h) }.padding(vertical = 4.dp)) {
                            Text("${h.book_ko} ${h.chapter}:${h.verse}", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
                            Text(h.ko, fontSize = 14.sp)
                        }
                    }
                }
            }
        },
    )
}
