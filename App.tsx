import React, {useEffect, useState} from 'react';
import {
  Alert,
  NativeModules,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const {CameraModule} = NativeModules;

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [saveDir, setSaveDir] = useState('');
  const [currentFile, setCurrentFile] = useState('');

  // Get save directory on mount
  useEffect(() => {
    CameraModule.getSaveDirectory()
      .then((dir: string) => setSaveDir(dir))
      .catch(() => {});
  }, []);

  // Ref to track previous service state — avoids stale-closure issues
  const prevRunningRef = React.useRef(false);

  // Always-on 1-second poll: reads the ACTUAL service state every second.
  // Works whether state changed from on-screen button OR hardware volume key.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const status = await CameraModule.getStatus();
        const running: boolean = !!status.isRunning;
        const wasRunning = prevRunningRef.current;
        prevRunningRef.current = running;

        // Transition: idle → recording
        if (!wasRunning && running) {
          setIsRunning(true);
          setElapsed(0);
          setFrameCount(0);
        }

        // Transition: recording → idle
        if (wasRunning && !running) {
          setIsRunning(false);
          setCurrentFile('');
        }

        // Update counters while recording
        if (running) {
          setElapsed(s => s + 1);
          setFrameCount(status.frameCount ?? 0);
          if (status.currentFilePath) setCurrentFile(status.currentFilePath);
        }
      } catch {}
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Permissions ─────────────────────────────────────────────────────────────
  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const perms: string[] = [PermissionsAndroid.PERMISSIONS.CAMERA];
    if (Platform.Version >= 33)
      perms.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);

    const results = await PermissionsAndroid.requestMultiple(perms);
    const allGranted = Object.values(results).every(
      r => r === PermissionsAndroid.RESULTS.GRANTED,
    );
    if (!allGranted) {
      Alert.alert(
        'Permission Required',
        'Camera permission is required. Grant it in Settings → Apps → OBk → Permissions.',
      );
    }
    return allGranted;
  };

  // ── Start ───────────────────────────────────────────────────────────────────
  const handleStart = async () => {
    const granted = await requestPermissions();
    if (!granted) return;
    try {
      await CameraModule.startCamera();
      setIsRunning(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to start camera');
    }
  };

  // ── Stop ────────────────────────────────────────────────────────────────────
  const handleStop = async () => {
    try {
      await CameraModule.stopCamera();
    } catch {}
    setIsRunning(false);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const getFileName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || '';
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F1A" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <Text style={styles.title}>🎥 Background Camera</Text>
        <Text style={styles.subtitle}>
          Vol ▲ = Start recording · Vol ▼ = Stop recording
        </Text>

        {/* Status */}
        <View style={[styles.statusCard, isRunning && styles.statusCardActive]}>
          <View
            style={[styles.dot, isRunning ? styles.dotGreen : styles.dotGrey]}
          />
          <Text
            style={[styles.statusText, isRunning && styles.statusTextActive]}>
            {isRunning
              ? '● Recording — camera active in background'
              : 'Idle — camera not started'}
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>DURATION</Text>
            <Text style={styles.statValue}>{formatTime(elapsed)}</Text>
            <Text style={styles.statUnit}>mm:ss</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>FORMAT</Text>
            <Text style={styles.statValue}>MP4</Text>
            <Text style={styles.statUnit}>H.264 @ 2Mbps</Text>
          </View>
        </View>

        {/* Current recording file */}
        {isRunning && currentFile ? (
          <View style={styles.fileCard}>
            <Text style={styles.fileLabel}>RECORDING TO</Text>
            <Text style={styles.fileName}>{getFileName(currentFile)}</Text>
            <Text style={styles.filePath}>{currentFile}</Text>
          </View>
        ) : null}

        {/* Save location */}
        <View style={styles.saveCard}>
          <Text style={styles.saveLabel}>SAVE LOCATION</Text>
          <Text style={styles.savePath}>{saveDir || '...'}</Text>
          <Text style={styles.saveHint}>
            Access via: adb pull {saveDir ? `"${saveDir}/"` : '<path>'} .
          </Text>
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>ℹ How it works</Text>
          <Text style={styles.infoText}>
            Press <Text style={styles.infoHighlight}>Volume UP</Text> → Camera2
            opens + MediaRecorder starts recording .mp4
            {'\n'}
            Press Home or lock screen → Foreground Service keeps recording
            {'\n'}
            Press <Text style={styles.infoHighlight}>Volume DOWN</Text> →
            recording saved, camera released
            {'\n\n'}
            You can also use the on-screen buttons below.
            {'\n'}
            Videos are saved as VID_YYYYMMDD_HHmmss.mp4
          </Text>
        </View>

        {/* Buttons */}
        <TouchableOpacity
          style={[styles.btn, styles.btnStart, isRunning && styles.btnDisabled]}
          onPress={handleStart}
          disabled={isRunning}
          activeOpacity={0.8}>
          <Text style={styles.btnText}>▶ Start Recording</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnStop, !isRunning && styles.btnDisabled]}
          onPress={handleStop}
          disabled={!isRunning}
          activeOpacity={0.8}>
          <Text style={[styles.btnText, styles.btnStopText]}>
            ⏹ Stop Recording
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F0F1A'},
  scroll: {padding: 24, paddingTop: 48, paddingBottom: 32},

  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },

  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    marginBottom: 16,
  },
  statusCardActive: {borderColor: '#FF4444'},
  dot: {width: 14, height: 14, borderRadius: 7, marginRight: 12},
  dotGreen: {backgroundColor: '#FF4444'},
  dotGrey: {backgroundColor: '#444'},
  statusText: {color: '#CCC', fontSize: 14, flex: 1},
  statusTextActive: {color: '#FF6666'},

  statsRow: {flexDirection: 'row', gap: 12, marginBottom: 16},
  statCard: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A4A',
  },
  statLabel: {color: '#666', fontSize: 10, fontWeight: 'bold'},
  statValue: {color: '#7C6FFF', fontSize: 32, fontWeight: 'bold'},
  statUnit: {color: '#555', fontSize: 11},

  fileCard: {
    backgroundColor: '#1A0A0A',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FF444444',
    marginBottom: 16,
  },
  fileLabel: {color: '#FF6666', fontSize: 10, fontWeight: 'bold'},
  fileName: {color: '#FF8888', fontSize: 16, fontWeight: 'bold', marginTop: 4},
  filePath: {color: '#884444', fontSize: 11, marginTop: 4},

  saveCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    marginBottom: 16,
  },
  saveLabel: {color: '#666', fontSize: 10, fontWeight: 'bold'},
  savePath: {color: '#AAA', fontSize: 12, marginTop: 4},
  saveHint: {color: '#555', fontSize: 10, marginTop: 8, fontStyle: 'italic'},

  infoCard: {
    backgroundColor: '#0D2137',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1A4060',
    marginBottom: 24,
  },
  infoTitle: {
    color: '#5BA3D9',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  infoText: {color: '#7AAABB', fontSize: 12, lineHeight: 20},
  infoHighlight: {color: '#5BA3D9', fontWeight: 'bold'},

  btn: {
    borderRadius: 14,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  btnStart: {backgroundColor: '#7C6FFF'},
  btnStop: {backgroundColor: '#FF4444'},
  btnDisabled: {opacity: 0.35},
  btnText: {color: '#fff', fontSize: 16, fontWeight: 'bold'},
  btnStopText: {color: '#fff'},
});
