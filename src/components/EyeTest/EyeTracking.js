// src/components/EyeTest/EyeTracking.js
import React, { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';

function EyeResults({ results, onReset }) {
  return (
    <div style={{ 
      padding: '20px',
      maxWidth: '800px',
      margin: '0 auto',
      textAlign: 'center'
    }}>
      <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>視覺反應測試結果</h2>
      
      <div style={{ 
        display: 'flex',
        justifyContent: 'center',
        gap: '30px',
        margin: '30px 0'
      }}>
        <div style={{ 
          padding: '20px', 
          backgroundColor: '#f0fdf4', 
          borderRadius: '8px',
          minWidth: '120px'
        }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>分數</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#22c55e' }}>{results.score}</div>
        </div>
        
        <div style={{ 
          padding: '20px', 
          backgroundColor: '#f0f9ff', 
          borderRadius: '8px',
          minWidth: '120px'
        }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>平均反應時間</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#0ea5e9' }}>{results.averageTime}ms</div>
        </div>
      </div>
      
      <div style={{ 
        padding: '20px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        marginBottom: '30px',
        textAlign: 'left',
        lineHeight: 1.6
      }}>
        <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>分析結果</h3>
        <p>{results.analysis}</p>
      </div>
      
      <button 
        onClick={onReset}
        style={{
          backgroundColor: '#5D5CDE',
          color: 'white',
          border: 'none',
          padding: '12px 24px',
          fontSize: '16px',
          fontWeight: 'bold',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
      >
        回到測試頁面
      </button>
    </div>
  );
}

function EyeTracking({ setCurrentTest }) {
  // References
  const webcamRef = useRef(null);
  const containerRef = useRef(null);
  const timerRef = useRef(null);
  const motionCanvasRef = useRef(null);
  const lastFrameRef = useRef(null);
  const animationRef = useRef(null);
  const isRunningRef = useRef(true);
  
  // Basic state variables
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0 });
  const [targetVisible, setTargetVisible] = useState(false);
  const [reactionTimes, setReactionTimes] = useState([]);
  const [testCount, setTestCount] = useState(0);
  const [results, setResults] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [testStarted, setTestStarted] = useState(false);
  const [targetSize, setTargetSize] = useState(60);
  
  // Motion detection - changed default to extreme sensitivity
  const [motionDetected, setMotionDetected] = useState(false);
  const [motionLevel, setMotionLevel] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [sensitivityLevel, setSensitivityLevel] = useState('extreme'); // low, medium, high, extreme
  const [autoAdvanceProgress, setAutoAdvanceProgress] = useState(0);
  
  // Constants - updated with more sensitive thresholds
  const MAX_TESTS = 5;
  const REQUIRED_FOCUS_TIME = 2000; // milliseconds of steady focus required for auto-advance
  const SENSITIVITY_SETTINGS = {
    low: {
      focusThreshold: 0.08,
      motionThreshold: 0.15,
    },
    medium: {
      focusThreshold: 0.05,
      motionThreshold: 0.12,
    },
    high: {
      focusThreshold: 0.03,
      motionThreshold: 0.08,
    },
    extreme: {
      focusThreshold: 0.015,
      motionThreshold: 0.04,
    }
  };
  
  // Auto-advance when user maintains stable gaze on target
  useEffect(() => {
    let focusTimer = null;
    let progressInterval = null;
    
    if (focusMode && targetVisible && testStarted) {
      const startTime = Date.now();
      console.log('Steady state detected, starting auto-advance timer');
      
      // Update progress indicator every 50ms
      progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, (elapsed / REQUIRED_FOCUS_TIME) * 100);
        setAutoAdvanceProgress(progress);
        
        if (progress >= 100) {
          clearInterval(progressInterval);
        }
      }, 50);
      
      // Trigger auto-advance after required focus time
      focusTimer = setTimeout(() => {
        console.log('Sustained stability detected - auto-advancing');
        handleTargetHit('gaze');
      }, REQUIRED_FOCUS_TIME);
    } else {
      setAutoAdvanceProgress(0);
    }
    
    // Clean up timers if focus is lost or component changes
    return () => {
      if (focusTimer) clearTimeout(focusTimer);
      if (progressInterval) clearInterval(progressInterval);
    };
  }, [focusMode, targetVisible, testStarted]);
  
  // Handle results state - stop motion detection
  useEffect(() => {
    if (results) {
      console.log("Results are shown, stopping motion detection");
      isRunningRef.current = false;
      
      // Clean up animation frame
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    } else {
      isRunningRef.current = true;
    }
  }, [results]);
  
  // Camera ready handler
  const handleCameraReady = () => {
    console.log("Camera is ready");
    setCameraReady(true);
    
    // Initialize motion detection
    if (motionCanvasRef.current) {
      const ctx = motionCanvasRef.current.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        startMotionDetection();
      }
    }
  };
  
  // Camera error handler
  const handleCameraError = (error) => {
    console.error("Camera error:", error);
    setCameraError(`相機錯誤: ${error.name}`);
  };
  
  // Start motion detection
  const startMotionDetection = () => {
    if (!motionCanvasRef.current) return;
    
    const detectMotion = () => {
      // Check if we should still be running
      if (!isRunningRef.current) {
        console.log("Motion detection stopped");
        return;
      }
      
      // Check if webcam is available
      if (!webcamRef.current || !webcamRef.current.video || webcamRef.current.video.readyState !== 4) {
        animationRef.current = requestAnimationFrame(detectMotion);
        return;
      }
      
      const video = webcamRef.current.video;
      const canvas = motionCanvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      // Set canvas size
      if (canvas.width !== 320 || canvas.height !== 240) {
        canvas.width = 320;
        canvas.height = 240;
      }
      
      try {
        // Draw current frame (scaled down for performance)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get pixel data
        const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Compare with last frame if available
        if (lastFrameRef.current) {
          const lastData = lastFrameRef.current.data;
          const currentData = currentFrame.data;
          let motionPixels = 0;
          let totalPixels = 0;
          
          // Compare pixels (sample more pixels for better sensitivity)
          for (let i = 0; i < currentData.length; i += 12) {
            const rdiff = Math.abs(currentData[i] - lastData[i]);
            const gdiff = Math.abs(currentData[i+1] - lastData[i+1]);
            const bdiff = Math.abs(currentData[i+2] - lastData[i+2]);
            
            totalPixels++;
            
            // More sensitive threshold for change detection
            if (rdiff > 10 || gdiff > 10 || bdiff > 10) {
              motionPixels++;
            }
          }
          
          // Calculate motion level (0-1)
          const motionPercent = motionPixels / totalPixels;
          setMotionLevel(motionPercent);
          
          // Get current settings based on sensitivity
          const settings = SENSITIVITY_SETTINGS[sensitivityLevel];
          
          // Detect if motion is above threshold
          setMotionDetected(motionPercent > settings.motionThreshold);
          
          // Detect focus state (very little motion)
          const newFocusMode = motionPercent < settings.focusThreshold;
          setFocusMode(newFocusMode);
        }
        
        // Save current frame as last frame
        lastFrameRef.current = currentFrame;
      } catch (error) {
        console.error("Error in motion detection:", error);
      }
      
      // Continue detection loop
      if (isRunningRef.current) {
        animationRef.current = requestAnimationFrame(detectMotion);
      }
    };
    
    // Start detection loop
    detectMotion();
  };
  
  // Begin Test Function
  const startTest = () => {
    console.log("Starting visual reaction test");
    setTestStarted(true);
    setTestCount(0);
    setReactionTimes([]);
    setResults(null);
    isRunningRef.current = true;
    
    // Show first target after delay
    timerRef.current = setTimeout(() => {
      showNextTarget();
    }, 2000);
  };
  
  // Show next target
  const showNextTarget = () => {
    console.log("Showing next target");
    const container = containerRef.current;
    if (!container) {
      console.error("Container ref not found");
      return;
    }
    
    const rect = container.getBoundingClientRect();
    console.log("Container dimensions:", rect.width, rect.height);
    
    // Generate random position
    const margin = targetSize;
    const x = Math.floor(Math.random() * (rect.width - 2 * margin)) + margin;
    const y = Math.floor(Math.random() * (rect.height - 2 * margin)) + margin;
    
    // For the first target, use a bigger size
    const isFirstTarget = testCount === 0;
    setTargetSize(isFirstTarget ? 80 : 60);
    
    console.log(`Showing target ${testCount + 1} at (${x}, ${y})`);
    
    // Show target
    setTargetPosition({ x, y });
    setTargetVisible(true);
    setStartTime(Date.now());
    setAutoAdvanceProgress(0);
    
    console.log("Target should now be visible");
  };
  
  // Handle target hit
  const handleTargetHit = (method = 'click') => {
    if (!targetVisible) return;
    
    // Calculate reaction time
    const endTime = Date.now();
    const reactionTime = endTime - startTime;
    
    console.log(`Target hit by ${method}! Reaction time: ${reactionTime}ms`);
    
    // Add to reaction times
    const newReactionTimes = [...reactionTimes, reactionTime];
    setReactionTimes(newReactionTimes);
    
    // Hide target
    setTargetVisible(false);
    
    // Reset auto-advance progress
    setAutoAdvanceProgress(0);
    
    // Clear any existing timers
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    // Increment test count
    const newCount = testCount + 1;
    setTestCount(newCount);
    
    console.log(`Test count: ${newCount} of ${MAX_TESTS}`);
    
    // Schedule next target or finish test
    if (newCount >= MAX_TESTS) {
      console.log("All tests completed, stopping motion detection");
      // Stop motion detection
      isRunningRef.current = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      
      console.log("Finishing test");
      setTimeout(() => {
        finishTest(newReactionTimes);
      }, 100);
    } else {
      timerRef.current = setTimeout(showNextTarget, 1500);
    }
  };
  
  // Finish the test
  const finishTest = (times) => {
    const reactTimes = times || reactionTimes;
    console.log(`Finishing test with reaction times:`, reactTimes);
    
    if (reactTimes.length === 0) {
      setTestStarted(false);
      return;
    }
    
    // Calculate average reaction time
    const avgTime = Math.round(
      reactTimes.reduce((sum, time) => sum + time, 0) / reactTimes.length
    );
    
    // Calculate score
    const baseScore = 100 - (avgTime / 20);
    const score = Math.max(50, Math.min(98, Math.round(baseScore)));
    
    console.log(`Average time: ${avgTime}ms, Score: ${score}`);
    
    // Generate analysis text
    let analysis = '';
    if (avgTime < 600 && score > 90) {
      analysis = '分析顯示您的視覺反應時間非常快，表明您的視覺處理能力處於優異水平。這些特徵通常表示神經系統的良好狀態。';
    } else if (avgTime < 800 && score > 80) {
      analysis = '分析顯示您的視覺反應時間良好。這表明您的視覺處理能力處於正常水平。沒有發現明顯的認知障礙跡象。';
    } else if (avgTime < 1000 && score > 70) {
      analysis = '分析顯示您的視覺反應時間處於正常範圍。您的視覺處理能力表現一般，建議定期進行視覺訓練以保持良好狀態。';
    } else {
      analysis = '分析顯示您的視覺反應時間較慢。這可能表明視覺處理方面存在一些挑戰。建議進行更全面的視覺和認知評估。';
    }
    
    // Prepare results data
    const resultsData = {
      score: score,
      averageTime: avgTime,
      accuracy: score,
      analysis: analysis
    };
    
    console.log("Setting final results:", resultsData);
    
    // Reset test state
    setTestStarted(false);
    
    // Set results
    setResults(resultsData);
  };
  
  // Change sensitivity level
  const handleSensitivityChange = (level) => {
    setSensitivityLevel(level);
  };
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      isRunningRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);
  
  // Render results screen
  if (results) {
    console.log("Rendering results screen");
    return <EyeResults results={results} onReset={() => {
      setResults(null);
      // Restart motion detection
      isRunningRef.current = true;
      if (cameraReady && motionCanvasRef.current) {
        startMotionDetection();
      }
    }} />;
  }

  return (
    <div style={{ 
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      maxWidth: '800px',
      margin: '0 auto'
    }}>
      <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '10px', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>視覺反應測試</h1>
      </div>
      
      {/* Status bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        marginBottom: '15px',
        backgroundColor: '#f8f9fa',
        padding: '10px',
        borderRadius: '8px',
        fontSize: '14px'
      }}>
        <div style={{
          padding: '5px 10px',
          borderRadius: '4px',
          backgroundColor: cameraReady ? '#d1fae5' : '#fee2e2'
        }}>
          <span>相機：</span>
          <strong>{cameraReady ? '✓' : '✗'}</strong>
        </div>
        <div style={{
          padding: '5px 10px',
          borderRadius: '4px',
          backgroundColor: motionDetected ? '#fee2e2' : (focusMode ? '#d1fae5' : '#fef3c7')
        }}>
          <span>穩定狀態：</span>
          <strong>
            {motionDetected ? '移動中' : (focusMode ? '穩定' : '需要穩定')}
          </strong>
        </div>
        
        {/* Motion level indicator */}
        <div style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>移動程度：</span>
          <div style={{
            width: '100px',
            height: '10px',
            backgroundColor: '#e5e7eb',
            borderRadius: '5px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${Math.min(100, motionLevel * 100 * 5)}%`,
              height: '100%',
              backgroundColor: motionLevel > SENSITIVITY_SETTINGS[sensitivityLevel].motionThreshold ? '#ef4444' : 
                              motionLevel < SENSITIVITY_SETTINGS[sensitivityLevel].focusThreshold ? '#22c55e' : '#f59e0b',
              transition: 'width 0.2s, background-color 0.2s'
            }} />
          </div>
        </div>
      </div>
      
      {/* Sensitivity selector - only shown when not testing */}
      {!testStarted && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          fontSize: '14px'
        }}>
          <span>穩定靈敏度：</span>
          <div style={{ display: 'flex', gap: '5px' }}>
            {['low', 'medium', 'high', 'extreme'].map(level => (
              <button
                key={level}
                onClick={() => handleSensitivityChange(level)}
                style={{
                  padding: '5px 10px',
                  backgroundColor: sensitivityLevel === level ? '#5D5CDE' : '#f8f9fa',
                  color: sensitivityLevel === level ? 'white' : 'black',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: sensitivityLevel === level ? 'bold' : 'normal'
                }}
              >
                {level === 'low' ? '低靈敏度' : 
                level === 'medium' ? '中等靈敏度' : 
                level === 'high' ? '高靈敏度' : 
                '極高靈敏度'}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#666' }}>
            {sensitivityLevel === 'low' ? '需要非常穩定' : 
             sensitivityLevel === 'medium' ? '一般穩定度' : 
             sensitivityLevel === 'high' ? '允許輕微移動' :
             '對輕微移動極度敏感'}
          </div>
        </div>
      )}
      
      {/* Test count indicator */}
      {testStarted && (
        <div style={{
          backgroundColor: '#f0f9ff',
          borderRadius: '8px',
          padding: '10px',
          textAlign: 'center',
          fontSize: '16px',
          fontWeight: 'bold'
        }}>
          測試進度：{testCount} / {MAX_TESTS}
        </div>
      )}
      
      {/* Error messages */}
      {cameraError && (
        <div style={{
          padding: '10px',
          backgroundColor: '#fee2e2',
          color: '#b91c1c',
          borderRadius: '8px',
          marginBottom: '15px'
        }}>
          <strong>錯誤：</strong> {cameraError}
        </div>
      )}
      
      {/* Main content */}
      <div>
        <div 
          ref={containerRef}
          style={{ 
            position: 'relative',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden',
            background: '#f8f9fa',
            minHeight: '300px'
          }}
        >
          {/* Main webcam */}
          <Webcam
            ref={webcamRef}
            style={{
              width: '100%',
              maxHeight: '60vh',
              objectFit: 'contain'
            }}
            videoConstraints={{
              width: 640,
              height: 480,
              facingMode: "user"
            }}
            audio={false}
            onUserMedia={handleCameraReady}
            onUserMediaError={handleCameraError}
          />
          
          {/* Canvas for motion detection (hidden) */}
          <canvas 
            ref={motionCanvasRef}
            style={{
              position: 'absolute',
              top: '-9999px',
              left: '-9999px',
              width: '320px',
              height: '240px'
            }}
            width="320"
            height="240"
          />
          
          {/* Target */}
          {targetVisible && testStarted && (
            <div 
              onClick={() => handleTargetHit('click')}
              style={{
                position: 'absolute',
                left: `${targetPosition.x}px`,
                top: `${targetPosition.y}px`,
                width: `${targetSize}px`,
                height: `${targetSize}px`,
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 0, 0, 0.8)',
                transform: 'translate(-50%, -50%)',
                boxShadow: testCount === 0 ? '0 0 30px rgba(255, 0, 0, 0.9)' : '0 0 20px rgba(255, 0, 0, 0.8)',
                cursor: 'pointer',
                animation: 'pulse 0.7s infinite',
                zIndex: 10
              }}
            />
          )}
          
          {/* Auto-advance progress indicator */}
          {targetVisible && focusMode && testStarted && (
            <div style={{
              position: 'absolute',
              bottom: '50px',
              left: '10px',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              padding: '8px',
              borderRadius: '4px',
              color: 'white',
              zIndex: 20
            }}>
              <div>穩定中...自動進行</div>
              <div style={{
                width: '100px',
                height: '5px',
                backgroundColor: '#e5e7eb',
                borderRadius: '5px',
                marginTop: '5px'
              }}>
                <div style={{
                  width: `${autoAdvanceProgress}%`,
                  height: '100%',
                  backgroundColor: '#10b981',
                  borderRadius: '5px',
                  transition: 'width 0.05s linear'
                }}></div>
              </div>
            </div>
          )}
          
          {/* Status indicator */}
          <div style={{ 
            position: 'absolute', 
            bottom: '10px', 
            right: '10px',
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
            padding: '5px 10px',
            borderRadius: '4px',
            fontSize: '14px'
          }}>
            {!cameraReady ? '⏳ 等待相機...' : 
             (targetVisible ? (focusMode ? '保持穩定，自動進行' : '保持穩定或點擊紅色目標') : '準備測試')}
          </div>
        </div>
        
        {/* Test stats - when test is in progress */}
        {testStarted && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            gap: '30px', 
            margin: '20px 0',
            padding: '15px',
            borderRadius: '8px',
            backgroundColor: '#f8f9fa'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{fontSize: '14px', color: '#666'}}>測試進度</div>
              <div style={{fontSize: '18px', fontWeight: 'bold'}}>{testCount}/{MAX_TESTS}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{fontSize: '14px', color: '#666'}}>穩定狀態</div>
              <div style={{
                fontSize: '18px', 
                fontWeight: 'bold',
                color: focusMode ? '#22c55e' : '#f59e0b'
              }}>
                {focusMode ? '穩定' : '不穩定'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{fontSize: '14px', color: '#666'}}>上次反應</div>
              <div style={{fontSize: '18px', fontWeight: 'bold'}}>
                {reactionTimes.length > 0 ? `${reactionTimes[reactionTimes.length - 1]}ms` : '-'}
              </div>
            </div>
          </div>
        )}
        
        {/* Begin Test Button */}
        {!testStarted && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
              <button
                onClick={startTest}
                disabled={!cameraReady}
                style={{
                  backgroundColor: '#5D5CDE',
                  color: 'white',
                  border: 'none',
                  padding: '15px 30px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  borderRadius: '8px',
                  cursor: cameraReady ? 'pointer' : 'not-allowed',
                  opacity: cameraReady ? 1 : 0.6,
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.2s'
                }}
              >
                {cameraReady ? '開始測試' : '等待相機...'}
              </button>
            </div>
            
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <h3 style={{ fontSize: '18px' }}>測試說明</h3>
              <p style={{ fontSize: '16px', lineHeight: 1.6 }}>
                此測試評估您的視覺反應能力。當紅色目標出現時，只需看著它並保持穩定。
                系統會自動檢測您的穩定程度，當您成功穩定注視目標時，將自動進入下一階段。
              </p>
              <p style={{ fontSize: '14px', color: '#666' }}>
                上方顯示器會監測您的穩定程度，在穩定狀態下，系統將自動進行測試。您也可以點擊紅色目標作為備選方法。
              </p>
            </div>
          </>
        )}
      </div>
      
      <style jsx="true">{`
        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.2); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  );
}

export default EyeTracking;
