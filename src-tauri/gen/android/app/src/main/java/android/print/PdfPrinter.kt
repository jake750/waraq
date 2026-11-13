package android.print

import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import java.io.File

/**
 * Drives a PrintDocumentAdapter straight into a PDF file, without the system print dialog.
 * Lives in android.print because LayoutResultCallback/WriteResultCallback have package-private constructors.
 */
class PdfPrinter(private val attributes: PrintAttributes) {
  fun print(adapter: PrintDocumentAdapter, out: File, done: (Boolean, String?) -> Unit) {
    adapter.onStart()
    adapter.onLayout(null, attributes, null, object : PrintDocumentAdapter.LayoutResultCallback() {
      override fun onLayoutFinished(info: PrintDocumentInfo, changed: Boolean) {
        val pfd = try {
          ParcelFileDescriptor.open(
            out,
            ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE or ParcelFileDescriptor.MODE_READ_WRITE,
          )
        } catch (e: Exception) {
          adapter.onFinish()
          return done(false, e.message)
        }
        adapter.onWrite(arrayOf(PageRange.ALL_PAGES), pfd, CancellationSignal(), object : PrintDocumentAdapter.WriteResultCallback() {
          override fun onWriteFinished(pages: Array<PageRange>) {
            pfd.close()
            adapter.onFinish()
            done(true, null)
          }

          override fun onWriteFailed(error: CharSequence?) {
            pfd.close()
            adapter.onFinish()
            out.delete()
            done(false, error?.toString())
          }

          override fun onWriteCancelled() {
            pfd.close()
            adapter.onFinish()
            out.delete()
            done(false, "cancelled")
          }
        })
      }

      override fun onLayoutFailed(error: CharSequence?) {
        adapter.onFinish()
        done(false, error?.toString())
      }
    }, null)
  }
}
