package com.foundry.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

object AndroidApkInstaller {
  @JvmStatic
  fun downloadAndInstall(context: Context, urlString: String): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
      return JSONObject().apply {
        put("installed", false)
        put("requiresUnknownSourcesPermission", true)
        put("message", "Android requires permission to install updates from this source.")
        put("settingsIntent", Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
      }.toString()
    }

    val target = File(context.cacheDir, "foundry-update.apk")
    val connection = (URL(urlString).openConnection() as HttpURLConnection).apply {
      connectTimeout = 10_000
      readTimeout = 120_000
      requestMethod = "GET"
    }
    connection.inputStream.use { input -> target.outputStream().use { output -> input.copyTo(output) } }
    if (!target.isFile || target.length() == 0L) error("The update URL returned an empty APK")
    
      val candidate = context.packageManager.getPackageArchiveInfo(target.absolutePath, 0)
        ?: error("The downloaded file is not a valid Android APK")
      if (candidate.packageName != context.packageName) {
        error("The downloaded APK belongs to ${candidate.packageName}, not ${context.packageName}")
      }
      val installed = context.packageManager.getPackageInfo(context.packageName, 0)
      if (candidate.longVersionCode <= installed.longVersionCode) {
        return JSONObject().apply {
          put("installed", false)
          put("message", "Installed version is newer than or equal to the available APK.")
          put("installedVersionCode", installed.longVersionCode)
          put("availableVersionCode", candidate.longVersionCode)
        }.toString()
      }

    val uri: Uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", target)
    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
    return JSONObject().apply {
      put("installed", false)
      put("installerLaunched", true)
      put("sizeBytes", target.length())
        put("availableVersionCode", candidate.longVersionCode)
      put("message", "Android's package installer was opened for confirmation.")
    }.toString()
  }
}
