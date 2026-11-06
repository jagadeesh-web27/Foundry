package com.foundry.app

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.util.Log
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import java.io.File
import java.util.Locale

/**
 * Access to the user's own files (Download, Documents, WhatsApp documents, camera...).
 *
 * Android only lets an app read photos, videos and audio unless the user grants "All files access".
 * Foundry asks for it so it can index and search documents on the phone like it does on the laptop.
 * The user grants or revokes it on the system settings screen; nothing here changes it silently.
 */
object AndroidStorage {
  private const val TAG = "FoundryStorage"

  @JvmStatic
  fun hasAllFilesAccess(context: Context): String {
    val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      Environment.isExternalStorageManager()
    } else {
      context.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }
    return granted.toString()
  }

  /** Opens the system screen where the user can allow Foundry to access all files. */
  @JvmStatic
  fun requestAllFilesAccess(context: Context): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return "false"
    val intents = listOf(
      Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${context.packageName}")),
      Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION),
    )
    for (intent in intents) {
      try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return "true"
      } catch (e: Exception) {
        Log.w(TAG, "Cannot open all-files-access settings: ${e.message}")
      }
    }
    return "false"
  }

  /**
   * Opens a file in the app the user chose for its type (PDF viewer, gallery, Word...).
   * Returns "opened", "missing" or "no-app".
   */
  @JvmStatic
  fun openPath(context: Context, path: String): String {
    val file = File(path)
    if (!file.isFile) return "missing"
    return try {
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
      val ext = file.extension.lowercase(Locale.ROOT)
      val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "*/*"
      val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, mime)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      "opened"
    } catch (e: ActivityNotFoundException) {
      "no-app"
    } catch (e: Exception) {
      Log.w(TAG, "Cannot open $path: ${e.message}")
      "no-app"
    }
  }
}
