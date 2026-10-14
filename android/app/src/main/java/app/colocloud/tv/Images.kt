@file:OptIn(UnstableApi::class)

package app.colocloud.tv

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.OptIn
import androidx.exifinterface.media.ExifInterface
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSourceInputStream
import androidx.media3.datasource.DataSpec
import java.io.ByteArrayInputStream
import java.util.concurrent.Executors

// Decodes images for ImageSlide, off the main thread, from the files
// MediaStore keeps (or the network, the first time). Decoded at no more
// than the screen needs, turned upright, and handed over already uploaded
// to the GPU where the stick supports that, so the first frame of a
// transition never waits on a decode or an upload. The few most recent are
// kept, which is what makes prepare() — decoding the next slide while the
// current one shows — pay off.
object Images {
    private const val TAG = "Images"
    private const val KEEP = 3

    private val main = Handler(Looper.getMainLooper())
    private val decoder = Executors.newSingleThreadExecutor()
    private val decoded = object : LinkedHashMap<String, Bitmap>(KEEP + 1, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Bitmap>) = size > KEEP
    }
    private val waiting = HashMap<String, MutableList<(Bitmap?) -> Unit>>()

    // The screen's long and short sides, in pixels.
    private var longSide = 1920
    private var shortSide = 1080

    fun setScreenSize(width: Int, height: Int) {
        if (width <= 0 || height <= 0) return
        longSide = maxOf(width, height)
        shortSide = minOf(width, height)
    }

    // Main thread. Calls back on the main thread — straight away for an
    // image that's already decoded — with null if it couldn't be.
    fun get(url: String, callback: (Bitmap?) -> Unit) {
        decoded[url]?.let {
            callback(it)
            return
        }
        val callbacks = waiting[url]
        if (callbacks != null) {
            callbacks.add(callback)
            return
        }
        waiting[url] = mutableListOf(callback)
        val long = longSide
        val short = shortSide
        decoder.execute {
            val bitmap = try {
                decode(url, long, short)
            } catch (e: Throwable) {
                Log.w(TAG, "Couldn't decode $url", e)
                null
            }
            main.post {
                if (bitmap != null) decoded[url] = bitmap
                waiting.remove(url)?.forEach { it(bitmap) }
            }
        }
    }

    fun prepare(url: String) = get(url) {}

    private fun decode(url: String, long: Int, short: Int): Bitmap? {
        val bytes = DataSourceInputStream(MediaStore.dataSourceFactory.createDataSource(), DataSpec(Uri.parse(url)))
            .use { it.readBytes() }

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        // The largest power-of-two reduction that still leaves at least the
        // screen's own resolution; the view scales the rest of the way.
        val imageLong = maxOf(bounds.outWidth, bounds.outHeight)
        val imageShort = minOf(bounds.outWidth, bounds.outHeight)
        var sample = 1
        while (imageLong / (sample * 2) >= long && imageShort / (sample * 2) >= short) sample *= 2

        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        var bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null

        // Uploads are normally stored upright already (prepareImage.ts), but
        // older ones may still carry a "turn this" flag.
        val exif = try {
            ExifInterface(ByteArrayInputStream(bytes))
        } catch (_: Exception) {
            null
        }
        if (exif != null && (exif.rotationDegrees != 0 || exif.isFlipped)) {
            val matrix = Matrix()
            if (exif.isFlipped) matrix.preScale(-1f, 1f)
            matrix.postRotate(exif.rotationDegrees.toFloat())
            bitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        }

        if (Build.VERSION.SDK_INT >= 26) {
            bitmap.copy(Bitmap.Config.HARDWARE, false)?.let { return it }
        }
        return bitmap
    }
}
