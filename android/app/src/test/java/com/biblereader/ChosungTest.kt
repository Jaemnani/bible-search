package com.biblereader

import com.biblereader.core.Chosung
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChosungTest {
    @Test fun toChosung() {
        assertEquals("ㅎㄴㄴ", Chosung.toChosung("하나님"))
        assertEquals("ㅊㅈ", Chosung.toChosung("천지"))
        assertEquals("ㅌㅊㅇ ㅎㄴㄴㅇ", Chosung.toChosung("태초에 하나님이"))
        assertEquals("ㅇㅅ ㄱㄹㅅㄷ", Chosung.toChosung("예수 그리스도"))
        assertEquals("ㅎㄴㄴ", Chosung.toChosung("ㅎㄴㄴ"))
    }

    @Test fun matches() {
        assertTrue(Chosung.matches("ㅎㄴㄴ", "태초에 하나님이"))
        assertTrue(Chosung.matches("하나님", "태초에 하나님이"))
        assertTrue(Chosung.matches("ㅊㅈ", "천지를 창조하시니라"))
        assertFalse(Chosung.matches("ㅋㅋㅋ", "태초에 하나님이"))
        assertFalse(Chosung.matches("", "아무거나"))
    }

    @Test fun isChosungQuery() {
        assertTrue(Chosung.isChosungQuery("ㅎㄴㄴ"))
        assertFalse(Chosung.isChosungQuery("하나님"))
    }
}
