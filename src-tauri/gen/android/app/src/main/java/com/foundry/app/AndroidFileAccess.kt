package com.foundry.app

import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object AndroidFileAccess {
  private const val PREFS = "foundry_android_files"
  private const val TREE_URI = "document_tree_uri"
  private val supportedDocuments = setOf("pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv")

  @JvmStatic
  fun persistedTreeUri(context: Context): String? {
    val value = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(TREE_URI, null)
    if (value.isNullOrBlank()) return null
    val uri = Uri.parse(value)
    val permissions = context.contentResolver.persistedUriPermissions
    val decodedTarget = Uri.decode(uri.toString())
    val matching = permissions.firstOrNull {
      it.isReadPermission && (it.uri == uri || Uri.decode(it.uri.toString()) == decodedTarget)
    }
    if (matching == null) {
      val anyTree = permissions.firstOrNull { it.isReadPermission && it.uri.toString().contains("/tree/") }
      if (anyTree != null) {
        Log.i("Foundry", "[Foundry][AndroidFiles] Using active tree permission: ${anyTree.uri}")
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(TREE_URI, anyTree.uri.toString()).apply()
        return anyTree.uri.toString()
      }
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(TREE_URI).apply()
      Log.i("Foundry", "[Foundry][AndroidFiles] SAF persisted URI invalid or revoked")
      return null
    }
    return matching.uri.toString()
  }

  @JvmStatic
  fun savePersistedTreeUri(context: Context, uri: Uri, flags: Int): Boolean {
    return try {
      context.contentResolver.takePersistableUriPermission(uri, flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION))
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(TREE_URI, uri.toString()).apply()
      Log.i("Foundry", "[Foundry][AndroidFiles] SAF URI permission persisted: $uri")
      true
    } catch (error: SecurityException) {
      Log.e("Foundry", "[Foundry][AndroidFiles] SAF URI persistence failed", error)
      false
    }
  }

  /** Date range filter on a file's last-modified time (Android exposes no reliable creation time). */
  private class TimeWindow(val after: Long?, val before: Long?) {
    fun contains(ms: Long?): Boolean {
      if (after == null && before == null) return true
      if (ms == null) return false
      if (after != null && ms < after) return false
      if (before != null && ms > before) return false
      return true
    }
  }

  private fun JSONObject.optRawString(key: String): String? {
    if (isNull(key)) return null
    val v = optString(key, "").trim()
    return if (v.isEmpty() || v.equals("null", ignoreCase = true)) null else v
  }

  /** Parse "2026-11-05T00:00:00.000Z" (JavaScript toISOString), RFC 3339 offsets, or epoch millis. */
  private fun parseTimestamp(value: String?): Long? {
    if (value == null) return null
    value.toLongOrNull()?.let { return it }
    val patterns = listOf("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ssXXX", "yyyy-MM-dd'T'HH:mm:ss.SSSX", "yyyy-MM-dd'T'HH:mm:ssX")
    for (pattern in patterns) {
      try {
        val format = SimpleDateFormat(pattern, Locale.US).apply { isLenient = false }
        return format.parse(value)?.time
      } catch (_: Exception) {
      }
    }
    return null
  }

  /** MediaStore dates are in seconds, DocumentsContract dates in milliseconds. */
  private fun toMillis(raw: Long): Long = if (raw in 1 until 100_000_000_000L) raw * 1000 else raw

  private fun JSONObject.optStringSafe(key: String): String {
    if (isNull(key)) return ""
    val v = optString(key, "").trim()
    return if (v.equals("null", ignoreCase = true)) "" else v.lowercase(Locale.ROOT)
  }

  @JvmStatic
  fun searchFiles(context: Context, requestJson: String): String {
    val request = JSONObject(requestJson)
    val results = JSONArray()
    val query = request.optStringSafe("query")
    val extension = request.optStringSafe("extension").trimStart('.')
    val requestedTypes = if (request.isNull("fileTypes")) emptySet() else request.optJSONArray("fileTypes")?.let { array ->
      (0 until array.length()).map { array.getString(it).lowercase(Locale.ROOT) }.toSet()
    } ?: emptySet()
    val limit = if (request.isNull("limit")) 200 else request.optInt("limit", 200).coerceIn(1, 10000)
    val sortBy = request.optStringSafe("sortBy")
    val sortOrder = request.optStringSafe("sortOrder")
    // "Added" and "modified" both use the last-modified time: Android's document APIs expose no creation date.
    val afters = listOf("createdAfter", "modifiedAfter").mapNotNull { parseTimestamp(request.optRawString(it)) }
    val befores = listOf("createdBefore", "modifiedBefore").mapNotNull { parseTimestamp(request.optRawString(it)) }
    val window = TimeWindow(afters.maxOrNull(), befores.minOrNull())

    val tree = persistedTreeUri(context)
    if (tree != null) {
      walkTree(context, Uri.parse(tree), results, query, extension, requestedTypes, limit, window)
    } else {
      Log.w("Foundry", "[Foundry][AndroidFiles] No persisted tree URI available for walkTree")
    }

    appendMediaStore(context, results, query, extension, requestedTypes, limit, window)
    Log.i("Foundry", "[Foundry][AndroidFiles] Results before sort/limit: ${results.length()}")

    // Sort results if requested
    val list = ArrayList<JSONObject>(results.length())
    for (i in 0 until results.length()) {
      list.add(results.getJSONObject(i))
    }
    if (sortBy.isNotBlank()) {
      val isDesc = sortOrder.equals("desc", ignoreCase = true)
      list.sortWith(Comparator { a, b ->
        val cmp = when (sortBy) {
          "size" -> a.optLong("size", 0L).compareTo(b.optLong("size", 0L))
          "modified", "created" -> a.optString("modified_at", "").compareTo(b.optString("modified_at", ""))
          "name" -> a.optString("name", "").compareTo(b.optString("name", ""), ignoreCase = true)
          else -> 0
        }
        if (isDesc) -cmp else cmp
      })
    }
    val finalResults = JSONArray()
    for (i in 0 until minOf(list.size, limit)) {
      finalResults.put(list[i])
    }
    return finalResults.toString()
  }

  private fun readStreamUpToMax(input: InputStream, maxBytes: Int): ByteArray {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    var remaining = maxBytes.coerceAtLeast(1)
    while (remaining > 0) {
      val read = input.read(buffer, 0, minOf(buffer.size, remaining))
      if (read <= 0) break
      output.write(buffer, 0, read)
      remaining -= read
    }
    return output.toByteArray()
  }

  @JvmStatic
  fun readFileContent(context: Context, uriString: String, maxBytes: Int): String {
    val cleanUri = uriString.trim().removeSurrounding("\"").removeSurrounding("'")
    val rawBytes: ByteArray? = if (cleanUri.startsWith("content://")) {
      context.contentResolver.openInputStream(Uri.parse(cleanUri))?.use { input ->
        readStreamUpToMax(input, maxBytes)
      }
    } else if (cleanUri.startsWith("/") || cleanUri.startsWith("file://")) {
      val path = if (cleanUri.startsWith("file://")) Uri.parse(cleanUri).path ?: cleanUri else cleanUri
      val f = File(path)
      if (f.exists() && f.canRead()) {
        f.inputStream().use { input -> readStreamUpToMax(input, maxBytes) }
      } else {
        null
      }
    } else {
      // Fallback: search tree for matching file name
      try {
        val searchJson = searchFiles(context, JSONObject().put("query", cleanUri.substringAfterLast('/')).toString())
        val arr = JSONArray(searchJson)
        if (arr.length() > 0) {
          val targetUri = arr.getJSONObject(0).getString("path")
          context.contentResolver.openInputStream(Uri.parse(targetUri))?.use { input ->
            readStreamUpToMax(input, maxBytes)
          }
        } else null
      } catch (_: Exception) {
        null
      }
    }

    val bytes = rawBytes ?: throw IllegalStateException("Unable to open document $cleanUri")
    val lower = cleanUri.lowercase(Locale.ROOT)
    val text = when {
      lower.contains(".pdf") -> extractPdfText(bytes)
      lower.contains(".docx") -> extractDocxText(bytes)
      else -> String(bytes, StandardCharsets.UTF_8)
    }
    Log.i("Foundry", "[Foundry][AndroidFiles] Read: $cleanUri (${bytes.size} bytes)")
    return text
  }

  @JvmStatic
  fun getFileMetadata(context: Context, uriString: String): String? {
    val uri = Uri.parse(uriString)
    context.contentResolver.query(uri, arrayOf(
      DocumentsContract.Document.COLUMN_DOCUMENT_ID,
      DocumentsContract.Document.COLUMN_DISPLAY_NAME,
      DocumentsContract.Document.COLUMN_MIME_TYPE,
      DocumentsContract.Document.COLUMN_SIZE,
      DocumentsContract.Document.COLUMN_LAST_MODIFIED
    ), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) return fileJson(uriString, cursor, uriString.substringAfterLast('.').lowercase(Locale.ROOT)).toString()
    }
    return null
  }

  @JvmStatic
  fun openFile(context: Context, uriString: String): String {
    val uri = Uri.parse(uriString)
    val mime = context.contentResolver.getType(uri) ?: "*/*"
    val intent = Intent(Intent.ACTION_VIEW)
      .setDataAndType(uri, mime)
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
      context.startActivity(intent)
      "true"
    } catch (_: Exception) {
      "false"
    }
  }

  private fun walkTree(context: Context, treeUri: Uri, results: JSONArray, query: String, extension: String, requestedTypes: Set<String>, limit: Int, window: TimeWindow) {
    if (results.length() >= limit) return
    try {
      val rootDocumentId = DocumentsContract.getTreeDocumentId(treeUri)
      val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, rootDocumentId)
      Log.i("Foundry", "[Foundry][AndroidFiles] walkTree: rootId=$rootDocumentId uri=$childrenUri")
      context.contentResolver.query(childrenUri, arrayOf(
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE,
        DocumentsContract.Document.COLUMN_SIZE,
        DocumentsContract.Document.COLUMN_LAST_MODIFIED,
        DocumentsContract.Document.COLUMN_FLAGS
      ), null, null, null)?.use { cursor ->
        val idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID).takeIf { it >= 0 } ?: 0
        val nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME).takeIf { it >= 0 } ?: 1
        val mimeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE).takeIf { it >= 0 } ?: 2
        Log.i("Foundry", "[Foundry][AndroidFiles] walkTree: cursor rows=${cursor.count}")
        while (cursor.moveToNext() && results.length() < limit) {
          val documentId = cursor.getString(idCol)
          val name = cursor.getString(nameCol) ?: ""
          val mime = cursor.getString(mimeCol) ?: "application/octet-stream"
          val childUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId)
          if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
            walkDirectory(context, treeUri, documentId, results, query, extension, requestedTypes, limit, window)
          } else if (matches(name, mime, query, extension, requestedTypes) && window.contains(lastModified(cursor))) {
            results.put(fileJson(childUri.toString(), cursor, extensionFor(name)))
            Log.i("Foundry", "[Foundry][AndroidFiles] Matched: $name ($childUri)")
          }
        }
      } ?: Log.w("Foundry", "[Foundry][AndroidFiles] walkTree: query returned null cursor")
    } catch (e: Exception) {
      Log.e("Foundry", "[Foundry][AndroidFiles] walkTree error", e)
    }
  }

  private fun walkDirectory(context: Context, treeUri: Uri, parentId: String, results: JSONArray, query: String, extension: String, requestedTypes: Set<String>, limit: Int, window: TimeWindow) {
    if (results.length() >= limit) return
    val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentId)
    context.contentResolver.query(childrenUri, arrayOf(
      DocumentsContract.Document.COLUMN_DOCUMENT_ID,
      DocumentsContract.Document.COLUMN_DISPLAY_NAME,
      DocumentsContract.Document.COLUMN_MIME_TYPE,
      DocumentsContract.Document.COLUMN_SIZE,
      DocumentsContract.Document.COLUMN_LAST_MODIFIED,
      DocumentsContract.Document.COLUMN_FLAGS
    ), null, null, null)?.use { cursor ->
      val idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID).takeIf { it >= 0 } ?: 0
      val nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME).takeIf { it >= 0 } ?: 1
      val mimeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE).takeIf { it >= 0 } ?: 2
      while (cursor.moveToNext() && results.length() < limit) {
        val documentId = cursor.getString(idCol)
        val name = cursor.getString(nameCol) ?: ""
        val mime = cursor.getString(mimeCol) ?: "application/octet-stream"
        val childUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId)
        if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
          walkDirectory(context, treeUri, documentId, results, query, extension, requestedTypes, limit, window)
        } else if (matches(name, mime, query, extension, requestedTypes) && window.contains(lastModified(cursor))) {
          results.put(fileJson(childUri.toString(), cursor, extensionFor(name)))
        }
      }
    }
  }

  private fun lastModified(cursor: Cursor): Long? {
    val col = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
    return if (col < 0 || cursor.isNull(col)) null else toMillis(cursor.getLong(col))
  }

  private fun classifyType(ext: String, mime: String): String {
    return when {
      ext == "pdf" -> "pdf"
      ext in setOf("doc", "docx", "txt", "rtf", "odt", "md") -> "document"
      ext in setOf("xls", "xlsx", "csv", "tsv") -> "spreadsheet"
      ext in setOf("ppt", "pptx") -> "presentation"
      mime.startsWith("image/") || ext in setOf("jpg", "jpeg", "png", "webp", "gif", "bmp", "svg", "ico") -> "image"
      mime.startsWith("video/") || ext in setOf("mp4", "mkv", "avi", "mov", "webm", "3gp") -> "video"
      mime.startsWith("audio/") || ext in setOf("mp3", "wav", "m4a", "flac", "aac", "ogg") -> "audio"
      else -> "other"
    }
  }

  private fun matches(name: String, mime: String, query: String, extension: String, requestedTypes: Set<String>): Boolean {
    val ext = extensionFor(name)
    val type = classifyType(ext, mime)
    if (extension.isNotBlank() && ext != extension) return false
    if (query.isNotBlank() && !name.lowercase(Locale.ROOT).contains(query)) return false
    if (requestedTypes.isNotEmpty()) {
      val matched = requestedTypes.contains(type) || (type == "pdf" && requestedTypes.contains("document"))
      if (!matched) return false
    }
    return true
  }

  private fun appendMediaStore(context: Context, results: JSONArray, query: String, extension: String, requestedTypes: Set<String>, limit: Int, window: TimeWindow) {
    if (results.length() >= limit && requestedTypes.isNotEmpty() && requestedTypes.none { it in setOf("image", "video", "audio") }) return
    val collection = MediaStore.Files.getContentUri("external")
    context.contentResolver.query(collection, arrayOf(
      MediaStore.Files.FileColumns._ID,
      MediaStore.Files.FileColumns.DISPLAY_NAME,
      MediaStore.Files.FileColumns.MIME_TYPE,
      MediaStore.Files.FileColumns.SIZE,
      MediaStore.Files.FileColumns.DATE_MODIFIED,
      MediaStore.Files.FileColumns.MEDIA_TYPE
    ), null, null, "${MediaStore.Files.FileColumns.DATE_MODIFIED} DESC")?.use { cursor ->
      while (cursor.moveToNext() && results.length() < limit) {
        if (cursor.isNull(2)) continue
        val mediaType = when (cursor.getInt(5)) {
          MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE -> "image"
          MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO -> "video"
          MediaStore.Files.FileColumns.MEDIA_TYPE_AUDIO -> "audio"
          else -> continue
        }
        val name = cursor.getString(1) ?: continue
        val ext = extensionFor(name)
        if (extension.isNotBlank() && ext != extension) continue
        if (query.isNotBlank() && !name.lowercase(Locale.ROOT).contains(query)) continue
        if (requestedTypes.isNotEmpty() && mediaType !in requestedTypes) continue
        if (!window.contains(if (cursor.isNull(4)) null else toMillis(cursor.getLong(4)))) continue
        val uri = Uri.withAppendedPath(collection, cursor.getLong(0).toString())
        results.put(fileJson(uri.toString(), cursor, ext))
      }
    }
  }

  private fun fileJson(uri: String, cursor: Cursor, extension: String): JSONObject {
    val nameIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME).takeIf { it >= 0 }
      ?: cursor.getColumnIndex(MediaStore.Files.FileColumns.DISPLAY_NAME).takeIf { it >= 0 } ?: 1
    val mimeIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE).takeIf { it >= 0 }
      ?: cursor.getColumnIndex(MediaStore.Files.FileColumns.MIME_TYPE).takeIf { it >= 0 } ?: 2
    val sizeIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE).takeIf { it >= 0 }
      ?: cursor.getColumnIndex(MediaStore.Files.FileColumns.SIZE).takeIf { it >= 0 } ?: 3
    val modIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED).takeIf { it >= 0 }
      ?: cursor.getColumnIndex(MediaStore.Files.FileColumns.DATE_MODIFIED).takeIf { it >= 0 } ?: 4

    val name = cursor.getString(nameIndex) ?: uri.substringAfterLast('/')
    val mime = cursor.getString(mimeIndex) ?: "application/octet-stream"
    val size = if (cursor.isNull(sizeIndex)) 0L else cursor.getLong(sizeIndex)
    val modified = if (cursor.isNull(modIndex)) null else iso(toMillis(cursor.getLong(modIndex)))
    return JSONObject().apply {
      put("path", uri)
      put("name", name)
      put("extension", extension)
      put("size", size)
      put("created_at", JSONObject.NULL)
      put("modified_at", modified ?: JSONObject.NULL)
      put("accessed_at", JSONObject.NULL)
      put("file_type", when (classifyType(extension, mime)) {
        "pdf" -> "PDF"
        "document" -> "Document"
        "spreadsheet" -> "Spreadsheet"
        "presentation" -> "Presentation"
        "image" -> "Image"
        "video" -> "Video"
        "audio" -> "Audio"
        else -> "Other"
      })
      put("mime_type", mime)
    }
  }

  private fun extensionFor(name: String): String = name.substringAfterLast('.', "").lowercase(Locale.ROOT)
  private fun iso(millis: Long): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(millis))

  private fun extractPdfText(bytes: ByteArray): String {
    val raw = String(bytes, StandardCharsets.ISO_8859_1)
    val matches = Regex("\\(([^()]*)\\)").findAll(raw).map { it.groupValues[1].trim() }.filter { it.length >= 2 }.toList()
    return if (matches.isNotEmpty()) matches.joinToString(" ") else "PDF document content could not be extracted"
  }

  private fun extractDocxText(bytes: ByteArray): String {
    return try {
      java.util.zip.ZipInputStream(bytes.inputStream()).use { zip ->
        var entry = zip.nextEntry
        while (entry != null) {
          if (entry.name == "word/document.xml") {
            val xml = String(zip.readBytes(), StandardCharsets.UTF_8)
            val plain = xml.replace(Regex("<[^>]+>"), " ")
              .replace("&amp;", "&")
              .replace("&lt;", "<")
              .replace("&gt;", ">")
              .replace("&quot;", "\"")
              .replace("&apos;", "'")
              .replace(Regex("\\s+"), " ")
              .trim()
            return plain
          }
          entry = zip.nextEntry
        }
      }
      "DOCX document structure contained no document.xml"
    } catch (e: Exception) {
      Log.e("Foundry", "[Foundry][AndroidFiles] DOCX extraction error", e)
      "DOCX document content could not be read"
    }
  }
}
