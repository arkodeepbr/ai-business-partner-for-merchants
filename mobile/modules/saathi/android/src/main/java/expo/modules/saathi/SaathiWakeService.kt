package expo.modules.saathi

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors
import java.util.regex.Pattern

/**
 * User-started Android microphone foreground service for Saathi. The recognizer is restarted
 * between utterances; it is stopped completely while the assistant speaks so it cannot answer
 * itself. Saathi never creates a receivable until an explicit spoken confirmation is heard.
 */
class SaathiWakeService : Service(), RecognitionListener, TextToSpeech.OnInitListener {
  companion object {
    const val EXTRA_TOKEN = "token"
    const val EXTRA_BASE_URL = "base_url"
    const val EXTRA_LANGUAGE = "language"
    const val EXTRA_CONVERSATION_ID = "conversation_id"
    const val EXTRA_VOICE_ID = "voice_id"
    const val ACTION_STOP = "expo.modules.saathi.STOP"
    const val PREFS = "saathi_background"
    const val PREF_RUNNING = "running"
    private const val CHANNEL_ID = "saathi_background_mic"
    private const val NOTIFICATION_ID = 7401
    private const val LOG_TAG = "SaathiWakeService"
    private const val QUERY_WINDOW_MS = 12_000L
    private const val CONFIRM_WINDOW_MS = 25_000L
    private const val RESTART_DELAY_MS = 650L
    private const val SYSTEM_RECOGNIZER_TIMEOUT_MS = 8_000L
    private const val UNAVAILABLE_RETRY_MS = 30_000L
  }

  private val handler = Handler(Looper.getMainLooper())
  private val network = Executors.newSingleThreadExecutor()
  private val prefs by lazy { getSharedPreferences(PREFS, MODE_PRIVATE) }
  private var recognizer: SpeechRecognizer? = null
  private var tts: TextToSpeech? = null
  private var ttsReady = false
  private var mediaPlayer: MediaPlayer? = null
  private var audioFile: File? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var token: String? = null
  private var baseUrl = ""
  private var language = "en"
  private var voiceId: String? = null
  private var conversationId: String? = null
  private var isListening = false
  private var processing = false
  private var awaitingQuestion = false
  private var pendingDraft: JSONObject? = null
  private var awaitingConfirmation = false
  private var confirmAfterSpeech = false
  private var stopAfterSpeech = false
  private var preferOnDevice = true
  private var fellBackToSystem = false
  private var awaitingSystemRecognizerReady = false

  private val systemRecognizerTimeout = Runnable {
    if (awaitingSystemRecognizerReady && prefs.getBoolean(PREF_RUNNING, false)) {
      awaitingSystemRecognizerReady = false
      isListening = false
      recreateRecognizer()
      val languageName = if (language == "hi") "Hindi (India)" else "English (India)"
      updateNotification("$languageName speech isn't available yet. Install or enable it in Android speech settings; Saathi will retry.")
      Log.w(LOG_TAG, "$languageName recognition did not become ready; retrying later")
      startRecognitionSoon(UNAVAILABLE_RETRY_MS)
    }
  }

  private val questionWindow = Runnable {
    if (awaitingQuestion && !processing) {
      awaitingQuestion = false
      updateNotification("Say ‘Saathi’ when you want to ask something")
      startRecognitionSoon()
    }
  }

