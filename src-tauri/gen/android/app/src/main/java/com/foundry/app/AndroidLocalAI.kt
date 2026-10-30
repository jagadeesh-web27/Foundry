package com.foundry.app

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.BatteryManager
import android.os.SystemClock
import android.util.Log
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

object AndroidLocalAI {
  private const val TAG = "FoundryAndroidAI"
  private const val MODEL_DIRECTORY = "foundry-models"
  private const val MODEL_FILE = "foundry-model.task"
  private const val DEFAULT_MODEL_NAME = "Gemma 2B IT (int4)"
  private const val DEFAULT_MODEL_URL = "https://huggingface.co/innermost47/gemma-2b-it-int4-mediapipe/resolve/main/gemma-1.1-2b-it-cpu-int4.bin"

  // Provider states as required by architecture
  const val STATE_NOT_INSTALLED = "MODEL_NOT_INSTALLED"
  const val STATE_DOWNLOADING = "MODEL_DOWNLOADING"
  const val STATE_VERIFYING = "MODEL_VERIFYING"
  const val STATE_LOADING = "MODEL_LOADING"
  const val STATE_READY = "MODEL_READY"
  const val STATE_INFERENCE_RUNNING = "INFERENCE_RUNNING"
  const val STATE_MODEL_ERROR = "MODEL_ERROR"
  const val STATE_INFERENCE_ERROR = "INFERENCE_ERROR"

  @Volatile private var currentState: String = STATE_NOT_INSTALLED
  @Volatile private var downloadProgress: Int = 0
  @Volatile private var downloadBytes: Long = 0L
  @Volatile private var totalBytes: Long = 0L
  @Volatile private var lastErrorMessage: String? = null
  @Volatile private var inferenceVerified: Boolean = false
  @Volatile private var lastInferenceTimeMs: Long = 0L

  private val isDownloading = AtomicBoolean(false)
  private val cancelDownloadFlag = AtomicBoolean(false)
  private var downloadThread: Thread? = null

  private var inference: LlmInference? = null
  private var loadedPath: String? = null

  @Synchronized
  @JvmStatic
  fun status(context: Context): String {
    val model = modelFile(context)
    val fileExists = model.isFile && model.length() > 0L

    // If file exists and state was NOT_INSTALLED, check if it's ready or needs loading
    if (fileExists && (currentState == STATE_NOT_INSTALLED || currentState == STATE_MODEL_ERROR || currentState == STATE_VERIFYING)) {
      if (inference != null && loadedPath == model.absolutePath) {
        currentState = STATE_READY
      } else if (currentState != STATE_LOADING) {
        currentState = STATE_VERIFYING
        // Trigger background load if not already loading
        Thread {
          try {
            loadModel(context)
          } catch (e: Exception) {
            Log.e(TAG, "[FoundryAI] Auto background load error", e)
          }
        }.apply {
          isDaemon = true
          start()
        }
      }
    } else if (!fileExists && currentState != STATE_DOWNLOADING) {
      currentState = STATE_NOT_INSTALLED
      inference = null
      loadedPath = null
    }

    val isReady = (currentState == STATE_READY || currentState == STATE_INFERENCE_RUNNING) && inference != null

    return JSONObject().apply {
      put("state", currentState)
      put("ready", isReady)
      put("modelName", DEFAULT_MODEL_NAME)
      put("modelFormat", "MediaPipe .task")
      put("modelPath", if (fileExists) model.absolutePath else JSONObject.NULL)
      put("modelSizeBytes", if (fileExists) model.length() else 0L)
      put("downloadProgress", downloadProgress)
      put("downloadBytes", downloadBytes)
      put("totalBytes", totalBytes)
      put("errorMessage", if (lastErrorMessage != null) lastErrorMessage else JSONObject.NULL)
      put("inferenceVerified", inferenceVerified)
      put("lastInferenceTimeMs", lastInferenceTimeMs)
      put("defaultDownloadUrl", DEFAULT_MODEL_URL)
    }.toString()
  }

  @JvmStatic
  fun hasModel(context: Context): Boolean {
    val model = modelFile(context)
    return model.isFile && model.length() > 0L
  }

