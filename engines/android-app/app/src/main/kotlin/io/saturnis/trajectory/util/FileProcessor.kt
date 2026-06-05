// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.util

import android.content.Context
import android.net.Uri
import com.trajectoryruntime.engine.MasterWorkflowSpecification
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import java.io.File
import java.util.UUID
import java.util.zip.ZipInputStream

enum class FileFormat { ZIP, JSON }

data class ExtractResult(
    val specFile: File,
    val mediaMap: Map<String, String>,
    val environmentJsons: List<String> = emptyList(),
)

data class ProcessResult(
    val spec: MasterWorkflowSpecification,
    val mediaDir: String?,
    val mediaMap: Map<String, String>,
    val environmentJsons: List<String> = emptyList(),
)

object FileProcessor {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    fun detectFormat(file: File): FileFormat {
        val header = file.inputStream().use { it.readNBytes(4) }
        // ZIP magic: PK\x03\x04
        return if (header.size >= 4 && header[0] == 0x50.toByte() && header[1] == 0x4B.toByte()
            && header[2] == 0x03.toByte() && header[3] == 0x04.toByte()
        ) FileFormat.ZIP else FileFormat.JSON
    }

    /**
     * Parse a JSON workflow spec, supporting both raw specs and test fixtures
     * (which wrap the workflow in a "workflow" key).
     */
    private fun parseSpecJson(specJson: String): MasterWorkflowSpecification {
        // Try direct deserialization first
        return try {
            json.decodeFromString<MasterWorkflowSpecification>(specJson)
        } catch (e: Exception) {
            // Try unwrapping from test fixture format: { "workflow": { ... } }
            val wrapper = json.parseToJsonElement(specJson).jsonObject
            val workflowElement = wrapper["workflow"]
                ?: throw IllegalArgumentException("Failed to parse workflow spec: ${e.message}")
            json.decodeFromJsonElement<MasterWorkflowSpecification>(workflowElement)
        }
    }

    fun extractZip(zipFile: File, outputDir: File): ExtractResult {
        val mediaMap = mutableMapOf<String, String>()
        val environmentJsons = mutableListOf<String>()
        var specFile: File? = null

        val outputRoot = outputDir.canonicalFile
        ZipInputStream(zipFile.inputStream()).use { zis ->
            var entry = zis.nextEntry
            while (entry != null) {
                if (!entry.isDirectory) {
                    val name = entry.name
                    val outFile = File(outputDir, name)
                    val canonical = outFile.canonicalFile
                    // Zip-Slip containment: the resolved path must stay under outputDir.
                    // Rejects "../" traversal and absolute entry names.
                    if (canonical != outputRoot &&
                        !canonical.path.startsWith(outputRoot.path + File.separator)
                    ) {
                        throw SecurityException("Zip entry escapes target directory: $name")
                    }
                    outFile.parentFile?.mkdirs()
                    outFile.outputStream().use { zis.copyTo(it) }

                    when {
                        // .WFmaster file is the workflow spec (actual format)
                        name.endsWith(".WFmaster") -> {
                            specFile = outFile
                        }
                        // .WFenvir files are environment libraries
                        name.endsWith(".WFenvir") -> {
                            environmentJsons.add(outFile.readText())
                        }
                        // Also support workflow.json for test fixtures
                        name.endsWith(".json") && name != "manifest.json" && specFile == null -> {
                            specFile = outFile
                        }
                        // Skip manifest.json
                        name == "manifest.json" -> { }
                        // Everything else is media
                        else -> {
                            // Key by full path (e.g., "images/foo.jpg")
                            mediaMap[name] = outFile.absolutePath
                            // Key by basename (e.g., "foo.jpg")
                            val basename = name.substringAfterLast("/")
                            if (basename != name) {
                                mediaMap[basename] = outFile.absolutePath
                            }
                            // Key by bare name (strip OID prefix: "12345-foo.jpg" → "foo.jpg")
                            val bare = basename.replace(Regex("^\\d+-"), "")
                            if (bare != basename && !mediaMap.containsKey(bare)) {
                                mediaMap[bare] = outFile.absolutePath
                            }
                        }
                    }
                }
                entry = zis.nextEntry
            }
        }

        return ExtractResult(
            specFile = specFile ?: throw IllegalStateException("No .WFmaster file found in ZIP"),
            mediaMap = mediaMap,
            environmentJsons = environmentJsons,
        )
    }

    fun processFile(
        context: Context,
        uri: Uri,
        workflowsDir: File,
    ): Result<ProcessResult> = runCatching {
        val workflowId = UUID.randomUUID().toString()
        val workflowDir = File(workflowsDir, workflowId)
        workflowDir.mkdirs()

        val tempFile = File(workflowDir, "source")
        context.contentResolver.openInputStream(uri)?.use { input ->
            tempFile.outputStream().use { output -> input.copyTo(output) }
        } ?: throw IllegalStateException("Cannot open URI: $uri")

        val format = detectFormat(tempFile)
        val specJson: String
        val mediaMap: Map<String, String>
        val environmentJsons: List<String>

        when (format) {
            FileFormat.ZIP -> {
                val result = extractZip(tempFile, workflowDir)
                specJson = result.specFile.readText()
                mediaMap = result.mediaMap
                environmentJsons = result.environmentJsons
            }
            FileFormat.JSON -> {
                specJson = tempFile.readText()
                mediaMap = emptyMap()
                environmentJsons = emptyList()
            }
        }

        File(workflowDir, "spec.json").writeText(specJson)
        tempFile.delete()

        val spec = parseSpecJson(specJson)

        ProcessResult(
            spec = spec,
            mediaDir = workflowDir.absolutePath,
            mediaMap = mediaMap,
            environmentJsons = environmentJsons,
        )
    }
}
