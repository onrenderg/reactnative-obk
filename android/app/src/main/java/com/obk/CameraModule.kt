package com.obk

import android.content.Intent
import android.os.Build
import android.os.Environment
import com.facebook.react.bridge.*

class CameraModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "CameraModule"

    @ReactMethod
    fun startCamera(promise: Promise) {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, CameraForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                context.startForegroundService(intent)
            else
                context.startService(intent)
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