  @Synchronized
  @JvmStatic
  fun loadModel(context: Context): String {
    val model = modelFile(context)
    if (!model.isFile || model.length() == 0L) {
      currentState = STATE_NOT_INSTALLED
      lastErrorMessage = "No on-device model found to load. Model file must be installed first."
      return status(context)
    }

    currentState = STATE_LOADING
    lastErrorMessage = null
    try {
      loadEngine(context, model)
      currentState = STATE_READY
      Log.i(TAG, "[FoundryAI] Local model successfully loaded into memory: ${model.absolutePath}")
    } catch (e: Exception) {
      currentState = STATE_MODEL_ERROR
      lastErrorMessage = "Failed to load local AI model: ${e.localizedMessage ?: e.message}"
      inference = null
      loadedPath = null
      Log.e(TAG, "[FoundryAI] Model load error", e)
    }
    return status(context)
  }

  @Synchronized
  @JvmStatic
  fun installModel(context: Context, uriString: String): String {
    val destination = modelFile(context)
    destination.parentFile?.mkdirs()
    currentState = STATE_VERIFYING
    lastErrorMessage = null

    try {
      context.contentResolver.openInputStream(Uri.parse(uriString)).use { input ->
        requireNotNull(input) { "Android could not read the selected model file" }
        destination.outputStream().use { output -> input.copyTo(output) }
      }
      require(destination.length() > 0L) { "The selected model file is empty" }

      inference?.close()
      inference = null
      loadedPath = null

      Log.i(TAG, "[FoundryAI] Model installed locally: ${destination.length()} bytes")
      return loadModel(context)
    } catch (e: Exception) {
      currentState = STATE_MODEL_ERROR
      lastErrorMessage = "Failed to install model file: ${e.localizedMessage ?: e.message}"
      Log.e(TAG, "[FoundryAI] Model install error", e)
      return status(context)
    }
  }

  @Synchronized
  @JvmStatic
  fun startDownload(context: Context, urlString: String?): String {
    if (isDownloading.get()) {
      return status(context)
    }

    val targetUrl = if (!urlString.isNullOrBlank()) urlString.trim() else DEFAULT_MODEL_URL
    val destinationDir = File(context.filesDir, MODEL_DIRECTORY).apply { mkdirs() }
    val tempFile = File(destinationDir, "$MODEL_FILE.tmp")
    val finalFile = File(destinationDir, MODEL_FILE)

    cancelDownloadFlag.set(false)
    isDownloading.set(true)
    currentState = STATE_DOWNLOADING
    downloadProgress = 0
    downloadBytes = 0L
    totalBytes = 0L
    lastErrorMessage = null

    downloadThread = Thread {
      var connection: HttpURLConnection? = null
      var input: InputStream? = null
      var output: FileOutputStream? = null

      try {
        Log.i(TAG, "[FoundryAI] Starting model download from: $targetUrl")
        val url = URL(targetUrl)
        connection = (url.openConnection() as HttpURLConnection).apply {
          connectTimeout = 30000
          readTimeout = 60000
          instanceFollowRedirects = true
          setRequestProperty("User-Agent", "Foundry-Android-Agent")
        }
        connection.connect()

        val responseCode = connection.responseCode
        if (responseCode !in 200..299) {
          throw Exception("Server returned HTTP $responseCode: ${connection.responseMessage}")
        }

        val contentLength = connection.contentLengthLong
        totalBytes = if (contentLength > 0L) contentLength else 1500000000L // Approx 1.5GB fallback

        input = connection.inputStream
        output = FileOutputStream(tempFile)

        val buffer = ByteArray(64 * 1024)
        var bytesRead: Int
        var downloaded: Long = 0L
        var lastLogTime = SystemClock.elapsedRealtime()

        while (input.read(buffer).also { bytesRead = it } != -1) {
          if (cancelDownloadFlag.get()) {
            throw Exception("Download cancelled by user")
          }

          output.write(buffer, 0, bytesRead)
          downloaded += bytesRead
          downloadBytes = downloaded

          if (totalBytes > 0L) {
            downloadProgress = ((downloaded * 100) / totalBytes).toInt().coerceIn(0, 99)
          }

          val now = SystemClock.elapsedRealtime()
          if (now - lastLogTime > 3000) {
            Log.i(TAG, "[FoundryAI] Download progress: $downloadProgress% ($downloaded / $totalBytes bytes)")
            lastLogTime = now
          }
        }

        output.flush()
        output.close()
        output = null
        input.close()
        input = null

        // Verification phase
        currentState = STATE_VERIFYING
        downloadProgress = 100
        Log.i(TAG, "[FoundryAI] Download complete. Verifying file: ${tempFile.length()} bytes")

        if (tempFile.length() < 1000000L) {
          throw Exception("Downloaded file is too small (${tempFile.length()} bytes). Expected valid .task model.")
        }

        if (finalFile.exists()) {
          finalFile.delete()
        }
        if (!tempFile.renameTo(finalFile)) {
          throw Exception("Failed to rename temporary download file to $MODEL_FILE")
        }

        Log.i(TAG, "[FoundryAI] Model file verified and moved to: ${finalFile.absolutePath}")

        // Load into memory
        currentState = STATE_LOADING
        loadEngine(context, finalFile)
        currentState = STATE_READY
        Log.i(TAG, "[FoundryAI] On-device model ready for inference!")

      } catch (e: Exception) {
        if (cancelDownloadFlag.get()) {
          currentState = STATE_NOT_INSTALLED
          lastErrorMessage = "Download was cancelled."
        } else {
          currentState = STATE_MODEL_ERROR
          lastErrorMessage = e.localizedMessage ?: e.message
          Log.e(TAG, "[FoundryAI] Model download failed", e)
        }
        if (tempFile.exists()) {
          tempFile.delete()
        }
      } finally {
        try { output?.close() } catch (_: Exception) {}
        try { input?.close() } catch (_: Exception) {}
        try { connection?.disconnect() } catch (_: Exception) {}
        isDownloading.set(false)
        downloadThread = null
      }
    }.apply {
      isDaemon = true
      start()
    }

    return status(context)
  }

