@file:OptIn(UnstableApi::class)

package app.colocloud.tv

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.MediaDataSource
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.OptIn
import androidx.annotation.RequiresApi
import androidx.media3.common.C
import androidx.exifinterface.media.ExifInterface
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSourceInputStream
import androidx.media3.datasource.DataSpec
import java.io.ByteArrayInputStream
import java.util.concurrent.Executors

// Decodes images for ImageSlide — and the first frame of each video, for
// VideoSlide to show while it transitions in — off the main thread, from
// the files MediaStore keeps (or the network, the first time). Decoded at no more
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
        val long = longSide
        val short = shortSide
        load(url, callback) { decode(url, long, short) }
    }

    fun prepare(url: String) = get(url) {}

    // The same for a video's first frame.
    fun getFirstFrame(url: String, callback: (Bitmap?) -> Unit) {
        load("frame:$url", callback) { decodeFirstFrame(url) }
    }

    fun prepareFirstFrame(url: String) = getFirstFrame(url) {}

    private fun load(key: String, callback: (Bitmap?) -> Unit, decode: () -> Bitmap?) {
        decoded[key]?.let {
            callback(it)
            return
        }
        val callbacks = waiting[key]
        if (callbacks != null) {
            callbacks.add(callback)
            return
        }
        waiting[key] = mutableListOf(callback)
        decoder.execute {
            val bitmap = try {
                decode()
            } catch (e: Throwable) {
                Log.w(TAG, "Couldn't decode $key", e)
                null
            }
            main.post {
                if (bitmap != null) decoded[key] = bitmap
                waiting.remove(key)?.forEach { it(bitmap) }
            }
        }
    }

    // Android's own frame extractor, reading the video from the media store
    // through StoredSource. Needs Android 6+; older sticks show the
    // background in its place.
    private fun decodeFirstFrame(url: String): Bitmap? {
        if (Build.VERSION.SDK_INT < 23) return null
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(StoredSource(url))
            var bitmap = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC) ?: return null
            // Some Android versions turn the frame by the video's rotation
            // tag and some don't; turn it here if a quarter turn hasn't been
            // (its width gives that away). A half turn can't be told apart,
            // and is left as it comes.
            val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
            val width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
            if ((rotation == 90 || rotation == 270) && width > 0 && bitmap.width == width && bitmap.width != bitmap.height) {
                val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
                bitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            }
            if (Build.VERSION.SDK_INT >= 26) bitmap.copy(Bitmap.Config.HARDWARE, false)?.let { return it }
            return bitmap
        } finally {
            retriever.release()
        }
    }

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

// A stored video as MediaMetadataRetriever reads it: random reads, served
// from MediaStore (the network only for parts not downloaded yet), through
// a small read-ahead buffer, since the extractor reads in many small pieces.
@RequiresApi(23)
private class StoredSource(url: String) : MediaDataSource() {
    private val uri = Uri.parse(url)
    private var bufferStart = -1L
    private var buffer = ByteArray(0)
    private var size = -2L

    override fun readAt(position: Long, out: ByteArray, offset: Int, length: Int): Int {
        if (length == 0) return 0
        if (bufferStart < 0 || position < bufferStart || position + length > bufferStart + buffer.size) {
            fill(position, maxOf(length, CHUNK))
            if (buffer.isEmpty()) return -1
        }
        val start = (position - bufferStart).toInt()
        val n = minOf(length, buffer.size - start)
        if (n <= 0) return -1
        System.arraycopy(buffer, start, out, offset, n)
        return n
    }

    private fun fill(position: Long, length: Int) {
        val source = MediaStore.dataSourceFactory.createDataSource()
        try {
            source.open(DataSpec.Builder().setUri(uri).setPosition(position).setLength(length.toLong()).build())
            val data = ByteArray(length)
            var read = 0
            while (read < length) {
                val n = source.read(data, read, length - read)
                if (n == C.RESULT_END_OF_INPUT) break
                read += n
            }
            bufferStart = position
            buffer = if (read == length) data else data.copyOf(read)
        } catch (e: Exception) {
            // Past the end of the file reads as nothing; anything else too.
            bufferStart = position
            buffer = ByteArray(0)
        } finally {
            source.close()
        }
    }

    override fun getSize(): Long {
        if (size == -2L) {
            val source = MediaStore.dataSourceFactory.createDataSource()
            size = try {
                val length = source.open(DataSpec(uri))
                if (length == C.LENGTH_UNSET.toLong()) -1L else length
            } catch (_: Exception) {
                -1L
            } finally {
                source.close()
            }
        }
        return size
    }

    override fun close() {}

    companion object {
        private const val CHUNK = 256 * 1024
    }
}
