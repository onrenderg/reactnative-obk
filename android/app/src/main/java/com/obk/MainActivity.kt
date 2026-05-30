package com.obk

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.view.KeyEvent
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  companion object {
    private const val REQ_CAMERA = 101
  }

  override fun getMainComponentName(): String = "OBk"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * Volume UP  → start background recording (requests CAMERA permission if needed)
   * Volume DOWN → stop background recording
   * Keys are consumed so the system volume bar does not appear.
   */
  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    when (keyCode) {
      KeyEvent.KEYCODE_VOLUME_UP -> {
        handleVolumeUp()
        return true
      }
      KeyEvent.KEYCODE_VOLUME_DOWN -> {
        stopCameraService()
        return true
      }
    }
    return super.onKeyDown(keyCode, event)
  }

  private fun handleVolumeUp() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
        == PackageManager.PERMISSION_GRANTED) {
      // Permission already granted — start immediately
      startCameraService()
    } else {
      // Ask for camera permission; onRequestPermissionsResult will start the service
      val perms = mutableListOf(Manifest.permission.CAMERA)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
        perms.add(Manifest.permission.POST_NOTIFICATIONS)
      ActivityCompat.requestPermissions(this, perms.toTypedArray(), REQ_CAMERA)
    }
  }

  /** Called by Android after the user responds to the permission dialog. */
  override fun onRequestPermissionsResult(
      requestCode: Int,
      permissions: Array<String>,
      grantResults: IntArray
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == REQ_CAMERA) {
      val cameraGranted = grantResults.isNotEmpty() &&
          grantResults[0] == PackageManager.PERMISSION_GRANTED
      if (cameraGranted) startCameraService()
      // If denied — do nothing; user can use on-screen button to retry
    }
  }

  private fun startCameraService() {
    val intent = Intent(this, CameraForegroundService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      startForegroundService(intent)
    else
      startService(intent)
    CameraModule.emitEventFromNative(CameraModule.EVENT_STARTED)
  }

  private fun stopCameraService() {
    stopService(Intent(this, CameraForegroundService::class.java))
    CameraModule.emitEventFromNative(CameraModule.EVENT_STOPPED)
  }
}
