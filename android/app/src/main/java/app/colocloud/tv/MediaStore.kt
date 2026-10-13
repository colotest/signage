@file:OptIn(UnstableApi::class)

package app.colocloud.tv

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import java.io.File
import java.util.concurrent.Executors

// The videos this screen plays, kept on the stick: each is downloaded once
// (ahead of time, when the page asks — see preload) and then played from
// local storage, including with no network at all. A media URL's content
// never changes (a replaced file gets a new path), so a stored copy is
// always current. The page says which files it still needs (retain); the
// rest are deleted, with a size cap as a backstop.
object MediaStore {
    private const val TAG = "MediaStore"
    private const val MAX_BYTES = 3L * 1024 * 1024 * 1024

    private lateinit var cache: SimpleCache
    lateinit var dataSourceFactory: CacheDataSource.Factory
        private set

    // One at a time: a stick's network and flash are better spent finishing
    // one file than splitting between several.
    private val downloads = Executors.newSingleThreadExecutor()
    private val queued = mutableSetOf<String>()

    fun init(context: Context) {
        if (::cache.isInitialized) return
        val dir = File(context.filesDir, "media")
        dir.mkdirs()
        // Half the free space at most, so the stick itself never fills up.
        val maxBytes = minOf(MAX_BYTES, dir.usableSpace / 2)
        cache = SimpleCache(dir, LeastRecentlyUsedCacheEvictor(maxBytes), StandaloneDatabaseProvider(context))
        val http = DefaultHttpDataSource.Factory()
            .setUserAgent("ColoCloudTV")
            .setAllowCrossProtocolRedirects(true)
        dataSourceFactory = CacheDataSource.Factory()
            .setCache(cache)
            .setUpstreamDataSourceFactory(http)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }

    fun preload(url: String) {
        synchronized(queued) { if (!queued.add(url)) return }
        downloads.execute {
            try {
                CacheWriter(dataSourceFactory.createDataSource(), DataSpec(Uri.parse(url)), null, null).cache()
            } catch (e: Exception) {
                Log.w(TAG, "Preload failed: $url", e)
            } finally {
                // Done or failed: either way a later request may try again
                // (it's a quick no-op for a file that's all here).
                synchronized(queued) { queued.remove(url) }
            }
        }
    }

    fun retain(keep: Set<String>) {
        downloads.execute {
            for (key in cache.keys) {
                if (key in keep) continue
                try {
                    cache.removeResource(key)
                } catch (e: Exception) {
                    Log.w(TAG, "Couldn't remove $key", e)
                }
            }
        }
    }
}
