package com.jake750.waraq

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.print.PdfPrinter
import android.print.PrintAttributes
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.JSArray
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileInputStream

/** Android-only services for Waraq: saving outputs to Downloads, sharing, file names, HTML → PDF printing. */
@TauriPlugin
class WaraqPlugin(private val activity: Activity) : Plugin(activity) {

  /** Files handed to us by another app ("Open with", "Share") not yet taken by the page. */
  private val pending = mutableListOf<String>()

  private fun urisOf(intent: Intent?): List<Uri> {
    if (intent == null) return emptyList()
    @Suppress("DEPRECATION")
    return when (intent.action) {
      Intent.ACTION_VIEW -> listOfNotNull(intent.data)
      Intent.ACTION_SEND -> listOfNotNull(intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri)
      Intent.ACTION_SEND_MULTIPLE -> intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM) ?: emptyList()
      else -> emptyList()
    }
  }

  override fun load(webView: WebView) {
    super.load(webView)
    synchronized(pending) { urisOf(activity.intent).forEach { pending.add(it.toString()) } }
  }

  /** A file opened while the app is already running: queued, and the page is told. */
  override fun onNewIntent(intent: Intent) {
    val uris = urisOf(intent).map { it.toString() }
    if (uris.isEmpty()) return
    synchronized(pending) { pending.addAll(uris) }
    trigger("incoming", JSObject())
  }

  /** Takes (and clears) the files waiting to be opened. */
  @Command
  fun incoming(invoke: Invoke) {
    val list = JSArray()
    synchronized(pending) {
      pending.forEach { list.put(it) }
      pending.clear()
    }
    val result = JSObject()
    result.put("uris", list)
    invoke.resolve(result)
  }

  /** Keeps read access to a picked file across restarts, so Recent can reopen it (best effort). */
  @Command
  fun persist(invoke: Invoke) {
    val uri = Uri.parse(invoke.getArgs().getString("uri") ?: return invoke.reject("missing uri"))
    try {
      activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    } catch (e: Exception) {
      // Not a persistable grant (e.g. a share or a VIEW intent): the file works for this session only.
    }
    invoke.resolve()
  }

  /** Copies a finished file (app cache) into Downloads/Waraq as a new entry. Never overwrites. */
  @Command
  fun saveToDownloads(invoke: Invoke) {
    val args = invoke.getArgs()
    val path = args.getString("path") ?: return invoke.reject("missing path")
    val name = args.getString("name") ?: File(path).name
    val mime = args.getString("mime") ?: "application/octet-stream"
    try {
      val src = File(path)
      val resolver = activity.contentResolver
      val result = JSObject()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val values = ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, name) // MediaStore adds " (1)" itself if taken
          put(MediaStore.Downloads.MIME_TYPE, mime)
          put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Waraq")
          put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
          ?: return invoke.reject("write-failed")
        try {
          resolver.openOutputStream(uri)!!.use { out -> FileInputStream(src).use { it.copyTo(out) } }
          values.clear()
          values.put(MediaStore.Downloads.IS_PENDING, 0)
          resolver.update(uri, values, null, null)
        } catch (e: Exception) {
          resolver.delete(uri, null, null) // no half-written outputs
          throw e
        }
        result.put("uri", uri.toString())
        result.put("label", "Download/Waraq/" + (queryName(uri) ?: name))
      } else {
        // Android 9 and older: the app's own external files folder (no storage permission needed).
        val dir = File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Waraq").apply { mkdirs() }
        var target = File(dir, name)
        var n = 2
        val dot = name.lastIndexOf('.')
        while (target.exists()) {
          target = File(dir, if (dot > 0) "${name.substring(0, dot)} ($n)${name.substring(dot)}" else "$name ($n)")
          n++
        }
        src.copyTo(target)
        val uri = FileProvider.getUriForFile(activity, activity.packageName + ".fileprovider", target)
        result.put("uri", uri.toString())
        result.put("label", target.absolutePath)
      }
      src.delete()
      invoke.resolve(result)
    } catch (e: Exception) {
      invoke.reject("write-failed", e)
    }
  }

  /** Opens the system share sheet for a saved output. */
  @Command
  fun share(invoke: Invoke) {
    val args = invoke.getArgs()
    val uri = Uri.parse(args.getString("uri") ?: return invoke.reject("missing uri"))
    val mime = args.getString("mime") ?: "application/octet-stream"
    val send = Intent(Intent.ACTION_SEND).apply {
      type = mime
      putExtra(Intent.EXTRA_STREAM, uri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    activity.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
    invoke.resolve()
  }

  /** Opens a saved output in another app (a PDF reader, Word, …). */
  @Command
  fun view(invoke: Invoke) {
    val args = invoke.getArgs()
    val uri = Uri.parse(args.getString("uri") ?: return invoke.reject("missing uri"))
    val mime = args.getString("mime") ?: "application/octet-stream"
    try {
      activity.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
      invoke.resolve()
    } catch (e: Exception) {
      invoke.reject("no-app", e)
    }
  }

  /** The real file name behind a content:// URI (pickers often hand out opaque ids). */
  @Command
  fun displayName(invoke: Invoke) {
    val uri = Uri.parse(invoke.getArgs().getString("uri") ?: return invoke.reject("missing uri"))
    val result = JSObject()
    result.put("name", queryName(uri))
    invoke.resolve(result)
  }

  private fun queryName(uri: Uri): String? = try {
    activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
      if (c.moveToFirst()) c.getString(0) else null
    }
  } catch (e: Exception) {
    null
  }

  /** Prints an HTML file to a PDF file with the system WebView (correct Arabic shaping, real text). */
  @Command
  fun htmlToPdf(invoke: Invoke) {
    val args = invoke.getArgs()
    val htmlPath = args.getString("htmlPath") ?: return invoke.reject("missing htmlPath")
    val outPath = args.getString("outPath") ?: return invoke.reject("missing outPath")
    val letter = args.getString("size") == "Letter"
    val landscape = args.getBoolean("landscape", false)
    val html = File(htmlPath).readText()
    activity.runOnUiThread {
      val wv = WebView(activity)
      wv.settings.javaScriptEnabled = false
      wv.settings.allowFileAccess = false
      wv.webViewClient = object : WebViewClient() {
        private var started = false
        override fun onPageFinished(view: WebView, url: String?) {
          if (started) return
          started = true
          var media = if (letter) PrintAttributes.MediaSize.NA_LETTER else PrintAttributes.MediaSize.ISO_A4
          if (landscape) media = media.asLandscape()
          val attrs = PrintAttributes.Builder()
            .setMediaSize(media)
            .setResolution(PrintAttributes.Resolution("pdf", "pdf", 300, 300))
            .setMinMargins(PrintAttributes.Margins.NO_MARGINS) // margins come from the page's @page CSS
            .build()
          val adapter = view.createPrintDocumentAdapter("waraq")
          PdfPrinter(attrs).print(adapter, File(outPath)) { ok, err ->
            activity.runOnUiThread { view.destroy() }
            if (ok) invoke.resolve() else invoke.reject(err ?: "engine-failed")
          }
        }
      }
      wv.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
    }
  }
}
