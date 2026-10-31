package expo.modules.saathi

import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SaathiModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Saathi")

    AsyncFunction("start") {
        token: String,
        baseUrl: String,
        language: String,
        conversationId: String?,
        voiceId: String? ->
      val context = appContext.reactContext ?: throw IllegalStateException("App context is unavailable")
      require(token.isNotBlank()) { "Sign in before enabling background Saathi." }
      require(baseUrl.startsWith("https://") || baseUrl.startsWith("http://10.0.2.2")) {
        "Use a secure backend URL to enable background Saathi."
      }

      val intent = Intent(context, SaathiWakeService::class.java).apply {
        putExtra(SaathiWakeService.EXTRA_TOKEN, token)
        putExtra(SaathiWakeService.EXTRA_BASE_URL, baseUrl)
        putExtra(SaathiWakeService.EXTRA_LANGUAGE, if (language == "hi") "hi" else "en")
        putExtra(SaathiWakeService.EXTRA_CONVERSATION_ID, conversationId)
        putExtra(SaathiWakeService.EXTRA_VOICE_ID, voiceId)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
      mapOf("running" to true)
    }

    AsyncFunction("stop") {
      val context = appContext.reactContext
      if (context != null) {
        context.startService(Intent(context, SaathiWakeService::class.java).setAction(SaathiWakeService.ACTION_STOP))
      }
      true
    }

    Function("isRunning") {
      val context = appContext.reactContext ?: return@Function false
      context.getSharedPreferences(SaathiWakeService.PREFS, Context.MODE_PRIVATE)
        .getBoolean(SaathiWakeService.PREF_RUNNING, false)
    }
  }
}
