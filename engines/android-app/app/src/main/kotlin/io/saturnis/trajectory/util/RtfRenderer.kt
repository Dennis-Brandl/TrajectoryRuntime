// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.util

import android.text.Html
import android.text.Spanned
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration

fun htmlToAnnotatedString(html: String): AnnotatedString {
    val spanned: Spanned = Html.fromHtml(html, Html.FROM_HTML_MODE_COMPACT)
    return buildAnnotatedString {
        append(spanned.toString())
        spanned.getSpans(0, spanned.length, Any::class.java).forEach { span ->
            val start = spanned.getSpanStart(span)
            val end = spanned.getSpanEnd(span)
            when (span) {
                is StyleSpan -> when (span.style) {
                    android.graphics.Typeface.BOLD -> addStyle(
                        SpanStyle(fontWeight = FontWeight.Bold), start, end
                    )
                    android.graphics.Typeface.ITALIC -> addStyle(
                        SpanStyle(fontStyle = FontStyle.Italic), start, end
                    )
                    android.graphics.Typeface.BOLD_ITALIC -> addStyle(
                        SpanStyle(
                            fontWeight = FontWeight.Bold,
                            fontStyle = FontStyle.Italic
                        ), start, end
                    )
                }
                is UnderlineSpan -> addStyle(
                    SpanStyle(textDecoration = TextDecoration.Underline), start, end
                )
            }
        }
    }
}

fun substituteChips(
    content: String,
    properties: Map<String, String>,
    inputParameters: Map<String, String>,
): String {
    var result = content

    // Replace <span data-param-chip="KEY">...</span>
    val chipSpanPattern = Regex("""<span\s+data-param-chip="([^"]+)"[^>]*>.*?</span>""")
    result = chipSpanPattern.replace(result) { match ->
        val key = match.groupValues[1].trim()
        properties[key] ?: inputParameters[key] ?: ""
    }

    // Replace {{KEY}} mustache placeholders
    val mustachePattern = Regex("""\{\{([^}]+)\}\}""")
    result = mustachePattern.replace(result) { match ->
        val key = match.groupValues[1].trim()
        properties[key] ?: inputParameters[key] ?: ""
    }

    return result
}
