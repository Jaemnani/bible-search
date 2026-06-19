package com.biblereader.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * 공유 App API 클라이언트 — 웹/iOS/Android 동일 계약.
 * baseUrl 예: https://bible-search.vercel.app
 * 외부 네트워크 라이브러리 없이 HttpURLConnection(IO 디스패처) + kotlinx.serialization.
 */
class ApiClient(private val baseUrl: String) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun chapter(book: String, chapter: Int): ChapterResponse =
        json.decodeFromString(httpGet("/api/reader/chapter?book=${enc(book)}&chapter=$chapter"))

    suspend fun search(q: String): SearchResponse =
        json.decodeFromString(httpGet("/api/reader/search?q=${enc(q)}"))

    suspend fun books(): List<BookMeta> =
        json.decodeFromString(httpGet("/data/books_index.json"))

    suspend fun aiAsk(verseRef: String, question: String): AiResponse =
        json.decodeFromString(httpPost("/api/ai/ask", mapOf("verseRef" to verseRef, "question" to question)))

    suspend fun aiCrossCheck(verseRef: String, prompt: String = ""): AiResponse =
        json.decodeFromString(httpPost("/api/ai/cross-check", mapOf("verseRef" to verseRef, "prompt" to prompt)))

    suspend fun audio(verseRef: String, voice: String = "default"): AudioResponse =
        json.decodeFromString(httpGet("/api/audio?verseRef=${enc(verseRef)}&voice=$voice"))

    suspend fun media(verseRef: String): MediaResponse =
        json.decodeFromString(httpGet("/api/verse-media?verseRef=${enc(verseRef)}"))

    // --- 내부 ---
    private fun enc(s: String): String = URLEncoder.encode(s, "UTF-8")

    private suspend fun httpGet(path: String): String = withContext(Dispatchers.IO) {
        val conn = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 10000
            readTimeout = 15000
        }
        readBody(conn)
    }

    private suspend fun httpPost(path: String, body: Map<String, String>): String = withContext(Dispatchers.IO) {
        val payload = JsonObject(body.mapValues { JsonPrimitive(it.value) }).toString()
        val conn = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 10000
            readTimeout = 15000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
        readBody(conn)
    }

    private fun readBody(conn: HttpURLConnection): String {
        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        return stream?.bufferedReader()?.use(BufferedReader::readText) ?: ""
    }
}
