package com.biblereader.core

/**
 * 한글 초성(자음) 검색 — 웹 chosung.ts / iOS Chosung.swift 와 동일 알고리즘.
 * 카테고리/책/장/절 본문 자음검색의 공유 spec.
 */
object Chosung {
    private val CHO = listOf(
        'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
        'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
    )
    private const val BASE = 0xAC00
    private const val LAST = 0xD7A3
    private val COMPAT = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ".toSet()

    /** 한글 음절→초성, 호환 자음→그대로, 공백→공백, 그 외→제거. 다중 공백 1개로. */
    fun toChosung(text: String): String {
        val sb = StringBuilder()
        for (ch in text) {
            val code = ch.code
            when {
                code in BASE..LAST -> sb.append(CHO[(code - BASE) / 588])
                ch in COMPAT -> sb.append(ch)
                ch.isWhitespace() -> sb.append(' ')
                // 그 외(구두점·라틴·숫자)는 제거
            }
        }
        return sb.toString().split(" ").filter { it.isNotEmpty() }.joinToString(" ")
    }

    /** 쿼리가 '초성/자음 위주'인지 — 자음검색 모드 판별. */
    fun isChosungQuery(q: String): Boolean {
        var compat = 0
        var syllable = 0
        for (ch in q) {
            if (ch in COMPAT) compat++
            else if (ch.code in BASE..LAST) syllable++
        }
        return compat > 0 && compat >= syllable
    }

    /** 초성 부분일치(공백 무시, substring). targetChosung 미리 계산 시 반복 비용 절약. */
    fun matches(query: String, target: String, targetChosung: String? = null): Boolean {
        val q = toChosung(query).replace(" ", "")
        if (q.isEmpty()) return false
        val t = (targetChosung ?: toChosung(target)).replace(" ", "")
        return t.contains(q)
    }
}
