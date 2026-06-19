package com.biblereader.core

import kotlinx.serialization.Serializable

// App API(웹 /api/*) 응답과 1:1 대응. 절 키(verse_ref)는 불변 "book_en:chapter:verse".

@Serializable
data class ReaderVerse(
    val key: String,
    val book_en: String,
    val book_ko: String,
    val chapter: Int,
    val verse: Int,
    val ko: String,
    val en: String = "",
)

@Serializable
data class ChapterResponse(
    val book_en: String,
    val book_ko: String,
    val chapter: Int,
    val verses: List<ReaderVerse>,
)

@Serializable
data class VerseHit(
    val key: String,
    val book_ko: String,
    val book_en: String,
    val chapter: Int,
    val verse: Int,
    val ko: String,
)

@Serializable
data class SearchResponse(
    val query: String = "",
    val hits: List<VerseHit> = emptyList(),
)

@Serializable
data class BookMeta(
    val book_en: String,
    val book_ko: String,
    val testament: String,
    val genre: String,
    val chapter_count: Int,
    val verse_counts: List<Int>,
    val verse_total: Int,
)

@Serializable
data class AiResponse(
    val status: String? = null,
    val message: String? = null,
    val answer: String? = null,
)

@Serializable
data class AudioResponse(
    val status: String? = null,
    val url: String? = null,
    val message: String? = null,
)

@Serializable
data class MediaItem(
    val type: String,
    val title: String,
    val url: String,
    val source: String? = null,
)

@Serializable
data class MediaResponse(
    val status: String? = null,
    val media: List<MediaItem> = emptyList(),
    val message: String? = null,
)
