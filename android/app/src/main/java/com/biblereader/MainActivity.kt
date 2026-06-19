package com.biblereader

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import com.biblereader.ui.ReaderScreen

// App API 베이스 URL — 배포된 웹 API(리더/AI/오디오/미디어 계약). 필요 시 교체.
const val API_BASE_URL = "https://bible-search.vercel.app"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface { ReaderScreen() }
            }
        }
    }
}