  @Synchronized
  @JvmStatic
  fun cancelDownload(context: Context): String {
    if (isDownloading.get()) {
      cancelDownloadFlag.set(true)
      downloadThread?.interrupt()
    }
    currentState = if (hasModel(context)) STATE_READY else STATE_NOT_INSTALLED
    lastErrorMessage = "Download cancelled."
    return status(context)
  }

  @Synchronized
  @JvmStatic
  fun deleteModel(context: Context): String {
    try {
      inference?.close()
      inference = null
      loadedPath = null
      val model = modelFile(context)
      if (model.exists()) {
        model.delete()
      }
      val temp = File(context.filesDir, "$MODEL_DIRECTORY/$MODEL_FILE.tmp")
      if (temp.exists()) {
        temp.delete()
      }
      currentState = STATE_NOT_INSTALLED
      inferenceVerified = false
      lastErrorMessage = null
      Log.i(TAG, "[FoundryAI] Local model deleted")
    } catch (e: Exception) {
      lastErrorMessage = "Failed to delete model: ${e.localizedMessage}"
    }
    return status(context)
  }

  @Synchronized
  @JvmStatic
  fun chat(context: Context, prompt: String): String {
    val model = modelFile(context)
    require(model.isFile && model.length() > 0L) {
      "Local AI model is not installed or ready. Please set up the on-device AI model in Foundry."
    }

    val engine = loadEngine(context, model)
    currentState = STATE_INFERENCE_RUNNING
    val startTime = SystemClock.elapsedRealtime()

    return try {
      Log.i(TAG, "[FoundryAI] Local on-device inference started (prompt length: ${prompt.length})")
      val response = engine.generateResponse(prompt)
      val elapsed = SystemClock.elapsedRealtime() - startTime
      lastInferenceTimeMs = elapsed
      inferenceVerified = true
      currentState = STATE_READY
      Log.i(TAG, "[FoundryAI] Local inference completed in ${elapsed}ms (output length: ${response.length})")
      response
    } catch (e: Exception) {
      currentState = STATE_INFERENCE_ERROR
      lastErrorMessage = "Inference execution error: ${e.localizedMessage ?: e.message}"
      Log.e(TAG, "[FoundryAI] Local inference failed", e)
      throw e
    }
  }

  @JvmStatic
  fun testInference(context: Context, testPrompt: String): String {
    val promptToUse = if (testPrompt.isNotBlank()) testPrompt else "Explain TypeScript in one sentence."
    val startTime = SystemClock.elapsedRealtime()

    return try {
      val generatedText = chat(context, promptToUse)
      val elapsed = SystemClock.elapsedRealtime() - startTime
      JSONObject().apply {
        put("success", true)
        put("prompt", promptToUse)
        put("response", generatedText)
        put("elapsedMs", elapsed)
        put("state", currentState)
      }.toString()
    } catch (e: Exception) {
      JSONObject().apply {
        put("success", false)
        put("prompt", promptToUse)
        put("error", e.localizedMessage ?: e.message)
        put("state", currentState)
      }.toString()
    }
  }

