package com.obk

import android.content.Intent
import android.os.Build
import android.os.Environment
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference

class CameraModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        // Store a weak reference so MainActivity can emit events without
        // touching ReactActivity.getReactInstanceManager() (unsupported in
        // New Architecture / Bridgeless mode).
        appContextRef = WeakReference(reactContext)
    }

    companion object {
        const val EVENT_STARTED = "onRecordingStarted"
        const val EVENT_STOPPED = "onRecordingStopped"

        /** Weak reference set when the module is first created by the RN bridge. */
        private var appContextRef: WeakReference<ReactApplicationContext>? = null

        /**
         * Emit an event to JS.
         * Called from JS-button path (ctx is always available there) OR from
         * MainActivity volume-key path via [emitEventFromNative].
         */
        fun emitEvent(ctx: ReactApplicationContext, eventName: String) {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit(eventName, null)
        }

        /**
         * Safe variant for MainActivity: uses the stored WeakReference so we
         * never need to call ReactActivity.getReactInstanceManager() which
         * throws on New Architecture / Bridgeless.
         */
        fun emitEventFromNative(eventName: String) {
            try {
                val ctx = appContextRef?.get() ?: return
                emitEvent(ctx, eventName)
            } catch (_: Exception) {
                // Bridge not ready — UI will sync via 1-second getStatus() poll.
            }
        }
    }

    override fun getName() = "CameraModule"

    // Required for addListener / removeListeners so RN doesn't warn about missing methods
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    @ReactMethod
    fun startCamera(promise: Promise) {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, CameraForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                context.startForegroundService(intent)
            else
                context.startService(intent)
            emitEvent(context, EVENT_STARTED)
            promise.resolve("started")
        } catch (e: Exception) {
            promise.reject("START_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopCamera(promise: Promise) {
        try {
            val context = reactApplicationContext
            context.stopService(Intent(context, CameraForegroundService::class.java))
            emitEvent(context, EVENT_STOPPED)
            promise.resolve("stopped")
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        val map = Arguments.createMap().apply {
            putBoolean("isRunning", CameraForegroundService.isRunning)
            putInt("frameCount", CameraForegroundService.frameCount)
            putString("currentFilePath", CameraForegroundService.currentFilePath)
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun getSaveDirectory(promise: Promise) {
        val path = "${Environment.getExternalStorageDirectory()}/Movies/OBk"
        promise.resolve(path)
    }
}
