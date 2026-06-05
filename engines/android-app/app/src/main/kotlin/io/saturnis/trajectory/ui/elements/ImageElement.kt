// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.elements

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil3.compose.AsyncImage
import coil3.request.CachePolicy
import coil3.request.ImageRequest
import coil3.request.crossfade
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.io.File

@Composable
fun ImageElement(props: ElementProps) {
    val src = props.element["src"]?.jsonPrimitive?.contentOrNull ?: return
    val imageOid = props.element["imageOid"]?.jsonPrimitive?.contentOrNull
    val objectFit = props.element["objectFit"]?.jsonPrimitive?.contentOrNull ?: "cover"

    val compositeKey = if (imageOid != null) "$imageOid-$src" else null
    val imagePath = compositeKey?.let { props.mediaMap[it] } ?: props.mediaMap[src]

    if (imagePath != null) {
        val context = LocalContext.current
        AsyncImage(
            model = ImageRequest.Builder(context)
                .data(File(imagePath))
                .memoryCacheKey(imagePath)
                .memoryCachePolicy(CachePolicy.ENABLED)
                .diskCachePolicy(CachePolicy.ENABLED)
                .crossfade(200)
                .build(),
            contentDescription = src,
            contentScale = when (objectFit) {
                "contain" -> ContentScale.Fit
                "fill" -> ContentScale.FillBounds
                else -> ContentScale.Crop
            },
            modifier = Modifier.fillMaxSize(),
        )
    }
}