  @Synchronized
  private fun loadEngine(context: Context, model: File): LlmInference {
    if (inference != null && loadedPath == model.absolutePath) {
      return inference!!
    }

    Log.i(TAG, "[FoundryAI] Initializing MediaPipe LlmInference with ${model.absolutePath}...")
    val options = LlmInference.LlmInferenceOptions.builder()
      .setModelPath(model.absolutePath)
      .setMaxTokens(2048)
      .build()

    val newInference = LlmInference.createFromOptions(context, options)
    inference = newInference
    loadedPath = model.absolutePath
    currentState = STATE_READY
    Log.i(TAG, "[FoundryAI] MediaPipe LlmInference successfully initialized")
    return newInference
  }

  /**
   * Validate that a file is a MediaPipe .task bundle (ZIP archive).
   * MediaPipe LlmInference requires a ZIP bundle containing TF_LITE_PREFILL_DECODE,
   * TOKENIZER_MODEL, and METADATA entries. Raw TFLite flatbuffers (TFL3 header) won't work.
   * Some task bundles may have 4 null bytes prepended before the PK signature.
   */
  private fun isValidTaskBundle(file: File): Boolean {
    if (!file.isFile || file.length() < 1000000L) return false
    return try {
      val header = ByteArray(8)
      file.inputStream().use { it.read(header) }
      // Check for ZIP magic (PK\x03\x04) at offset 0 or offset 4
      val pkAt0 = header[0] == 0x50.toByte() && header[1] == 0x4B.toByte() &&
                  header[2] == 0x03.toByte() && header[3] == 0x04.toByte()
      val pkAt4 = header[4] == 0x50.toByte() && header[5] == 0x4B.toByte() &&
                  header[6] == 0x03.toByte() && header[7] == 0x04.toByte()
      val isZip = pkAt0 || pkAt4
      if (!isZip) {
        Log.w(TAG, "[FoundryAI] File ${file.name} is NOT a valid .task ZIP bundle (header: ${header.joinToString(" ") { "0x%02X".format(it) }})")
      }
      isZip
    } catch (e: Exception) {
      Log.w(TAG, "[FoundryAI] Could not validate file ${file.name}: ${e.message}")
      false
    }
  }

  private fun modelFile(context: Context): File {
    val internalFile = File(File(context.filesDir, MODEL_DIRECTORY), MODEL_FILE)
    if (internalFile.isFile && internalFile.length() > 0L && isValidTaskBundle(internalFile)) {
      return internalFile
    }
    val candidates = listOf(
      File(File(context.filesDir, MODEL_DIRECTORY), "foundry-model.bin"),
      File("/sdcard/Download/foundry-model.task"),
      File("/sdcard/foundry-model.task"),
      File("/sdcard/foundry-model.bin"),
      File("/sdcard/Download/foundry-model.bin"),
      File("/sdcard/Download/gemma-1.1-2b-it-cpu-int4.bin")
    )
    for (candidate in candidates) {
      if (candidate.isFile && candidate.length() > 100000000L && isValidTaskBundle(candidate)) {
        Log.i(TAG, "[FoundryAI] Found valid .task bundle: ${candidate.absolutePath} (${candidate.length()} bytes)")
        return candidate
      }
    }
    // Log what files exist but failed validation
    for (candidate in candidates) {
      if (candidate.isFile && candidate.length() > 100000000L) {
        Log.w(TAG, "[FoundryAI] Skipped invalid model: ${candidate.absolutePath} (${candidate.length()} bytes, not a valid .task ZIP)")
      }
    }
    return internalFile
  }

  /**
   * Native device battery implementation for Android.
   * Uses sticky Intent.ACTION_BATTERY_CHANGED broadcast and BatteryManager API.
   * Requires ZERO special permissions and works on all Android versions.
   */
  @JvmStatic
  fun getBatteryInfo(context: Context): String {
    return try {
      val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      val rawLevel = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
      val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1

      val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
      val bmLevel = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1

      val level = if (rawLevel >= 0 && scale > 0) {
        (rawLevel * 100 / scale)
      } else if (bmLevel in 0..100) {
        bmLevel
      } else {
        100
      }

      val status = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
      val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL

      val temp = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
      val tempCelsius = if (temp > 0) temp / 10.0 else null

      JSONObject().apply {
        put("level", level.coerceIn(0, 100))
        put("is_charging", isCharging)
        if (tempCelsius != null) {
          put("temperature_celsius", tempCelsius)
        }
      }.toString()
    } catch (e: Exception) {
      Log.e(TAG, "[FoundryAI] Error reading Android battery info", e)
      JSONObject().apply {
        put("level", 100)
        put("is_charging", false)
      }.toString()
    }
  }
}
