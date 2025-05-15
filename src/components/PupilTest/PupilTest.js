import React, { useState, useEffect, useRef, memo } from 'react';
import { FaceMesh } from '@mediapipe/face_mesh';
import './PupilTest.css';

export default function PupilTest({ setCurrentTest }) {
  // Configuration
  const baselineDotRadius = 80;
  const initialDarkAdaptationDuration = 3000;
  const baselineDarkAdaptationDuration = 7000; // 7 seconds
  const lightFlashIntensities = [1.5, 2.0, 2.5];
  const lightFlashDurations = [1000, 2000, 1500];

  // State
  const [step, setStep] = useState('intro');
  const [cycleIndex, setCycleIndex] = useState(0);
  const [overlayState, setOverlayState] = useState({
    type: null, // null, 'initial', 'baseline', 'flash'
    isTransitioning: false
  });
  const [testMetrics, setTestMetrics] = useState([]);
  const [recallInput, setRecallInput] = useState('');
  const [isRecallCorrect, setIsRecallCorrect] = useState(null);
  const [currentLiveDiameter, setCurrentLiveDiameter] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const [measurementError, setMeasurementError] = useState(null);
  const [detectionWarning, setDetectionWarning] = useState(null);

  // Refs
  const videoRef = useRef(null);
  const faceMeshRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const liveDiameterRef = useRef(null);
  const memoryNumberRef = useRef(Math.floor(100 + Math.random() * 900));
  const containerRef = useRef(null);
  const noDetectionTimerRef = useRef(null);
  const streamRef = useRef(null);
  const initializationTimeoutRef = useRef(null);

  const utilityDelay = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Check camera permission on mount
  useEffect(() => {
    async function checkCameraPermission() {
      try {
        console.log('Checking camera permission');
        const permissionStatus = await navigator.permissions.query({ name: 'camera' });
        setHasCameraPermission(permissionStatus.state === 'granted');
        permissionStatus.onchange = () => {
          setHasCameraPermission(permissionStatus.state === 'granted');
          console.log('Camera permission changed:', permissionStatus.state);
        };
      } catch (error) {
        console.error('Error checking camera permission:', error);
        setHasCameraPermission(false);
      }
    }
    checkCameraPermission();
  }, []);

  // Monitor camera readiness and transition to calibration
  useEffect(() => {
    if (step === 'initializing' && isCameraReady) {
      console.log('Camera ready, transitioning to calibration');
      setStep('calibration');
    }
  }, [step, isCameraReady]);

  // Initialize camera and FaceMesh
  async function initializeCameraAndFaceMesh() {
    try {
      console.log('Initializing camera and FaceMesh');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setIsCameraReady(true);
      console.log('Camera initialized successfully, video playing');

      const canvas = canvasRef.current;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;

      const faceMesh = new FaceMesh({
        locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      });
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.8,
        minTrackingConfidence: 0.8,
      });
      faceMesh.onResults(handleFaceMeshResults);
      faceMeshRef.current = faceMesh;

      requestAnimationFrame(processVideoFrame);
      return true;
    } catch (error) {
      console.error('Camera initialization failed:', error);
      setIsCameraReady(false);
      setMeasurementError('Failed to access camera. Please ensure camera permissions are granted and try again.');
      return false;
    }
  }

  async function processVideoFrame() {
    if (videoRef.current?.readyState >= HTMLMediaElement.HAVE_METADATA) {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      context.filter = 'brightness(0.8) contrast(300%) grayscale(100%)';
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      await faceMeshRef.current?.send({ image: canvas });
    }
    requestAnimationFrame(processVideoFrame);
  }

  // Cleanup camera and FaceMesh
  function cleanupCameraAndFaceMesh() {
    console.log('Cleaning up camera and FaceMesh');
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (faceMeshRef.current && typeof faceMeshRef.current.close === 'function') {
      faceMeshRef.current.close();
      faceMeshRef.current = null;
    }
    if (noDetectionTimerRef.current) {
      clearTimeout(noDetectionTimerRef.current);
      noDetectionTimerRef.current = null;
    }
    if (initializationTimeoutRef.current) {
      clearTimeout(initializationTimeoutRef.current);
      initializationTimeoutRef.current = null;
    }
    setIsCameraReady(false);
  }

  function handleFaceMeshResults({ multiFaceLandmarks }) {
    if (!multiFaceLandmarks?.length) {
      liveDiameterRef.current = null;
      setCurrentLiveDiameter(null);
      if (!noDetectionTimerRef.current && step === 'testing') {
        noDetectionTimerRef.current = setTimeout(() => {
          setDetectionWarning('Face not detected. Please face the camera directly and ensure good lighting.');
        }, 2000);
      }
      return;
    }

    if (noDetectionTimerRef.current) {
      clearTimeout(noDetectionTimerRef.current);
      noDetectionTimerRef.current = null;
      setDetectionWarning(null);
    }

    const landmarks = multiFaceLandmarks[0];
    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;
    const irisLandmarks = landmarks.slice(468, 473);
    const points = irisLandmarks.map(p => [p.x * canvasWidth, p.y * canvasHeight]);

    if (points.length < 2) {
      liveDiameterRef.current = null;
      setCurrentLiveDiameter(null);
      return;
    }

    const n = points.length;
    const meanX = points.reduce((sum, [x]) => sum + x, 0) / n;
    const meanY = points.reduce((sum, [, y]) => sum + y, 0) / n;

    let cxx = 0, cxy = 0, cyy = 0;
    points.forEach(([x, y]) => {
      const dx = x - meanX;
      const dy = y - meanY;
      cxx += dx * dx;
      cxy += dx * dy;
      cyy += dy * dy;
    });
    cxx /= n;
    cyy /= n;
    cxy /= n;

    const trace = cxx + cyy;
    const determinant = cxx * cyy - cxy * cxy;
    const discriminant = Math.sqrt(Math.max(0, (trace * trace) / 4 - determinant));
    const lambda1 = trace / 2 + discriminant;
    const diameter = 2 * Math.sqrt(lambda1);

    if (diameter < 2 || diameter > 40) {
      liveDiameterRef.current = null;
      setCurrentLiveDiameter(null);
      return;
    }

    liveDiameterRef.current = diameter;
    setCurrentLiveDiameter(diameter.toFixed(1));
  }

  async function samplePupilDiameterMedian(samples = 60, interval = 10) {
    const readings = [];
    for (let i = 0; i < samples; i++) {
      await utilityDelay(interval);
      if (liveDiameterRef.current !== null) readings.push(liveDiameterRef.current);
    }
    if (!readings.length) return null;

    readings.sort((a, b) => a - b);
    const trimCount = Math.floor(readings.length * 0.1);
    const trimmed = readings.slice(trimCount, readings.length - trimCount);
    return trimmed.length ? trimmed[Math.floor(trimmed.length / 2)] : readings[Math.floor(readings.length / 2)];
  }

  async function runSingleTestCycle(currentIndex) {
    if (overlayState.isTransitioning) {
      console.warn(`Cycle ${currentIndex + 1} skipped due to ongoing transition`);
      return;
    }

    console.log(`[${Date.now()}] Starting Cycle ${currentIndex + 1}, overlayState=${overlayState.type}`);

    // Reset diameter
    liveDiameterRef.current = null;
    setCurrentLiveDiameter(null);

    // Baseline measurement
    setOverlayState({ type: 'baseline', isTransitioning: false });
    console.log(`[${Date.now()}] Baseline ON, overlayState=baseline`);
    await utilityDelay(baselineDarkAdaptationDuration);
    const measuredBaseline = await samplePupilDiameterMedian();
    setOverlayState({ type: null, isTransitioning: false });

    // Flash and constriction measurement
    setOverlayState({ type: 'flash', isTransitioning: false });
    console.log(`[${Date.now()}] Flash ON, overlayState=flash`);
    await utilityDelay(lightFlashDurations[currentIndex] - 100);
    const measuredConstricted = await samplePupilDiameterMedian(10, 10); // Sample last 100ms
    await utilityDelay(100); // Ensure flash completes
    setOverlayState({ type: null, isTransitioning: true });
    console.log(`[${Date.now()}] Flash OFF, overlayState=null`);

    // Debug logging
    console.log(`Cycle ${currentIndex + 1}: Baseline=${measuredBaseline?.toFixed(1) || 'N/A'}, Constricted=${measuredConstricted?.toFixed(1) || 'N/A'}`);

    // Record results
    let delta, percent;
    if (measuredBaseline && measuredConstricted && measuredBaseline >= measuredConstricted) {
      delta = (measuredBaseline - measuredConstricted).toFixed(1);
      percent = (((measuredBaseline - measuredConstricted) / measuredBaseline) * 100).toFixed(1);
    } else {
      console.warn(`Invalid measurement in cycle ${currentIndex + 1}: Baseline=${measuredBaseline}, Constricted=${measuredConstricted}`);
      delta = '–';
      percent = '–';
      setMeasurementError('Some measurements were invalid, possibly due to lighting, positioning, or camera issues. Please retry in a near-dark room, facing the camera directly.');
    }

    setTestMetrics(prev => [
      ...prev,
      {
        cycle: currentIndex + 1,
        baseline: measuredBaseline?.toFixed(1) || '–',
        constricted: measuredConstricted?.toFixed(1) || '–',
        delta,
        percent
      }
    ]);

    // Next cycle or recall
    if (currentIndex + 1 < lightFlashIntensities.length) {
      setCycleIndex(currentIndex + 1);
      setOverlayState({ type: 'baseline', isTransitioning: false });
      console.log(`[${Date.now()}] Transition to Cycle ${currentIndex + 2}, overlayState=baseline`);
    } else {
      setOverlayState({ type: null, isTransitioning: false });
      cleanupCameraAndFaceMesh(); // Turn off camera before recall
      setStep('recall');
    }
  }

  async function checkCalibration() {
    console.log('Checking calibration');
    let validDetections = 0;
    for (let i = 0; i < 10; i++) {
      await utilityDelay(100);
      if (liveDiameterRef.current !== null) validDetections++;
    }
    console.log(`Calibration result: ${validDetections}/10 valid detections`);
    return validDetections >= 8; // 80% valid
  }

  useEffect(() => {
    if (step === 'calibration') {
      console.log('Entered calibration step');
      setOverlayState({ type: 'initial', isTransitioning: false });
      const timer = setTimeout(async () => {
        setOverlayState({ type: null, isTransitioning: false });
        const isCalibrated = await checkCalibration();
        if (isCalibrated) {
          console.log('Calibration successful, proceeding to testing');
          setStep('testing');
        } else {
          console.log('Calibration failed');
          setMeasurementError('Unable to detect face reliably. Please ensure good lighting and face the camera directly.');
          cleanupCameraAndFaceMesh(); // Cleanup if calibration fails
          setStep('preparation');
        }
      }, initialDarkAdaptationDuration);
      return () => clearTimeout(timer);
    }
    if (step === 'testing' && !overlayState.isTransitioning) {
      console.log('Starting test cycle', cycleIndex + 1);
      runSingleTestCycle(cycleIndex);
    }
  }, [step, cycleIndex]);

  // Cleanup to prevent flash during cycle transitions
  useEffect(() => {
    return () => {
      setOverlayState({ type: null, isTransitioning: false });
      console.log(`[${Date.now()}] Cleanup: overlayState reset to null`);
    };
  }, [cycleIndex]);

  const handleStartTest = async () => {
    console.log('Begin Test clicked');
    setTestMetrics([]);
    setCycleIndex(0);
    setMeasurementError(null);
    setDetectionWarning(null);
    setOverlayState({ type: null, isTransitioning: false });
    setStep('initializing');

    // Set a timeout to detect initialization failure
    initializationTimeoutRef.current = setTimeout(() => {
      if (step === 'initializing' && !isCameraReady) {
        console.error('Camera initialization timed out');
        setMeasurementError('Camera initialization took too long. Please ensure camera access and try again.');
        cleanupCameraAndFaceMesh();
        setStep('preparation');
      }
    }, 5000); // 5 seconds timeout

    const initialized = await initializeCameraAndFaceMesh();
    if (!initialized) {
      console.log('Initialization failed, returning to preparation');
      clearTimeout(initializationTimeoutRef.current);
      initializationTimeoutRef.current = null;
      setStep('preparation');
    }
  };

  const handleRecallSubmit = () => {
    setIsRecallCorrect(recallInput === memoryNumberRef.current.toString());
    setStep('results');
  };

  const validDeltas = testMetrics.map(m => parseFloat(m.percent)).filter(v => !isNaN(v));
  const avgDelta = validDeltas.length ? (validDeltas.reduce((a, b) => a + b, 0) / validDeltas.length).toFixed(1) : null;

  // Memoized Overlay Component
  const Overlay = memo(({ overlayState, cycleIndex, lightFlashIntensities, currentLiveDiameter, detectionWarning, baselineDotRadius }) => {
    if (!overlayState.type) return null;
    return (
      <div className={overlayState.type === 'flash' ? 'full-flash-overlay' : 'full-black-overlay'}>
        {overlayState.type !== 'flash' && (
          <>
            <div className="overlay-text">
              {overlayState.type === 'initial' && 'Preparing test...'}
              {overlayState.type === 'baseline' &&
                `Cycle ${cycleIndex + 1} of ${lightFlashIntensities.length}: Focus`}
            </div>
            <div className="ring-indicator">
              <div 
                className="pupil-dot"
                style={{ width: baselineDotRadius, height: baselineDotRadius }}
              />
            </div>
            {currentLiveDiameter && (
              <div className="live-feedback">
                {currentLiveDiameter}px
              </div>
            )}
            {detectionWarning && (
              <div className="error-message">
                {detectionWarning}
              </div>
            )}
          </>
        )}
      </div>
    );
  });

  return (
    <div className="pupil-test-container" ref={containerRef}>
      <video ref={videoRef} className="hidden-video" playsInline muted />
      <Overlay
        overlayState={overlayState}
        cycleIndex={cycleIndex}
        lightFlashIntensities={lightFlashIntensities}
        currentLiveDiameter={currentLiveDiameter}
        detectionWarning={detectionWarning}
        baselineDotRadius={baselineDotRadius}
      />

      {step === 'intro' && (
        <div className="intro-step">
          <h2>Pupillary Response Test</h2>
          <div className="memory-number">{memoryNumberRef.current}</div>
          <p>Remember this number for later recall</p>
          <button 
            className="primary-button"
            onClick={() => setStep('preparation')}
            disabled={hasCameraPermission === null || !hasCameraPermission}
          >
            Continue
          </button>
          {hasCameraPermission === false && (
            <div className="error-message">
              Camera permission is required to proceed. Please grant camera access in your browser settings.
            </div>
          )}
        </div>
      )}

      {step === 'preparation' && (
        <div className="preparation-step">
          <h3>Test Preparation</h3>
          <ul className="instructions">
            <li>Ensure a near-dark room (turn off all room lights except the monitor).</li>
            <li>Set your monitor brightness to the lowest comfortable level.</li>
            <li>Position yourself 50-60cm from your camera and face it directly.</li>
            <li>Keep your head still and avoid blinking during measurements.</li>
            <li>Focus on the central dot during the black screen and maintain focus throughout the test.</li>
          </ul>
          {measurementError && (
            <div className="error-message">
              {measurementError}
            </div>
          )}
          <button className="primary-button start-button" onClick={handleStartTest}>
            Begin Test
          </button>
        </div>
      )}

      {step === 'initializing' && (
        <div className="preparation-step">
          <h3>Initializing Camera...</h3>
          <p>Please wait while the camera is set up.</p>
          {measurementError && (
            <div className="error-message">
              {measurementError}
            </div>
          )}
        </div>
      )}

      {step === 'testing' && (
        <div className="testing-step">
          {/* Minimal content; visuals handled by overlays */}
        </div>
      )}

      {step === 'recall' && (
        <div className="recall-step">
          <h3>Memory Recall</h3>
          <p>Please enter the number you were shown at the beginning of the test.</p>
          <div className="recall-task">
            <input
              type="text"
              value={recallInput}
              onChange={e => setRecallInput(e.target.value)}
              placeholder="Enter the number"
            />
            <button className="primary-button" onClick={handleRecallSubmit}>
              Submit
            </button>
          </div>
        </div>
      )}

      {step === 'results' && (
        <div className="results-step">
          <h3>Test Results</h3>
          
          {measurementError && (
            <div className="error-message">
              {measurementError}
            </div>
          )}

          <div className="metrics-grid">
            {testMetrics.map((m, i) => (
              <div key={i} className="metric-card">
                <h4>Cycle {m.cycle}</h4>
                <div className="metric-row">
                  <span>Baseline:</span>
                  <span>{m.baseline}px</span>
                </div>
                <div className="metric-row">
                  <span>Constricted:</span>
                  <span>{m.constricted}px</span>
                </div>
                <div className="metric-row highlight">
                  <span>Change:</span>
                  <span>{m.delta}px ({m.percent}%)</span>
                </div>
              </div>
            ))}
          </div>

          {avgDelta && (
            <div className="summary-card">
              <h4>Average Pupil Constriction</h4>
              <div className="result-value">{avgDelta}%</div>
              <div className="interpretation">
                <p><strong>Reference Range:</strong> A normal pupillary response typically shows an average constriction of 20–40%.</p>
                {avgDelta > 20 ? (
                  <>
                    <p><strong>Normal Response:</strong> Your pupils constricted by an average of {avgDelta}%, which is within the typical range for healthy individuals.</p>
                    <p>The Pupillary Light Response (PLR) test measures how your pupils react to light, which can be an early indicator of neurological health. A normal response suggests typical neurological function, but regular check-ups are recommended.</p>
                  </>
                ) : avgDelta > 10 ? (
                  <>
                    <p><strong>Mild Reduction:</strong> Your pupils constricted by an average of {avgDelta}%, which is below the typical range.</p>
                    <p>This may not indicate a problem, but reduced PLR can sometimes be associated with neurological conditions, including early Alzheimer's disease. We recommend discussing these results with a healthcare professional for further evaluation.</p>
                  </>
                ) : (
                  <>
                    <p><strong>Significant Reduction:</strong> Your pupils constricted by an average of {avgDelta}%, which is significantly below the typical range.</p>
                    <p>A reduced PLR may be an early sign of neurological issues, such as Alzheimer's disease, as the pupil's response to light can reflect brain function. Please consult a healthcare professional promptly to discuss these results and consider further testing.</p>
                  </>
                )}
                {avgDelta < 1 && (
                  <p><strong>Note:</strong> A very low constriction percentage may indicate measurement issues. Please ensure a near-dark room, direct camera facing, and focus on the central dot, then retry the test.</p>
                )}
                <p><em>Note: This test is for informational purposes only and is not a substitute for a medical diagnosis.</em></p>
              </div>
            </div>
          )}

          {testMetrics.length > 1 && validDeltas.length < testMetrics.length / 2 && (
            <div className="error-message">
              Multiple cycles failed to measure valid pupil responses. Please retry in a near-dark room with stable positioning.
            </div>
          )}

          <div className="recall-task">
            <h4>Memory Recall Result</h4>
            {isRecallCorrect !== null && (
              <div className={`feedback ${isRecallCorrect ? 'correct' : 'incorrect'}`}>
                {isRecallCorrect ? 'Correct!' : `Incorrect (was ${memoryNumberRef.current})`}
              </div>
            )}
          </div>

          <button className="primary-button" onClick={() => setCurrentTest('home')}>
            Complete Test
          </button>
        </div>
      )}
    </div>
  );
}