package com.foundry.app

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Installed apps the user can open (the ones shown in the app drawer), and launching one of them.
 * Visibility comes from the <queries> launcher intent in AndroidManifest.xml (no QUERY_ALL_PACKAGES).
 */
object AndroidApps {
  @JvmStatic
  fun listLaunchable(context: Context): String {
    val pm = context.packageManager
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val activities = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0))
    } else {
      @Suppress("DEPRECATION")
      pm.queryIntentActivities(intent, 0)
    }
    val seen = HashSet<String>()
    val apps = JSONArray()
    for (info in activities) {
      val pkg = info.activityInfo?.packageName ?: continue
      if (pkg == context.packageName || !seen.add(pkg)) continue
      apps.put(JSONObject().put("label", info.loadLabel(pm).toString()).put("package", pkg))
    }
    Log.i("Foundry", "[Foundry][AndroidApps] launchable apps: ${apps.length()}")
    return apps.toString()
  }

  /** Open the app's main screen. Returns "true" when Android accepted the launch. */
  @JvmStatic
  fun launch(context: Context, packageName: String): String {
    val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: return "false"
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
      context.startActivity(intent)
      Log.i("Foundry", "[Foundry][AndroidApps] launched $packageName")
      "true"
    } catch (e: Exception) {
      Log.e("Foundry", "[Foundry][AndroidApps] launch failed for $packageName", e)
      "false"
    }
  }
}
