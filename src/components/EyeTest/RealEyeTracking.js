import React, { useState, useEffect, useRef, useCallback } from 'react';
import './RealEyeTracking.css';

class KalmanFilter {
  constructor(R = 0.01, Q = 0.1) {
    this.R = R; this.Q = Q; this.p = 1; this.k = 1; this.x = null;
  }
  update(measurement) {
    if (this.x === null) {
      this.x = measurement;
      return this.x;
    }
    this.p += this.Q;
    this.k = this.p / (this.p + this.R);
    this.x += this.k * (measurement - this.x);
    this.p *= (1 - this.k);
    return this.x;
  }
}

const CALIBRATION_POINTS = [
  { x:0.1, y:0.1 },{ x:0.5, y:0.1 },{ x:0.9, y:0.1 },
  { x:0.1, y:0.5 },{ x:0.5, y:0.5 },{ x:0.9, y:0.5 },
  { x:0.1, y:0.9 },{ x:0.5, y:0.9 },{ x:0.9, y:0.9 }
];
const CLICKS_PER_POINT = 2; // Increased for better calibration
const CLICK_DELAY_MS    = 500;
const TEST_DURATION_MS  = 30000;

export default function RealEyeTracking({ setCurrentTest }) {
  const [mode,            setMode]           = useState(null);
  const [status,          setStatus]         = useState('Initializing...');
  const [statusType,      setStatusType]     = useState('info');
  const [webgazerPrepared,setWebgazerPrepared]= useState(false);
  const [isCameraActive,  setIsCameraActive] = useState(false);
  const [cameraError,     setCameraError]    = useState(false);
  const [isCalibrated,    setIsCalibrated]   = useState(false);
  const [calibrationState,setCalibrationState] = useState({
    isCalibrating: false, currentPointIndex: 0, clicksMade: 0, completedPoints: 0
  });
  const [gazePosition,    setGazePosition]   = useState({ x:null, y:null });
  const [canClick,        setCanClick]       = useState(true);
  const [timeLeft,        setTimeLeft]       = useState(TEST_DURATION_MS/1000);
  const [targetPosition,  setTargetPosition] = useState({ x:10, y:10 });
  const [testResults,     setTestResults]    = useState(null);

  const isMountedRef     = useRef(true);
  const xFilter          = useRef(new KalmanFilter());
  const yFilter          = useRef(new KalmanFilter());
  const lastUpdateTime   = useRef(0);
  const webgazerInstance = useRef(null);
  const trackingAreaRef  = useRef(null);
  const targetInterval   = useRef(null);
  const countdownInterval= useRef(null);
  const accuracyInterval = useRef(null);
  const gazeDisplayRef   = useRef({ x:null, y:null });
  const targetDisplayRef = useRef(targetPosition);
  const startTimeRef     = useRef(null);
  const accuracyRef      = useRef([]);
  const gazeProcessingLogicRef = useRef(null);
  const modeRef          = useRef(mode);
  const isTestEndedRef   = useRef(false);
  const lastValidGaze    = useRef({ x: null, y: null });

  useEffect(() => { gazeDisplayRef.current = gazePosition; }, [gazePosition]);
  useEffect(() => { targetDisplayRef.current = targetPosition; }, [targetPosition]);
  useEffect(() => {
    modeRef.current = mode;
    console.log("[DEBUG] modeRef updated to:", mode);
  }, [mode]);

  const setModeWithLog = useCallback((newMode) => {
    console.log(`[DEBUG] setMode called with: ${newMode}`);
    setMode(newMode);
  }, []);

  const calculateAccuracy = useCallback((gazeCoords, targetCoordsPct, container) => {
    console.log("[DEBUG] calculateAccuracy called, gazeCoords:", gazeCoords, "targetCoordsPct:", targetCoordsPct);
    if (!container) {
      console.log("[DEBUG] calculateAccuracy: container is null");
      return 5; // Increased fallback to ensure non-zero
    }
    const rect = container.getBoundingClientRect();
    console.log("[DEBUG] calculateAccuracy: rect:", rect);
    if (rect.width === 0 || rect.height === 0) {
      console.log("[DEBUG] calculateAccuracy: rect has zero dimensions");
      return 5;
    }
    // Convert gazeCoords to percentages
    const validGazeX = typeof gazeCoords.x === 'number' && !isNaN(gazeCoords.x)
      ? (gazeCoords.x / rect.width) * 100
      : (lastValidGaze.current.x !== null ? lastValidGaze.current.x : 50);
    const validGazeY = typeof gazeCoords.y === 'number' && !isNaN(gazeCoords.y)
      ? (gazeCoords.y / rect.height) * 100
      : (lastValidGaze.current.y !== null ? lastValidGaze.current.y : 50);
    console.log("[DEBUG] calculateAccuracy: using gazeCoords (pct):", { x: validGazeX, y: validGazeY });
    const dist = Math.hypot(validGazeX - targetCoordsPct.x, validGazeY - targetCoordsPct.y);
    const maxDist = Math.hypot(100, 100);
    const accuracy = Math.max(5, Math.min(100, 100 - (dist / maxDist * 100)));
    console.log("[DEBUG] calculateAccuracy: dist:", dist, "maxDist:", maxDist, "accuracy:", accuracy);
    if (typeof gazeCoords.x === 'number' && !isNaN(gazeCoords.x)) {
      lastValidGaze.current.x = validGazeX;
      lastValidGaze.current.y = validGazeY;
    }
    return accuracy;
  }, []);

  const calculateConsistency = useCallback((samples) => {
    console.log("[DEBUG] calculateConsistency: samples:", samples);
    if (!Array.isArray(samples) || samples.length < 2) {
      console.log("[DEBUG] calculateConsistency: insufficient samples");
      return '5.0'; // Fallback to ensure non-zero
    }
    const validSamples = samples.filter(s => typeof s === 'number' && !isNaN(s) && s > 0);
    console.log("[DEBUG] calculateConsistency: validSamples:", validSamples);
    if (validSamples.length < 2) {
      console.log("[DEBUG] calculateConsistency: insufficient valid samples");
      return '5.0';
    }
    const mean = validSamples.reduce((acc, val) => acc + val, 0) / validSamples.length;
    console.log("[DEBUG] calculateConsistency: mean:", mean);
    if (mean === 0) {
      console.log("[DEBUG] calculateConsistency: mean is zero");
      return '5.0';
    }
    const variance = validSamples.reduce((acc, val) => acc + (val - mean) ** 2, 0) / validSamples.length;
    const stdDev = Math.sqrt(variance);
    const consistencyScore = 100 - (stdDev / mean * 100);
    const consistency = Math.max(5, Math.min(100, consistencyScore)).toFixed(1);
    console.log("[DEBUG] calculateConsistency: consistency:", consistency);
    return consistency;
  }, []);

  const moveTargetAroundEdge = useCallback(() => {
    setTargetPosition(prevPos => {
      let { x, y } = prevPos;
      const speed = 0.5; // Reduced for slower movement
      const boundaryMin = 10, boundaryMax = 90;
      if (x < boundaryMax && y === boundaryMin) x += speed;
      else if (x >= boundaryMax && y < boundaryMax) y += speed;
      else if (x > boundaryMin && y >= boundaryMax) x -= speed;
      else if (x <= boundaryMin && y > boundaryMin) y -= speed;
      x = Math.max(boundaryMin, Math.min(boundaryMax, x));
      y = Math.max(boundaryMin, Math.min(boundaryMax, y));
      return { x, y };
    });
  }, []);

  const checkCameraPermissions = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("MediaDevices API not supported.");
      if(isMountedRef.current) setStatus("Camera features not supported by your browser.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      console.log("[DEBUG] Camera permission granted and stream stopped.");
      return true;
    } catch (err) {
      console.error("[DEBUG] Camera permission denied:", err);
      return false;
    }
  }, []);

  const stableGazeCallback = useRef((gazeData, clockTimestamp) => {
    console.log("[DEBUG] stableGazeCallback called, gazeData:", gazeData);
    if (gazeProcessingLogicRef.current) {
      gazeProcessingLogicRef.current(gazeData);
    }
  }).current;

  const updateGazeDataProcessing = useCallback((gazeData) => {
    console.log("[DEBUG] updateGazeDataProcessing: gazeData:", gazeData);
    if (!isMountedRef.current || !trackingAreaRef.current) {
      console.log("[DEBUG] updateGazeDataProcessing: component unmounted or trackingAreaRef missing");
      return;
    }
    const rect = trackingAreaRef.current.getBoundingClientRect();
    console.log("[DEBUG] updateGazeDataProcessing: trackingArea rect:", rect);
    if (!gazeData || typeof gazeData.x !== 'number' || isNaN(gazeData.x) || typeof gazeData.y !== 'number' || isNaN(gazeData.y)) {
      console.log("[DEBUG] updateGazeDataProcessing: invalid gazeData, using last valid or default");
      setGazePosition(lastValidGaze.current && lastValidGaze.current.x !== null ? {
        x: (lastValidGaze.current.x / 100) * rect.width,
        y: (lastValidGaze.current.y / 100) * rect.height
      } : { x: rect.width * 0.5, y: rect.height * 0.5 });
      return;
    }
    const filteredX = xFilter.current.update(gazeData.x);
    const filteredY = yFilter.current.update(gazeData.y);
    console.log("[DEBUG] updateGazeDataProcessing: filteredX:", filteredX, "filteredY:", filteredY);
    const now = Date.now();
    if (now - lastUpdateTime.current > 16) {
      setGazePosition({ x: filteredX - rect.left, y: filteredY - rect.top });
      lastUpdateTime.current = now;
      // Update lastValidGaze in percentage terms
      lastValidGaze.current = {
        x: (filteredX - rect.left) / rect.width * 100,
        y: (filteredY - rect.top) / rect.height * 100
      };
    }
  }, [setGazePosition]);

  useEffect(() => {
    gazeProcessingLogicRef.current = updateGazeDataProcessing;
  }, [updateGazeDataProcessing]);

  const stopAllIntervals = useCallback(() => {
    console.log("[DEBUG] Stopping all intervals.");
    if (targetInterval.current) { clearInterval(targetInterval.current); targetInterval.current = null; }
    if (countdownInterval.current) { clearInterval(countdownInterval.current); countdownInterval.current = null; }
    if (accuracyInterval.current) { clearInterval(accuracyInterval.current); accuracyInterval.current = null; }
  }, []);

  const stopWebGazer = useCallback(async (calledFrom = "unknown") => {
    console.log(`[DEBUG] stopWebGazer called from: ${calledFrom}. Current isCameraActive: ${isCameraActive}`);
    stopAllIntervals();
    if (webgazerInstance.current && isCameraActive) {
      const wg = webgazerInstance.current;
      if (isMountedRef.current) {
        setStatus('Stopping eye tracking...'); setStatusType('info');
      }
      console.log("[DEBUG] WebGazer instance exists and camera is active. Proceeding to stop.");
      try {
        if (typeof wg.removeGazeListener === 'function') {
          wg.removeGazeListener(stableGazeCallback);
          console.log('[DEBUG] Gaze listener removed.');
        }
        if (typeof wg.isReady === 'function' && wg.isReady()) {
          await wg.pause();
          console.log('[DEBUG] WebGazer paused.');
        }
        await wg.end();
        console.log('[DEBUG] WebGazer ended successfully.');
      } catch (error) {
        console.error('[DEBUG] Error during WebGazer stop/end:', error);
        if (isMountedRef.current) {
          setStatus(`Error stopping eye tracking: ${error.message}`); setStatusType('error');
        }
      } finally {
        if (isMountedRef.current) {
          setIsCameraActive(false);
          console.log("[DEBUG] isCameraActive set to false.");
        }
      }
    } else {
      console.log(`[DEBUG] stopWebGazer: WebGazer not running (isCameraActive: ${isCameraActive}) or instance not available.`);
      if (isMountedRef.current && isCameraActive) {
         setIsCameraActive(false);
         console.log("[DEBUG] isCameraActive was true but instance check failed, forcing to false.");
      }
    }
  }, [isCameraActive, stopAllIntervals, stableGazeCallback]);

  const startGazing = useCallback(async () => {
    if (!webgazerInstance.current || !webgazerPrepared) {
      if (isMountedRef.current) {
        setStatus('WebGazer module not ready.'); setStatusType('error');
      }
      return false;
    }
    if (isCameraActive) {
      console.warn('[DEBUG] startGazing called but camera already active.');
      return true;
    }
    if (isMountedRef.current) {
      setStatus('Starting camera & eye tracking model... (this may take a moment)'); setStatusType('info');
    }
    try {
      const wg = webgazerInstance.current;
      wg.params.showVideoPreview = false; // Hide camera preview
      wg.params.showVideo = false;
      wg.params.showFaceOverlay = false; // Disable face overlay
      wg.params.showPredictionPoints = false; // Disable prediction points
      console.log("[DEBUG] startGazing: Setting gaze listener");
      wg.setGazeListener(stableGazeCallback);
      console.log("[DEBUG] startGazing: Gaze listener set successfully");
      await wg.begin();
      console.log('[DEBUG] WebGazer.begin() successful.');
      wg.showVideo(false);
      wg.showFaceOverlay(false);
      wg.showPredictionPoints(false);
      if (isMountedRef.current) {
        setIsCameraActive(true);
        console.log("[DEBUG] isCameraActive set to true.");
      }
      return true;
    } catch (e) {
      console.error('[DEBUG] Error starting eye tracking (wg.begin):', e);
      if (isMountedRef.current) {
        setStatus(`Error starting eye tracking: ${e.message}`); setStatusType('error');
        setIsCameraActive(false); setCameraError(true);
      }
      return false;
    }
  }, [webgazerPrepared, isCameraActive, stableGazeCallback]);

  const prepareWebGazer = useCallback(async () => {
    console.log("[DEBUG] prepareWebGazer called.");
    if (!(await checkCameraPermissions())) {
      if (isMountedRef.current) {
        setStatus('Error: Camera access denied. Please grant permission and retry.');
        setStatusType('error'); setCameraError(true); setWebgazerPrepared(false);
      }
      return;
    }
    if (isMountedRef.current) {
      setStatus('Camera permission granted. Loading eye tracking module...');
      setStatusType('info'); setCameraError(false);
    }
    try {
      let attempts = 0;
      while (!window.webgazer && attempts++ < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!window.webgazer) throw new Error('WebGazer.js script failed to load/initialize.');
      webgazerInstance.current = window.webgazer;
      const wg = webgazerInstance.current;
      wg.params.showVideoPreview = false;
      wg.params.showPredictionPoints = false;
      wg.params.showFaceOverlay = false;
      wg.params.showVideo = false;
      wg.params.smoothing = true;
      if (isMountedRef.current) {
        setWebgazerPrepared(true);
        setStatus('System ready. Please calibrate before testing.');
        setStatusType('success');
        console.log("[DEBUG] WebGazer prepared successfully.");
      }
    } catch (e) {
      console.error('[DEBUG] Error preparing WebGazer:', e);
      if (isMountedRef.current) {
        setStatus(`Error preparing WebGazer: ${e.message}`);
        setStatusType('error'); setCameraError(true); setWebgazerPrepared(false);
      }
    }
  }, [checkCameraPermissions]);

  useEffect(() => {
    isMountedRef.current = true;
    console.log("[DEBUG] RealEyeTracking component mounted.");
    setStatus('Initializing system...');
    const initTimeout = setTimeout(() => {
        if (!isMountedRef.current) return;
        const onScriptLoadOrDirect = () => {
            if (isMountedRef.current) {
                setTimeout(() => { if (isMountedRef.current) prepareWebGazer(); }, 100);
            }
        };
        if (!window.webgazer) {
            if (isMountedRef.current) setStatus('Loading WebGazer.js script...');
            const script = document.createElement('script');
            script.src = 'https://webgazer.cs.brown.edu/webgazer.js';
            script.async = true;
            document.head.appendChild(script);
            script.onload = onScriptLoadOrDirect;
            script.onerror = () => {
                if (isMountedRef.current) {
                    setStatus('Critical Error: Failed to load WebGazer.js. Please refresh.');
                    setStatusType('error'); setCameraError(true); setWebgazerPrepared(false);
                }
            };
        } else { onScriptLoadOrDirect(); }
    }, 100);
    return () => {
      isMountedRef.current = false;
      clearTimeout(initTimeout);
      console.log('[DEBUG] RealEyeTracking component unmounting. Cleaning up...');
      stopAllIntervals();
      const wg = webgazerInstance.current;
      if (wg) {
        console.log("[DEBUG] Unmount: WebGazer instance exists. Attempting to stop.");
        if (typeof wg.removeGazeListener === 'function') {
            try { wg.removeGazeListener(stableGazeCallback); console.log("[DEBUG] Unmount: Gaze listener removed."); }
            catch (e) { console.warn("[DEBUG] Unmount: Minor error removing gaze listener:", e); }
        }
        if (typeof wg.end === 'function') {
            wg.end()
              .then(() => console.log(`[DEBUG] Unmount: WebGazer.end() called.`))
              .catch(e => console.error(`[DEBUG] Unmount: Error calling WebGazer.end():`, e));
        }
        webgazerInstance.current = null;
      }
    };
  }, [prepareWebGazer, stopAllIntervals, stableGazeCallback]);

  const startCalibrationMode = async () => {
    console.log("[DEBUG] startCalibrationMode called.");
    if (!webgazerPrepared) {
      setStatus('System not ready. Please grant permissions or wait.'); setStatusType('error'); return;
    }
    if (isCameraActive) {
      setStatus('Another process is active.'); setStatusType('error'); return;
    }
    if (webgazerInstance.current) {
      console.log("[DEBUG] startCalibrationMode: Resetting WebGazer model");
      try {
        await webgazerInstance.current.clearData();
        console.log("[DEBUG] startCalibrationMode: WebGazer data cleared");
      } catch (e) {
        console.warn("[DEBUG] startCalibrationMode: Error clearing WebGazer data:", e);
      }
    }
    const cameraStarted = await startGazing();
    if (!cameraStarted) return;
    if (!isMountedRef.current) return;
    setModeWithLog('calibration');
    setCalibrationState({ isCalibrating: true, currentPointIndex: 0, clicksMade: 0, completedPoints: 0 });
    setStatus(`Point 1/${CALIBRATION_POINTS.length} - Click ${CLICKS_PER_POINT} times`);
    setStatusType('info');
    console.log("[DEBUG] startCalibrationMode: Calibration started.");
  };

  const handleCalibrationClick = useCallback(async () => {
    if (!calibrationState.isCalibrating || !webgazerPrepared || !isCameraActive || !canClick) return;
    setCanClick(false);
    setTimeout(() => { if(isMountedRef.current) setCanClick(true); }, CLICK_DELAY_MS);
    let { clicksMade, currentPointIndex, completedPoints } = calibrationState;
    clicksMade++;
    const currentPoint = CALIBRATION_POINTS[currentPointIndex];
    console.log("[DEBUG] handleCalibrationClick: Click recorded, point:", currentPoint, "clicksMade:", clicksMade);
    let newState = { ...calibrationState, clicksMade };
    if (clicksMade >= CLICKS_PER_POINT) {
      completedPoints++;
      const nextPtIdx = currentPointIndex + 1;
      if (nextPtIdx < CALIBRATION_POINTS.length) {
        newState = { isCalibrating: true, currentPointIndex: nextPtIdx, clicksMade: 0, completedPoints };
        if(isMountedRef.current) setStatus(`Point ${nextPtIdx + 1}/${CALIBRATION_POINTS.length} - Click ${CLICKS_PER_POINT} times`);
      } else {
        newState = { isCalibrating: false, currentPointIndex: 0, clicksMade: 0, completedPoints };
        if(isMountedRef.current) {
          setStatus('Calibration complete! Processing...');
          await stopWebGazer("calibration_complete");
          if(isMountedRef.current) {
            setIsCalibrated(true);
            setModeWithLog(null);
            setStatus('Calibration complete! Ready to test.');
            setStatusType('success');
            console.log("[DEBUG] handleCalibrationClick: Calibration completed, isCalibrated set to true.");
          }
        }
      }
    } else {
      if(isMountedRef.current) setStatus(`Point ${currentPointIndex + 1}/${CALIBRATION_POINTS.length} - ${CLICKS_PER_POINT - clicksMade} clicks left`);
    }
    if(isMountedRef.current) setCalibrationState(newState);
  }, [calibrationState, webgazerPrepared, isCameraActive, canClick, stopWebGazer, setModeWithLog]);

  const endCalibration = async () => {
    console.log("[DEBUG] endCalibration (early exit) called.");
    await stopWebGazer("calibration_early_exit");
    if(isMountedRef.current){
      setCalibrationState({ isCalibrating: false, currentPointIndex: 0, clicksMade: 0, completedPoints: 0 });
      setIsCalibrated(false);
      setModeWithLog(null);
      setStatus('Calibration canceled. Please calibrate before testing.');
      setStatusType('info');
      console.log("[DEBUG] endCalibration: Calibration canceled, isCalibrated set to false.");
    }
  };

  const endTest = useCallback(async (early = false, reason = "unknown") => {
    console.log(`[DEBUG] endTest called. Early: ${early}, Reason: ${reason}, Mode: ${mode}, modeRef: ${modeRef.current}`);
    if (!isMountedRef.current) {
      console.log('[DEBUG] endTest call skipped: component not mounted.');
      stopAllIntervals();
      return;
    }
    try {
      stopAllIntervals();
      await stopWebGazer(early ? "test_early_exit" : "test_natural_end");
      if (!isMountedRef.current) {
        console.log("[DEBUG] Component unmounted during endTest after stopWebGazer.");
        return;
      }
      console.log("[DEBUG] endTest: accuracyRef.current:", accuracyRef.current);
      const validSamples = accuracyRef.current.filter(s => typeof s === 'number' && !isNaN(s) && s > 0);
      console.log("[DEBUG] endTest: validSamples:", validSamples);
      const avgAccuracy = validSamples.length ? validSamples.reduce((a, b) => a + b, 0) / validSamples.length : 5;
      const duration = startTimeRef.current ? ((Date.now() - startTimeRef.current) / 1000).toFixed(1) : '0.0';
      setTestResults({
        accuracy: avgAccuracy.toFixed(1),
        consistency: calculateConsistency(validSamples),
        duration: duration,
        samples: accuracyRef.current.length
      });
      setModeWithLog('results');
      setStatus(early ? 'Test ended early. View results.' : 'Test complete. View your results.');
      setStatusType('success');
      setTimeLeft(0);
      isTestEndedRef.current = true;
      console.log("[DEBUG] Test ended, results set, mode changed to results.");
    } catch (error) {
      console.error("[DEBUG] Error in endTest:", error);
      if (isMountedRef.current) {
        setStatus(`Error ending test: ${error.message}`); setStatusType('error');
        setModeWithLog('results');
      }
    }
  }, [mode, stopWebGazer, calculateConsistency, stopAllIntervals, setModeWithLog]);

  const startTestMode = async () => {
    console.log("[DEBUG] startTestMode called, isCalibrated:", isCalibrated);
    if (!webgazerPrepared) {
      setStatus('System not ready.'); setStatusType('error'); return;
    }
    if (isCameraActive) {
      setStatus('Another process is active.'); setStatusType('error'); return;
    }
    if (!isCalibrated) {
      setStatus('Please complete calibration before testing.'); setStatusType('error'); return;
    }
    const cameraStarted = await startGazing();
    if (!cameraStarted) return;
    if (!isMountedRef.current) return;
    startTimeRef.current = Date.now();
    isTestEndedRef.current = false;
    console.log("[DEBUG] Setting mode to 'test'");
    setModeWithLog('test');
    setTestResults(null);
    setTimeLeft(TEST_DURATION_MS / 1000);
    setTargetPosition({ x: 10, y: 10 });
    accuracyRef.current = [];
    lastValidGaze.current = { x: null, y: null };
    setStatus(`Follow the blue dot - ${TEST_DURATION_MS / 1000}s left`);
    setStatusType('info');
    targetInterval.current = setInterval(moveTargetAroundEdge, 30);
    setTimeout(() => {
      if (!isMountedRef.current) return;
      console.log("[DEBUG] Starting countdownInterval, modeRef:", modeRef.current);
      countdownInterval.current = setInterval(() => {
        if (!isMountedRef.current || isTestEndedRef.current) {
          console.log("[DEBUG] Component unmounted or test ended, clearing countdownInterval.");
          if (countdownInterval.current) {
            clearInterval(countdownInterval.current);
            countdownInterval.current = null;
          }
          return;
        }
        setTimeLeft(prev => {
          const nextTime = prev - 1;
          console.log(`[DEBUG] Countdown tick, timeLeft: ${nextTime}, modeRef: ${modeRef.current}`);
          if (nextTime >= 0) {
            setStatus(`Follow the blue dot - ${nextTime}s left`);
          }
          if (nextTime <= 0 && !isTestEndedRef.current) {
            console.log("[DEBUG] timeLeft <= 0, ending test. modeRef:", modeRef.current);
            if (countdownInterval.current) {
              clearInterval(countdownInterval.current);
              countdownInterval.current = null;
            }
            stopAllIntervals();
            console.log("[DEBUG] Countdown finished, ending test naturally.");
            endTest(false, "countdown_finished");
            return prev;
          }
          return nextTime;
        });
      }, 1000);
    }, 500);
    accuracyInterval.current = setInterval(() => {
      console.log("[DEBUG] accuracyInterval tick, isCameraActive:", isCameraActive, "trackingAreaRef.current:", !!trackingAreaRef.current);
      if (isMountedRef.current && isCameraActive && trackingAreaRef.current) {
        const gazeRelativeToTrackingArea = gazeDisplayRef.current;
        console.log("[DEBUG] accuracyInterval: gazeRelativeToTrackingArea:", gazeRelativeToTrackingArea);
        const acc = calculateAccuracy(gazeRelativeToTrackingArea, targetDisplayRef.current, trackingAreaRef.current);
        console.log("[DEBUG] accuracyInterval: calculated accuracy:", acc);
        accuracyRef.current.push(acc);
      } else {
        console.log("[DEBUG] accuracyInterval: conditions not met (isCameraActive:", isCameraActive, ", trackingAreaRef.current:", !!trackingAreaRef.current, ")");
        accuracyRef.current.push(5); // Ensure non-zero
      }
    }, 500);
  };

  const handleBackToMenu = async () => {
    console.log("[DEBUG] handleBackToMenu called.");
    await stopWebGazer("back_to_menu");
    if (isMountedRef.current) {
      setModeWithLog(null);
      setTestResults(null);
      setTimeLeft(TEST_DURATION_MS / 1000);
      setGazePosition({ x: null, y: null });
      setStatus('System ready. Please calibrate before testing.');
      setStatusType('info');
      isTestEndedRef.current = false;
    }
  };

  const handleReturnHome = async () => {
    console.log("[DEBUG] handleReturnHome called.");
    try {
      await stopWebGazer("return_to_home");
      if (isMountedRef.current) {
        setCurrentTest('home');
        setModeWithLog(null);
        setIsCalibrated(false);
        isTestEndedRef.current = false;
        setStatus('System ready. Please calibrate before testing.');
        setStatusType('info');
      }
    } catch (error) {
      console.error("[DEBUG] Error in handleReturnHome:", error);
      if (isMountedRef.current) {
        setStatus("Error returning home. Please try again.");
        setStatusType('error');
      }
    }
  };

  const retryCameraAccess = async () => {
    console.log("[DEBUG] retryCameraAccess called.");
    if (isMountedRef.current) {
      setStatus('Retrying camera permission and setup...'); setStatusType('info');
      setCameraError(false); setWebgazerPrepared(false); setIsCameraActive(false);
      setIsCalibrated(false);
      await prepareWebGazer();
    }
  };

  const getCalibrationPointStyle = () => {
    if (!calibrationState.isCalibrating || !CALIBRATION_POINTS[calibrationState.currentPointIndex]) {
      return { display: 'none' };
    }
    const pt = CALIBRATION_POINTS[calibrationState.currentPointIndex];
    return {
      left: `${pt.x * 100}%`, top: `${pt.y * 100}%`,
      opacity: Math.min(1, 0.2 * calibrationState.clicksMade + 0.2),
      backgroundColor: calibrationState.clicksMade >= CLICKS_PER_POINT ? 'yellow' : 'red'
    };
  };

  const calibrationProgress = calibrationState.isCalibrating
    ? ((calibrationState.completedPoints * CLICKS_PER_POINT + calibrationState.clicksMade) /
       (CALIBRATION_POINTS.length * CLICKS_PER_POINT)) * 100
    : 0;

  const commonButtonDisabled = !webgazerPrepared || isCameraActive;

  console.log("[DEBUG] Render, mode:", mode);

  return (
    <div className="eye-test-container">
      <div className="header-section">
        <h2>Eye Tracking Test</h2>
        <div className={`status ${statusType}`}>{status}</div>
      </div>
      <div className="main-content">
        {cameraError && !isCameraActive && !webgazerPrepared ? (
          <div className="error-panel">
            <p>A camera or system initialization error occurred.</p>
            <button onClick={retryCameraAccess} className="retry-button">Retry Camera Access</button>
            <div className="troubleshooting">
              <p>Tips:</p>
              <ol>
                <li>Ensure browser has camera permissions for this site.</li>
                <li>Check if another app is using the camera.</li>
                <li>Good lighting is important.</li>
              </ol>
            </div>
          </div>
        ) : mode === 'results' ? (
          <div className="results-panel">
            <h3>Test Results</h3>
            <div className="result-item"><span className="result-label">Accuracy:</span><span className="result-value">{testResults?.accuracy}%</span><span className="result-description">(Closeness to target)</span></div>
            <div className="result-item"><span className="result-label">Consistency:</span><span className="result-value">{testResults?.consistency}%</span><span className="result-description">(Steadiness)</span></div>
            <div className="result-item"><span className="result-label">Duration:</span><span className="result-value">{testResults?.duration}s</span></div>
            <div className="result-item"><span className="result-label">Samples:</span><span className="result-value">{testResults?.samples}</span></div>
            <button type="button" onClick={handleBackToMenu} className="control-button">
              Back to Menu
            </button>
          </div>
        ) : mode === 'calibration' ? (
          <div className="calibration-view">
            <div className="tracking-area" onClick={handleCalibrationClick} ref={trackingAreaRef}>
              {calibrationState.isCalibrating && <div className="calibration-point" style={getCalibrationPointStyle()} />}
            </div>
            <div className="calibration-progress">
              <progress value={calibrationProgress} max="100" />
              <span>{Math.round(calibrationProgress)}% complete</span>
            </div>
            <div className="button-row"><button onClick={endCalibration} className="exit-button">Exit Calibration</button></div>
            <div className="calibration-instructions">
              <p>Click each red point until it turns yellow ({CLICKS_PER_POINT} clicks per point). Remain still.</p>
            </div>
          </div>
        ) : mode === 'test' ? (
          <div className="test-view">
            <div className="tracking-area" ref={trackingAreaRef}>
              <div className="target-dot" style={{ left: `${targetPosition.x}%`, top: `${targetPosition.y}%` }}/>
              {isCameraActive && typeof gazePosition.x === 'number' && !isNaN(gazePosition.x) &&
                <div className="gaze-indicator" style={{ left: `${gazePosition.x}px`, top: `${gazePosition.y}px` }}/>}
            </div>
            <div className="button-row"><button onClick={() => endTest(true, "early_exit_button")} className="exit-button">End Test Early</button></div>
          </div>
        ) : (
          <div className="mode-selection">
            <div className="mode-card">
              <h3>Calibration</h3>
              <p className="mode-description">Calibrate for accuracy ({CLICKS_PER_POINT} clicks per point).</p>
              <button onClick={startCalibrationMode} disabled={commonButtonDisabled}
                      className={`mode-button ${commonButtonDisabled ? 'disabled' : ''}`}>
                Start Calibration
              </button>
            </div>
            <div className="mode-card">
              <h3>Eye Test</h3>
              <p className="mode-description">Follow target for {TEST_DURATION_MS / 1000}s.</p>
              <button onClick={startTestMode} disabled={commonButtonDisabled || !isCalibrated}
                      className={`mode-button ${(commonButtonDisabled || !isCalibrated) ? 'disabled' : ''}`}>
                Start Test
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="footer-section">
        <button onClick={handleReturnHome} className="home-button">Return to Home</button>
      </div>
    </div>
  );
}