  private val confirmationWindow = Runnable {
    if (awaitingConfirmation && !processing) {
      awaitingConfirmation = false
      pendingDraft = null
      say("I did not save that pending due because I did not hear a confirmation.", false)
    }
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    tts = TextToSpeech(applicationContext, this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSaathi()
      return START_NOT_STICKY
    }

    intent?.getStringExtra(EXTRA_TOKEN)?.let { token = it }
    intent?.getStringExtra(EXTRA_BASE_URL)?.let { baseUrl = it.trimEnd('/') }
    intent?.getStringExtra(EXTRA_LANGUAGE)?.let { language = if (it == "hi") "hi" else "en" }
    intent?.getStringExtra(EXTRA_VOICE_ID)?.let { voiceId = it }
    intent?.getStringExtra(EXTRA_CONVERSATION_ID)?.let { conversationId = it }
    if (conversationId.isNullOrBlank()) conversationId = prefs.getString("conversation_id", null)

    if (token.isNullOrBlank() || baseUrl.isBlank()) {
      Log.w(LOG_TAG, "Missing signed-in session or API URL; stopping background listener")
      stopSaathi()
      return START_NOT_STICKY
    }

    prefs.edit().putBoolean(PREF_RUNNING, true).apply()
    try {
      val notification = buildNotification("Say ‘Saathi’ to ask about your business")
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      acquireWakeLock()
      startRecognitionSoon()
    } catch (error: Exception) {
      Log.e(LOG_TAG, "Could not start foreground microphone listener", error)
      stopSaathi()
    }
    // Android can redeliver the original service Intent if the process is reclaimed. The token
    // is kept in that in-memory redelivery path, never copied into preferences or a file.
    return START_REDELIVER_INTENT
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onInit(status: Int) {
    ttsReady = status == TextToSpeech.SUCCESS
    if (ttsReady) {
      tts?.setAudioAttributes(AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build())
      tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) = Unit
        override fun onDone(utteranceId: String?) { handler.post { onSpeechFinished() } }
        @Deprecated("Deprecated by Android")
        override fun onError(utteranceId: String?) { handler.post { onSpeechFinished() } }
        override fun onError(utteranceId: String?, errorCode: Int) { handler.post { onSpeechFinished() } }
      })
    }
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val manager = getSystemService(POWER_SERVICE) as PowerManager
    wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:SaathiListener")
      .apply { setReferenceCounted(false); acquire() }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(CHANNEL_ID, "Saathi background listening", NotificationManager.IMPORTANCE_LOW)
      .apply { description = "Visible while Saathi listens for its wake word in the background" }
    (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
  }

  private fun buildNotification(message: String): Notification {
    val openApp = packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val stopIntent = Intent(this, SaathiWakeService::class.java).setAction(ACTION_STOP)
    val stopPending = PendingIntent.getService(this, 1, stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle("Saathi is active")
      .setContentText(message)
      .setStyle(NotificationCompat.BigTextStyle().bigText("$message. Microphone access is active; tap Stop to end background listening."))
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(openApp)
      .addAction(android.R.drawable.ic_media_pause, "Stop", stopPending)
      .build()
  }

  private fun updateNotification(message: String) {
    if (prefs.getBoolean(PREF_RUNNING, false)) {
      (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
        .notify(NOTIFICATION_ID, buildNotification(message))
    }
  }

  private fun startRecognitionSoon(delay: Long = RESTART_DELAY_MS) {
    handler.removeCallbacks(recognitionRestart)
    handler.postDelayed(recognitionRestart, delay)
  }

  private val recognitionRestart = Runnable { startRecognition() }

  private fun startRecognition() {
    if (!prefs.getBoolean(PREF_RUNNING, false) || processing || isListening || ttsSpeaking) return
    if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      updateNotification("Microphone permission is missing. Open the app to enable Saathi.")
      return
    }
    try {
      val current = recognizer ?: createRecognizer().also { recognizer = it }
      val locale = if (language == "hi") "hi-IN" else "en-IN"
      if (!preferOnDevice) {
        awaitingSystemRecognizerReady = true
        handler.removeCallbacks(systemRecognizerTimeout)
        handler.postDelayed(systemRecognizerTimeout, SYSTEM_RECOGNIZER_TIMEOUT_MS)
      }
      val recognitionIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, locale)
        putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, false)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        // Keep the on-device recognizer offline when available, but let Android's
        // configured service use its network fallback if the locale pack is missing.
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, preferOnDevice)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
      }
      current.startListening(recognitionIntent)
      isListening = true
      if (awaitingSystemRecognizerReady) {
        updateNotification("Connecting to Android speech recognition")
      } else {
        updateNotification(if (awaitingConfirmation) "Listening for your save confirmation" else if (awaitingQuestion) "Listening for your question" else "Say ‘Saathi’ to ask about your business")
      }
    } catch (error: Exception) {
      Log.w(LOG_TAG, "Speech recognition could not start", error)
      isListening = false
      recreateRecognizer()
      startRecognitionSoon(1_500)
    }
  }

  private fun createRecognizer(): SpeechRecognizer {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && preferOnDevice &&
      SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
      return try {
        SpeechRecognizer.createOnDeviceSpeechRecognizer(this).also { it.setRecognitionListener(this) }
      } catch (error: Exception) {
        Log.i(LOG_TAG, "On-device speech recognizer unavailable; using Android speech service")
        preferOnDevice = false
        SpeechRecognizer.createSpeechRecognizer(this).also { it.setRecognitionListener(this) }
      }
    }
    return SpeechRecognizer.createSpeechRecognizer(this).also { it.setRecognitionListener(this) }
  }

  private fun recreateRecognizer() {
    isListening = false
    try { recognizer?.cancel() } catch (_: Exception) { }
    try { recognizer?.destroy() } catch (_: Exception) { }
    recognizer = null
  }

  override fun onReadyForSpeech(params: android.os.Bundle?) {
    handler.removeCallbacks(systemRecognizerTimeout)
    awaitingSystemRecognizerReady = false
    updateNotification(if (awaitingConfirmation) "Listening for your save confirmation" else if (awaitingQuestion) "Listening for your question" else "Say ‘Saathi’ to ask about your business")
  }
  override fun onBeginningOfSpeech() = Unit
  override fun onRmsChanged(rmsdB: Float) = Unit
  override fun onBufferReceived(buffer: ByteArray?) = Unit
  override fun onEndOfSpeech() { isListening = false }

  override fun onResults(results: android.os.Bundle?) {
    handler.removeCallbacks(systemRecognizerTimeout)
    awaitingSystemRecognizerReady = false
    isListening = false
    val transcript = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()
    recreateRecognizer()
    if (transcript.isBlank()) {
      startRecognitionSoon()
      return
    }
    handleUtterance(transcript)
  }

  override fun onPartialResults(partialResults: android.os.Bundle?) = Unit
  override fun onEvent(eventType: Int, params: android.os.Bundle?) = Unit

  override fun onError(error: Int) {
    handler.removeCallbacks(systemRecognizerTimeout)
    awaitingSystemRecognizerReady = false
    isListening = false
    recreateRecognizer()
    if (!prefs.getBoolean(PREF_RUNNING, false) || processing || ttsSpeaking) return
    // If the offline recognizer does not have this language pack, fall back once to Android's
    // configured recognition service. The notification/privacy copy in the app says so.
    val canTrySystem = preferOnDevice && !fellBackToSystem && error in setOf(
      SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
      SpeechRecognizer.ERROR_SERVER, SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED,
      SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE
    )
    if (canTrySystem) {
      preferOnDevice = false
      fellBackToSystem = true
      Log.i(LOG_TAG, "Offline recognition is unavailable for selected locale; switching to Android speech service")
    } else if (fellBackToSystem && error in setOf(
        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED,
        SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE
      )) {
      val languageName = if (language == "hi") "Hindi (India)" else "English (India)"
      updateNotification("$languageName speech is unavailable. Install or enable it in Android speech settings; Saathi will retry.")
      Log.w(LOG_TAG, "$languageName speech is unavailable in the configured Android recognition service")
      startRecognitionSoon(30_000L)
      return
    } else if (error != SpeechRecognizer.ERROR_NO_MATCH && error != SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
      Log.w(LOG_TAG, "Android speech recognition error $error; restarting")
    }
    startRecognitionSoon(if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) 1_200 else RESTART_DELAY_MS)
  }

  private fun handleUtterance(raw: String) {
    if (awaitingConfirmation) {
      handleConfirmation(raw)
      return
    }
    if (awaitingQuestion) {
      handler.removeCallbacks(questionWindow)
      awaitingQuestion = false
      submitQuestion(stripWakeWord(raw).ifBlank { raw })
      return
    }

    val wake = wakePattern.matcher(raw)
    if (wake.find()) {
      val question = raw.substring(wake.end()).trim(' ', ',', '.', '!', '?', ':', ';', '-')
      if (question.isNotBlank()) {
        submitQuestion(question)
      } else {
        awaitingQuestion = true
        updateNotification("Saathi heard you. Ask your question now.")
        say(if (language == "hi") "जी, अपना सवाल बताइए।" else "Yes, tell me your question.", false)
        handler.removeCallbacks(questionWindow)
        handler.postDelayed(questionWindow, QUERY_WINDOW_MS)
      }
    } else {
      startRecognitionSoon()
    }
  }

  private val wakePattern = Pattern.compile("(?i)\\b(?:saathi|sathi|saathee)\\b|साथी|साथि")

  private fun stripWakeWord(value: String): String = wakePattern.matcher(value)
    .replaceFirst("").trim(' ', ',', '.', '!', '?', ':', ';', '-')

  private fun submitQuestion(question: String) {
    if (question.isBlank() || processing) {
      startRecognitionSoon()
      return
    }
    processing = true
    awaitingQuestion = false
    awaitingConfirmation = false
    pendingDraft = null
    handler.removeCallbacks(questionWindow)
    handler.removeCallbacks(confirmationWindow)
    recreateRecognizer()
    updateNotification("Saathi is checking your business records")
    network.execute {
      try {
        var id = conversationId
        if (id.isNullOrBlank()) {
          id = postJson("/conversations", JSONObject()).optString("id").takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("Could not create an assistant conversation")
          conversationId = id
          prefs.edit().putString("conversation_id", id).apply()
        }
        val body = JSONObject()
          .put("question", question.take(2000))
          .put("conversation_id", id)
          .put("response_language", language)
        val response = postJson("/assistant/query", body)
        val answer = response.optString("answer").ifBlank { "I couldn't find an answer. Please try again." }
        val draft = response.optJSONObject("pending_receivable_draft")
        handler.post {
          processing = false
          if (draft != null) {
            pendingDraft = JSONObject(draft.toString())
            updateNotification("Saathi needs your voice confirmation before saving a due")
            val followUp = if (language == "hi") "इसे आंतरिक बकाया के रूप में सेव करने के लिए ‘हाँ, सेव करो’ कहें, या रद्द करने के लिए ‘नहीं’।" else "Say ‘yes, save it’ to confirm this internal due, or say ‘no’ to cancel."
            say("${normalizeMoney(answer)} $followUp", true)
          } else {
            say(normalizeMoney(answer), false)
          }
        }
      } catch (error: Exception) {
        val message = if (error is ApiException && error.code == 401) {
          if (language == "hi") "आपका साइन-इन समाप्त हो गया है। फिर से साइन इन करने के लिए ऐप खोलें।"
          else "Your sign-in has expired. Open the app and sign in again."
        } else if (language == "hi") {
          "मैं अभी आपके व्यापारी रिकॉर्ड तक नहीं पहुँच पाया। कृपया इंटरनेट कनेक्शन जाँचें।"
        } else {
          "I couldn't reach your business records. Please check the internet connection and try again."
        }
        Log.w(LOG_TAG, "Background assistant request failed: ${error.message}")
        handler.post {
          processing = false
          if (error is ApiException && error.code == 401) {
            stopAfterSpeech = true
            updateNotification("Sign-in expired. Open the app to sign in again.")
          }
          say(message, false)
        }
      }
    }
  }

  private fun handleConfirmation(transcript: String) {
    val text = transcript.lowercase(Locale.ROOT)
      .replace(Regex("[,!?;:]+"), " ").replace(Regex("\\s+"), " ").trim()
    val negativePhrases = listOf("no", "no thanks", "cancel", "don't", "dont", "do not", "not now", "not correct", "wrong", "nahi", "nahin", "नहीं", "नही", "मत", "मत करो", "मत सेव करो", "रद्द")
    val negative = negativePhrases.any { text == it || text.startsWith("$it ") }
    val affirmativePhrases = listOf("yes", "yeah", "yep", "confirm", "confirmed", "save", "save it", "yes save", "yes save it", "please save", "please save it", "that's correct", "correct", "do it", "go ahead", "haan", "han", "हां", "हाँ", "सही", "सही है", "कर दो", "कर दीजिए", "सेव करो", "सेव कर दो", "हाँ सेव करो", "हां सेव करो", "हाँ सेव कर दीजिए")
    val affirmative = text in affirmativePhrases
    awaitingConfirmation = false
    handler.removeCallbacks(confirmationWindow)
    if (negative) {
      pendingDraft = null
      say(if (language == "hi") "ठीक है, मैंने बकाया सेव नहीं किया।" else "Okay, I did not save the pending due.", false)
    } else if (affirmative) {
      savePendingDraft()
    } else {
      pendingDraft = null
      say(if (language == "hi") "मैंने कुछ सेव नहीं किया। दोबारा पूछने के लिए साथी कहें।" else "I didn't save anything. Say Saathi when you want to ask another question.", false)
    }
  }

  private fun savePendingDraft() {
    val draft = pendingDraft ?: run { say("I no longer have a pending record to save.", false); return }
    processing = true
    updateNotification("Saving the confirmed internal customer due")
    network.execute {
      try {
        val body = JSONObject(draft.toString())
          .put("idempotency_key", "saathi-${UUID.randomUUID()}")
        val saved = postJson("/receivables", body)
        val created = saved.optBoolean("created", true)
        val name = draft.optString("customer_name")
        val amount = draft.optString("amount")
        val success = if (language == "hi") {
          if (created) "$name के नाम ${normalizeMoney("₹$amount")} का आंतरिक बकाया सेव हो गया। यह पेमेंट नहीं है।"
          else "यह बकाया पहले से सेव है।"
        } else {
          if (created) "The internal due from $name for ${normalizeMoney("₹$amount")} has been saved. This is not a payment."
          else "That internal due was already saved."
        }
        handler.post {
          processing = false
          pendingDraft = null
          say(success, false)
        }
      } catch (error: Exception) {
        Log.w(LOG_TAG, "Could not save confirmed receivable: ${error.message}")
        handler.post {
          processing = false
          pendingDraft = null
          say(if (language == "hi") "पुष्टि किया गया बकाया सेव नहीं हो पाया। ऐप खोलकर फिर कोशिश करें।" else "I couldn't save the confirmed due. Open the app and try again.", false)
        }
      }
    }
  }

  private fun postJson(path: String, json: JSONObject): JSONObject {
    val connection = (URL("$baseUrl$path").openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 12_000
      readTimeout = 25_000
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Accept", "application/json")
      setRequestProperty("Authorization", "Bearer ${token.orEmpty()}")
    }
    try {
      connection.outputStream.use { it.write(json.toString().toByteArray(Charsets.UTF_8)) }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val response = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
      if (status !in 200..299) {
        val detail = try { JSONObject(response).optString("detail") } catch (_: Exception) { "" }
        throw ApiException(status, detail.ifBlank { "Assistant request failed ($status)" })
      }
      return JSONObject(response)
    } finally {
      connection.disconnect()
    }
  }

  private fun requestSpeech(text: String): ByteArray? {
    val body = JSONObject().put("text", text.take(2500))
    voiceId?.takeIf { it.isNotBlank() }?.let { body.put("voice_id", it) }
    val connection = (URL("$baseUrl/assistant/speech").openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 12_000
      readTimeout = 35_000
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Accept", "audio/mpeg")
      setRequestProperty("Authorization", "Bearer ${token.orEmpty()}")
    }
    return try {
      connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
      if (connection.responseCode !in 200..299) return null
      connection.inputStream.use { input ->
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        var total = 0
        while (true) {
          val count = input.read(buffer)
          if (count < 0) break
          total += count
          if (total > 8_000_000) return null
          output.write(buffer, 0, count)
        }
        output.toByteArray()
      }
    } catch (error: Exception) {
      Log.i(LOG_TAG, "ElevenLabs audio unavailable; using the Android speech voice")
      null
    } finally {
      connection.disconnect()
    }
  }

  private fun say(text: String, waitForConfirmation: Boolean) {
    recreateRecognizer()
    handler.removeCallbacks(questionWindow)
    tts?.stop()
    stopPlayer()
    confirmAfterSpeech = waitForConfirmation
    ttsSpeaking = true
    updateNotification(if (waitForConfirmation) "Saathi is speaking; confirmation is required to save" else "Saathi is replying")
    network.execute {
      val bytes = requestSpeech(text)
      if (bytes == null) {
        handler.post { speakOnDevice(text, waitForConfirmation) }
      } else {
        handler.post {
          try {
            val file = File.createTempFile("saathi-reply-", ".mp3", cacheDir)
            file.writeBytes(bytes)
            audioFile = file
            val player = MediaPlayer()
            mediaPlayer = player
            player.setAudioAttributes(AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            player.setDataSource(file.absolutePath)
            player.setOnCompletionListener { onSpeechFinished() }
            player.setOnErrorListener { _, _, _ ->
              stopPlayer()
              speakOnDevice(text, waitForConfirmation)
              true
            }
            player.setOnPreparedListener { it.start() }
            player.prepareAsync()
          } catch (_: Exception) {
            stopPlayer()
            speakOnDevice(text, waitForConfirmation)
          }
        }
      }
    }
  }

  private var ttsSpeaking = false

  private fun speakOnDevice(text: String, waitForConfirmation: Boolean) {
    if (!ttsReady) {
      ttsSpeaking = false
      onSpeechFinished()
      return
    }
    ttsSpeaking = true
    val locale = if (language == "hi") Locale("hi", "IN") else Locale("en", "IN")
    val languageResult = tts?.setLanguage(locale)
    if (languageResult == TextToSpeech.LANG_MISSING_DATA || languageResult == TextToSpeech.LANG_NOT_SUPPORTED) {
      tts?.language = Locale("en", "IN")
    }
    val utterance = UUID.randomUUID().toString()
    tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, utterance)
  }

  private fun onSpeechFinished() {
    ttsSpeaking = false
    stopPlayer()
    if (stopAfterSpeech) {
      stopAfterSpeech = false
      stopSaathi()
      return
    }
    if (confirmAfterSpeech && pendingDraft != null) {
      confirmAfterSpeech = false
      awaitingConfirmation = true
      updateNotification("Say yes to save the internal due, or no to cancel it")
      startRecognitionSoon(450)
      handler.removeCallbacks(confirmationWindow)
      handler.postDelayed(confirmationWindow, CONFIRM_WINDOW_MS)
    } else {
      confirmAfterSpeech = false
      updateNotification("Say ‘Saathi’ to ask about your business")
      startRecognitionSoon(450)
    }
  }

  private fun stopPlayer() {
    try { mediaPlayer?.setOnCompletionListener(null); mediaPlayer?.setOnErrorListener(null); mediaPlayer?.stop() } catch (_: Exception) { }
    try { mediaPlayer?.release() } catch (_: Exception) { }
    mediaPlayer = null
    try { audioFile?.delete() } catch (_: Exception) { }
    audioFile = null
  }

  private fun stopSaathi() {
    prefs.edit().putBoolean(PREF_RUNNING, false).remove("conversation_id").apply()
    handler.removeCallbacksAndMessages(null)
    processing = false
    awaitingQuestion = false
    awaitingConfirmation = false
    pendingDraft = null
    token = null
    recreateRecognizer()
    tts?.stop()
    stopPlayer()
    try { tts?.shutdown() } catch (_: Exception) { }
    tts = null
    try { wakeLock?.takeIf { it.isHeld }?.release() } catch (_: Exception) { }
    wakeLock = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE) else stopForeground(true)
    stopSelf()
  }

  override fun onDestroy() {
    prefs.edit().putBoolean(PREF_RUNNING, false).apply()
    handler.removeCallbacksAndMessages(null)
    recreateRecognizer()
    try { tts?.stop(); tts?.shutdown() } catch (_: Exception) { }
    stopPlayer()
    try { wakeLock?.takeIf { it.isHeld }?.release() } catch (_: Exception) { }
    network.shutdownNow()
    super.onDestroy()
  }

  private fun normalizeMoney(text: String): String {
    val matcher = moneyPattern.matcher(text)
    val output = StringBuffer()
    while (matcher.find()) {
      val amount = matcher.group(1) ?: matcher.group(2) ?: continue
      val spoken = amountToWords(amount, language == "hi")
      matcher.appendReplacement(output, java.util.regex.Matcher.quoteReplacement(spoken))
    }
    matcher.appendTail(output)
    return output.toString().replace("₹", if (language == "hi") " रुपये " else " rupees ")
      .replace(Regex("\\b(?:Rs\\.?|INR)\\b", RegexOption.IGNORE_CASE), if (language == "hi") "रुपये" else "rupees")
  }

  private val moneyPattern = Pattern.compile("(?i)(?:₹\\s*|\\bRs\\.?\\s*|\\bINR\\s*)([+-]?[0-9०-९][0-9०-९,]*(?:\\.[0-9०-९]{1,2})?)|([0-9०-९][0-9०-९,]*\\.[0-9०-९]{1,2})(?=\\s*(?:INR|Rs\\.?|rupees?|रुपये|रुपया|रुपए))")

  private fun amountToWords(raw: String, hindi: Boolean): String {
    val normalized = raw.map { if (it in '०'..'९') ('0'.code + (it - '०')).toChar() else it }.joinToString("").replace(",", "")
    val parts = normalized.split('.')
    val signedWhole = parts[0].toLongOrNull() ?: return "$raw ${if (hindi) "रुपये" else "rupees"}"
    val negative = signedWhole < 0
    val whole = kotlin.math.abs(signedWhole)
    if (whole > 999_999_999_999L) return "$raw ${if (hindi) "रुपये" else "rupees"}"
    val paise = if (parts.size > 1) (parts[1] + "00").take(2).toIntOrNull() ?: 0 else 0
    val wholeWords = if (hindi) hindiNumber(whole) else englishNumber(whole)
    var result = if (hindi) "$wholeWords ${if (whole == 1L) "रुपया" else "रुपये"}" else "$wholeWords ${if (whole == 1L) "rupee" else "rupees"}"
    if (paise > 0) {
      val fraction = if (hindi) hindiNumber(paise.toLong()) else englishNumber(paise.toLong())
      result += if (hindi) " और $fraction ${if (paise == 1) "पैसा" else "पैसे"}" else " and $fraction ${if (paise == 1) "paisa" else "paise"}"
    }
    if (negative) result = if (hindi) "माइनस $result" else "minus $result"
    return result
  }

  private fun englishNumber(value: Long): String {
    val small = arrayOf("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen")
    val tens = arrayOf("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")
    if (value < 20) return small[value.toInt()]
    if (value < 100) return tens[(value / 10).toInt()] + if (value % 10 == 0L) "" else "-" + small[(value % 10).toInt()]
    val units = listOf(10_000_000L to "crore", 100_000L to "lakh", 1_000L to "thousand", 100L to "hundred")
    for ((scale, name) in units) if (value >= scale) {
      val left = englishNumber(value / scale) + " " + name
      return if (value % scale == 0L) left else "$left ${englishNumber(value % scale)}"
    }
    return value.toString()
  }

  private fun hindiNumber(value: Long): String {
    val small = arrayOf("शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ", "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस", "बीस", "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस", "तीस", "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस", "चालीस", "इकतालीस", "बयालीस", "तैंतालीस", "चवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास", "पचास", "इक्यावन", "बावन", "तिरपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन", "उनसठ", "साठ", "इकसठ", "बासठ", "तिरसठ", "चौंसठ", "पैंसठ", "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर", "सत्तर", "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उन्नासी", "अस्सी", "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी", "नब्बे", "इक्यानवे", "बानवे", "तिरानवे", "चौरानवे", "पंचानवे", "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे")
    if (value < 100) return small[value.toInt()]
    val units = listOf(10_000_000L to "करोड़", 100_000L to "लाख", 1_000L to "हज़ार", 100L to "सौ")
    for ((scale, name) in units) if (value >= scale) {
      val left = hindiNumber(value / scale) + " " + name
      return if (value % scale == 0L) left else "$left ${hindiNumber(value % scale)}"
    }
    return value.toString()
  }

  private class ApiException(val code: Int, message: String) : Exception(message)
}
