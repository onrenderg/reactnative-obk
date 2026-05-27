package com.obk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.hardware.camera2.*
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.IBinder
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import android.util.Log
import android.util.Size
import android.view.Surface
import androidx.core.app.NotificationCompat
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

class CameraForegroundService : Service() {

    companion object {
        const val TAG = "CameraForegroundService"
        const val CHANNEL_ID = "camera_bg_channel"
        const val NOTIFICATION_ID = 1001
        var isRunning = false
        var frameCount = 0
        var currentFilePath: String = ""
    }

    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var mediaRecorder: MediaRecorder? = null
    private lateinit var cameraManager: CameraManager
    private var videoSize = Size(640, 480)
    private var mediaStoreUri: Uri? = null
    private var parcelFd: ParcelFileDescriptor? = null

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        cameraManager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(
            NOTIFICATION_ID,
            buildNotification(),
            android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
        )
        openCamera()
        isRunning = true
        frameCount = 0
        return START_STICKY
    }

    override fun onDestroy() {
        stopRecording()
        stopCamera()
        isRunning = false
        super.onDestroy()
    }

    // ── Video output ──────────────────────────────────────────────────────────

    private val timestamp: String
        get() = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())

    // ── MediaRecorder setup ───────────────────────────────────────────────────

    private fun setupMediaRecorder(): MediaRecorder {
        val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            MediaRecorder(this) else @Suppress("DEPRECATION") MediaRecorder()

        val fileName = "VID_$timestamp.mp4"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10+ → MediaStore → public Movies/OBk folder
            val values = ContentValues().apply {
                put(MediaStore.Video.Media.DISPLAY_NAME, fileName)
                put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                put(MediaStore.Video.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/OBk")
                put(MediaStore.Video.Media.IS_PENDING, 1)
            }
            val uri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
            mediaStoreUri = uri
            currentFilePath = "${Environment.getExternalStorageDirectory()}/Movies/OBk/$fileName"

            val fd = contentResolver.openFileDescriptor(uri!!, "w")!!
            parcelFd = fd

            recorder.apply {
                setVideoSource(MediaRecorder.VideoSource.SURFACE)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setVideoEncoder(MediaRecorder.VideoEncoder.H264)
                setVideoSize(videoSize.width, videoSize.height)
                setVideoFrameRate(30)
                setVideoEncodingBitRate(2_000_000)
                setOutputFile(fd.fileDescriptor)
                prepare()
            }
        } else {
            // Android 9 and below → direct file write to public Movies
            @Suppress("DEPRECATION")
            val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "OBk")
            if (!dir.exists()) dir.mkdirs()
            val file = File(dir, fileName)
            currentFilePath = file.absolutePath

            recorder.apply {
                setVideoSource(MediaRecorder.VideoSource.SURFACE)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setVideoEncoder(MediaRecorder.VideoEncoder.H264)
                setVideoSize(videoSize.width, videoSize.height)
                setVideoFrameRate(30)
                setVideoEncodingBitRate(2_000_000)
                setOutputFile(file.absolutePath)
                prepare()
            }
        }

        Log.i(TAG, "Recording to: $currentFilePath")
        return recorder
    }

    // ── Camera2 ───────────────────────────────────────────────────────────────

    private fun openCamera() {
        try {
            val cameraId = selectCamera()
            if (cameraId == null) {
                Log.e(TAG, "No camera found")
                return
            }

            mediaRecorder = setupMediaRecorder()

            cameraManager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    cameraDevice = camera
                    startRecordingSession()
                    Log.i(TAG, "Camera opened: $cameraId")
                }
                override fun onDisconnected(camera: CameraDevice) {
                    camera.close(); cameraDevice = null
                }
                override fun onError(camera: CameraDevice, error: Int) {
                    camera.close(); cameraDevice = null
                    Log.e(TAG, "Camera error: $error")
                }
            }, null)

        } catch (e: Exception) {
            Log.e(TAG, "openCamera failed", e)
        }
    }

    private fun startRecordingSession() {
        val camera = cameraDevice ?: return
        val recorder = mediaRecorder ?: return
        val recorderSurface: Surface = recorder.surface

        camera.createCaptureSession(
            listOf(recorderSurface),
            object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    captureSession = session
                    val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD).apply {
                        addTarget(recorderSurface)
                        set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO)
                    }.build()
                    session.setRepeatingRequest(request, null, null)
                    recorder.start()
                    Log.i(TAG, "Video recording started → $currentFilePath")
                }
                override fun onConfigureFailed(session: CameraCaptureSession) {
                    Log.e(TAG, "Capture session configure failed")
                }
            }, null
        )
    }

    private fun stopRecording() {
        try {
            captureSession?.stopRepeating()
            mediaRecorder?.apply {
                stop()
                release()
            }

            // Finalize MediaStore entry so video is visible in gallery
            parcelFd?.close()
            parcelFd = null
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && mediaStoreUri != null) {
                val values = ContentValues().apply {
                    put(MediaStore.Video.Media.IS_PENDING, 0)
                }
                contentResolver.update(mediaStoreUri!!, values, null, null)
                Log.i(TAG, "Video finalized in MediaStore → $currentFilePath")
            }
            mediaStoreUri = null

            Log.i(TAG, "Video saved → $currentFilePath")
        } catch (e: Exception) {
            Log.e(TAG, "stopRecording error", e)
        }
        mediaRecorder = null
    }

    private fun stopCamera() {
        captureSession?.close(); captureSession = null
        cameraDevice?.close(); cameraDevice = null
    }

    /** Select back camera, fall back to front, then any available. */
    private fun selectCamera(): String? {
        val ids = cameraManager.cameraIdList
        ids.firstOrNull {
            cameraManager.getCameraCharacteristics(it)
                .get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        }?.let { return it }
        ids.firstOrNull {
            cameraManager.getCameraCharacteristics(it)
                .get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT
        }?.let { return it }
        return ids.firstOrNull()
    }

    // ── Notification ──────────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Camera Background Service", NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Camera is recording in the background" }
            (getSystemService(NotificationManager::class.java)).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Recording Video")
            .setContentText("Camera is recording in the background")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
