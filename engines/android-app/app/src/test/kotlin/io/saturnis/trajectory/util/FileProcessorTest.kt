// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.util

import org.junit.Assert.*
import org.junit.Test
import org.junit.Rule
import org.junit.rules.TemporaryFolder
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class FileProcessorTest {
    @get:Rule
    val tempDir = TemporaryFolder()

    @Test
    fun `detectFormat identifies ZIP files`() {
        val zipFile = tempDir.newFile("test.WFmasterX")
        ZipOutputStream(zipFile.outputStream()).use { zos ->
            zos.putNextEntry(ZipEntry("Test Workflow.WFmaster"))
            zos.write("""{"local_id":"wf-1","oid":"oid-1","version":"1.0","last_modified_date":"2026-01-01","steps":[],"connections":[]}""".toByteArray())
            zos.closeEntry()
        }
        assertEquals(FileFormat.ZIP, FileProcessor.detectFormat(zipFile))
    }

    @Test
    fun `detectFormat identifies JSON files`() {
        val jsonFile = tempDir.newFile("test.json")
        jsonFile.writeText("""{"local_id":"wf-1"}""")
        assertEquals(FileFormat.JSON, FileProcessor.detectFormat(jsonFile))
    }

    @Test
    fun `extractZip finds WFmaster spec and extracts media`() {
        val zipFile = tempDir.newFile("test.WFmasterX")
        val specJson = """{"local_id":"wf-1","oid":"oid-1","version":"1.0","last_modified_date":"2026-01-01","steps":[],"connections":[]}"""
        ZipOutputStream(zipFile.outputStream()).use { zos ->
            zos.putNextEntry(ZipEntry("Test Workflow.WFmaster"))
            zos.write(specJson.toByteArray())
            zos.closeEntry()
            zos.putNextEntry(ZipEntry("manifest.json"))
            zos.write("""{"packageVersion":"1.0"}""".toByteArray())
            zos.closeEntry()
            zos.putNextEntry(ZipEntry("images/photo.jpg"))
            zos.write(byteArrayOf(0xFF.toByte(), 0xD8.toByte()))
            zos.closeEntry()
            zos.putNextEntry(ZipEntry("images/12345-photo.jpg"))
            zos.write(byteArrayOf(0xFF.toByte(), 0xD8.toByte()))
            zos.closeEntry()
        }

        val outputDir = tempDir.newFolder("output")
        val result = FileProcessor.extractZip(zipFile, outputDir)
        assertTrue(result.specFile.exists())
        assertTrue(result.specFile.name.endsWith(".WFmaster"))
        // Media keyed by full path, basename, and bare name
        assertTrue(result.mediaMap.containsKey("images/photo.jpg"))
        assertTrue(result.mediaMap.containsKey("photo.jpg"))
        assertTrue(result.mediaMap.containsKey("images/12345-photo.jpg"))
        assertTrue(result.mediaMap.containsKey("12345-photo.jpg"))
        // manifest.json should NOT be in mediaMap
        assertFalse(result.mediaMap.containsKey("manifest.json"))
    }

    @Test
    fun `extractZip falls back to json if no WFmaster`() {
        val zipFile = tempDir.newFile("test.WFmasterX")
        val specJson = """{"local_id":"wf-1","oid":"oid-1","version":"1.0","last_modified_date":"2026-01-01","steps":[],"connections":[]}"""
        ZipOutputStream(zipFile.outputStream()).use { zos ->
            zos.putNextEntry(ZipEntry("workflow.json"))
            zos.write(specJson.toByteArray())
            zos.closeEntry()
        }

        val outputDir = tempDir.newFolder("output")
        val result = FileProcessor.extractZip(zipFile, outputDir)
        assertTrue(result.specFile.exists())
    }
}
