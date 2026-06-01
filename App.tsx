import React, {useEffect, useState} from 'react';
import {
  Alert,
  NativeModules,
  PermissionsAndroid,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const {CameraModule} = NativeModules;

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  // Ref to track previous service state — avoids stale-closure issues
  const prevRunningRef = React.useRef(false);

  // Always-on 1-second poll: reads the ACTUAL service state every second.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const status = await CameraModule.getStatus();
        const running: boolean = !!status.isRunning;
        const wasRunning = prevRunningRef.current;
        prevRunningRef.current = running;

        if (!wasRunning && running) {
          setIsRunning(true);
          setElapsed(0);
        }
        if (wasRunning && !running) {
          setIsRunning(false);
        }
        if (running) {
          setElapsed(s => s + 1);
        }
      } catch {}
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Permissions ──────────────────────────────────────────────────────────────
  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const perms: string[] = [PermissionsAndroid.PERMISSIONS.CAMERA];
    if (Platform.Version >= 33)
      perms.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);

    const results = await PermissionsAndroid.requestMultiple(perms);
    const allGranted = Object.values(results).every(
      r => r === PermissionsAndroid.RESULTS.GRANTED,
    );
    return allGranted;
  };

  // ── Start ────────────────────────────────────────────────────────────────────
  const handleStart = async () => {
    const granted = await requestPermissions();
    if (!granted) {
      Alert.alert('Permission Required', 'Please allow access to continue.');
      return;
    }
    try {
      await CameraModule.startCamera();
      setIsRunning(true);
      setElapsed(0);
    } catch {}
  };

  // ── Stop ─────────────────────────────────────────────────────────────────────
  const handleStop = async () => {
    try {
      await CameraModule.stopCamera();
    } catch {}
    setIsRunning(false);
  };

  // ── Switch ───────────────────────────────────────────────────────────────────
  const handleSwitch = async () => {
    try {
      await CameraModule.switchCamera();
      setIsFrontCamera(prev => !prev);
    } catch {}
  };

  // ── Format mm:ss:cs (centiseconds for feel) ──────────────────────────────────
  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0)
      return `${h.toString().padStart(2, '0')}:${m
        .toString()
        .padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${sec
      .toString()
      .padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />

      {/* App name */}
      <Text style={styles.appName}>Chrono</Text>
      <Text style={styles.appSub}>Stopwatch</Text>

      {/* Big clock face */}
      <View style={[styles.clockRing, isRunning && styles.clockRingActive]}>
        <View style={styles.clockInner}>
          <Text style={styles.timeText}>{formatTime(elapsed)}</Text>
          <Text style={styles.timeLabel}>
            {isRunning ? 'Running' : elapsed > 0 ? 'Paused' : 'Ready'}
          </Text>
        </View>
      </View>

      {/* Buttons */}
      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.btn, styles.btnStop, !isRunning && styles.btnDisabled]}
          onPress={handleStop}
          disabled={!isRunning}
          activeOpacity={0.75}>
          <Text style={styles.btnIcon}>⏹</Text>
          <Text style={styles.btnLabel}>Stop</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnStart, isRunning && styles.btnDisabled]}
          onPress={handleStart}
          disabled={isRunning}
          activeOpacity={0.75}>
          <Text style={styles.btnIcon}>▶</Text>
          <Text style={styles.btnLabel}>Start</Text>
        </TouchableOpacity>
      </View>

      {/* Switch Button (Disguised as Lap) */}
      <TouchableOpacity
        style={styles.btnSwitch}
        onPress={handleSwitch}
        activeOpacity={0.75}>
        <Text style={styles.btnIcon}>⏱</Text>
        <Text style={styles.btnLabel}>{isFrontCamera ? 'Lap 1' : 'Lap 2'}</Text>
      </TouchableOpacity>

      {/* Subtle hint */}
      <Text style={styles.hint}>Vol + / Vol − to control</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },

  appName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  appSub: {
    color: '#444',
    fontSize: 11,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 52,
  },

  // Clock ring
  clockRing: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 3,
    borderColor: '#1E1E2E',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111118',
    marginBottom: 56,
    shadowColor: '#7C6FFF',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  clockRingActive: {
    borderColor: '#7C6FFF',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  clockInner: {
    alignItems: 'center',
  },
  timeText: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '200',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  timeLabel: {
    color: '#555',
    fontSize: 12,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 6,
  },

  // Buttons
  btnRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 40,
  },
  btn: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnStart: {backgroundColor: '#7C6FFF'},
  btnStop: {backgroundColor: '#1E1E2E', borderWidth: 2, borderColor: '#333'},
  btnSwitch: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2A2A3A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  btnDisabled: {opacity: 0.3},
  btnIcon: {color: '#fff', fontSize: 22},
  btnLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 4,
  },

  hint: {
    color: '#2A2A3A',
    fontSize: 11,
    letterSpacing: 1,
  },
});
