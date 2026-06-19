package com.biblereader.core

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

// 로컬 우선 주석 저장 — 불변 절-ID 키잉 + updated/deleted(추후 NAS 동기화 LWW/tombstone 대비).
// 웹 readerStore.ts / iOS LocalStore.swift 와 동일 개념. SharedPreferences 백엔드.

@Serializable
data class HighlightRec(val color: String, val updated: Long = System.currentTimeMillis(), val deleted: Boolean = false)

@Serializable
data class NoteRec(val md: String, val updated: Long = System.currentTimeMillis(), val deleted: Boolean = false)

class LocalStore(context: Context) {
    private val sp = context.getSharedPreferences("bible.reader", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    fun highlights(): Map<String, HighlightRec> = load("highlights")
    fun setHighlight(verseRef: String, color: String?) {
        val m = highlights().toMutableMap()
        if (color != null) m[verseRef] = HighlightRec(color) else m.remove(verseRef)
        sp.edit().putString("highlights", json.encodeToString(m)).apply()
    }

    fun notes(): Map<String, NoteRec> = load("notes")
    fun setNote(verseRef: String, md: String?) {
        val m = notes().toMutableMap()
        if (!md.isNullOrEmpty()) m[verseRef] = NoteRec(md) else m.remove(verseRef)
        sp.edit().putString("notes", json.encodeToString(m)).apply()
    }

    private inline fun <reified T> load(key: String): Map<String, T> {
        val raw = sp.getString(key, null) ?: return emptyMap()
        return runCatching { json.decodeFromString<Map<String, T>>(raw) }.getOrDefault(emptyMap())
    }
}
