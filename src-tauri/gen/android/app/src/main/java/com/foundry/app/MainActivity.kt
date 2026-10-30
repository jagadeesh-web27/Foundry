package com.foundry.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat

class MainActivity : TauriActivity() {
  private val PERMISSION_REQUEST_CODE = 1001
  private val DOCUMENT_TREE_REQUEST_CODE = 1002
  private val MODEL_REQUEST_CODE = 1003

  companion object {
    init {
      try {
        System.loadLibrary("app_lib")
        Log.i("Foundry", "[Foundry][NativeBridge] Loaded app_lib successfully")
      } catch (e: Throwable) {
        Log.e("Foundry", "Failed to load app_lib in MainActivity", e)
      }
    }

    @JvmStatic
    private external fun initNdkContext(context: android.content.Context)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    Log.i("Foundry", "[Foundry][AndroidFiles] MainActivity starting")
    try {
      Log.i("Foundry", "[Foundry][NativeBridge] About to call initNdkContext")
      initNdkContext(this.applicationContext)
      Log.i("Foundry", "[Foundry][NativeBridge] initNdkContext initialized successfully")
    } catch (e: Throwable) {
      Log.e("Foundry", "[Foundry][NativeBridge] initNdkContext failed", e)
    }
    super.onCreate(savedInstanceState)
    WindowCompat.setDecorFitsSystemWindows(window, true)
    val permissionRequestStarted = requestRequiredPermissions()
    if (!permissionRequestStarted) {
      continueFirstLaunchSetup()
    }
  }

  private fun launchDocumentTreePicker() {
    Log.i("Foundry", "[Foundry][AndroidFiles] SAF: opening document tree picker")
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
      addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    }
    startActivityForResult(intent, DOCUMENT_TREE_REQUEST_CODE)
  }

  private fun launchModelPicker() {
    Log.i("Foundry", "[Foundry][AndroidAI] Opening local model picker")
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      type = "application/octet-stream"
      addCategory(Intent.CATEGORY_OPENABLE)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    }
    startActivityForResult(intent, MODEL_REQUEST_CODE)
  }

  private fun continueFirstLaunchSetup() {
    val hasTree = AndroidFileAccess.persistedTreeUri(this) != null
    val hasModel = AndroidLocalAI.hasModel(this)
    Log.i("Foundry", "[Foundry] First launch check: hasTreeUri=$hasTree, hasModel=$hasModel")
    if (!hasTree) {
      launchDocumentTreePicker()
    }
  }

  private fun requestRequiredPermissions(): Boolean {
    val permissionsToRequest = mutableListOf<String>()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
        permissionsToRequest.add(Manifest.permission.READ_MEDIA_IMAGES)
      }
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VIDEO) != PackageManager.PERMISSION_GRANTED) {
        permissionsToRequest.add(Manifest.permission.READ_MEDIA_VIDEO)
      }
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        permissionsToRequest.add(Manifest.permission.READ_MEDIA_AUDIO)
      }
    } else {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
        permissionsToRequest.add(Manifest.permission.READ_EXTERNAL_STORAGE)
      }
    }

    if (permissionsToRequest.isNotEmpty()) {
      Log.i("Foundry", "[Foundry][AndroidFiles] Permission: requesting ${permissionsToRequest.joinToString()}")
      ActivityCompat.requestPermissions(this, permissionsToRequest.toTypedArray(), PERMISSION_REQUEST_CODE)
      return true
    } else {
      Log.i("Foundry", "[Foundry][AndroidFiles] Permission: granted")
      return false
    }
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == PERMISSION_REQUEST_CODE) {
      val granted = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
      Log.i("Foundry", "[Foundry][AndroidFiles] Permission: ${if (granted) "granted" else "denied"}")
      continueFirstLaunchSetup()
    }
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == DOCUMENT_TREE_REQUEST_CODE && resultCode == RESULT_OK && data?.data != null) {
      val persisted = AndroidFileAccess.savePersistedTreeUri(this, data.data!!, data.flags)
      Log.i("Foundry", "[Foundry][AndroidFiles] SAF: selection ${if (persisted) "granted" else "denied"}")
    } else if (requestCode == MODEL_REQUEST_CODE && resultCode == RESULT_OK && data?.data != null) {
      try {
        AndroidLocalAI.installModel(this, data.data.toString())
        Log.i("Foundry", "[Foundry][AndroidAI] Local model setup complete")
      } catch (error: Exception) {
        Log.e("Foundry", "[Foundry][AndroidAI] Local model setup failed", error)
      }
    }
  }
}
