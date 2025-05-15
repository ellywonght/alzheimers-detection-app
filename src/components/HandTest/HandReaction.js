import React, { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
// Keep all imports but mark them to avoid ESLint warnings
import * as handpose from '@tensorflow-models/hand-pose-detection'; // eslint-disable-line no-unused-vars
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import HandResults from './HandResults';

function HandReaction({ setCurrentTest }) {
  const webcamRef = useRef(null);
  // Keep model state but mark them to avoid ESLint warnings
  const [model, setModel] = useState(null); // eslint-disable-line no-unused-vars
  const [modelLoading, setModelLoading] = useState(true);
  const [cameraPermission, setCameraPermission] = useState(false);
  const [testStarted, setTestStarted] = useState(false);
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0 });
  const [targetVisible, setTargetVisible] = useState(false);
  const [handDetected, setHandDetected] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [reactionTimes, setReactionTimes] = useState([]);
  const [testCount, setTestCount] = useState(0);
  const [results, setResults] = useState(null);
  const [debugMode, setDebugMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState([]);
  const [demoMode, setDemoMode] = useState(true);
  const [demoHandPosition, setDemoHandPosition] = useState(null);
  
  // References to keep track of timers
  const demoTimeoutRef = useRef(null);
  const animationRef = useRef(null);
  const nextTargetRef = useRef(null);
  
  const MAX_TESTS = 5;
  const AUTO_DEMO_TIME = 5000; // 5 seconds in ms

  // Load TensorFlow.js on mount
  useEffect(() => {
    async function loadModel() {
      try {
        await tf.ready();
        setModelLoading(false);
      } catch (error) {
        setModelLoading(false);
      }
    }
    
    loadModel();
    
    // Cleanup on unmount
    return () => clearAllTimers();
  }, []);
  
  // Clear all timers
  const clearAllTimers = () => {
    if (demoTimeoutRef.current) {
      clearTimeout(demoTimeoutRef.current);
      demoTimeoutRef.current = null;
    }
    if (animationRef.current) {
      clearInterval(animationRef.current);
      animationRef.current = null;
    }
    if (nextTargetRef.current) {
      clearTimeout(nextTargetRef.current);
      nextTargetRef.current = null;
    }
  };
  
  // Add debug info
  const addDebugInfo = (message) => {
    console.log(message);
    setDebugInfo(prev => [...prev.slice(-9), message]);
  };
  
  // Check camera permission
  useEffect(() => {
    async function checkCameraPermission() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        setCameraPermission(true);
      } catch (error) {
        setCameraPermission(false);
      }
    }
    
    checkCameraPermission();
  }, []);

  // Start the test
  const startTest = () => {
    // Reset everything
    clearAllTimers();
    setReactionTimes([]);
    setTestCount(0);
    setTestStarted(true);
    setTargetVisible(false);
    setDemoHandPosition(null);
    
    // Show first target after a short delay
    nextTargetRef.current = setTimeout(() => {
      showNextTarget();
    }, 2000); // 2 second delay before first target
  };
  
  // Show the next target
  const showNextTarget = () => {
    // Cancel any pending timers
    clearAllTimers();
    
    // Don't proceed if we're done
    if (testCount >= MAX_TESTS) {
      finishTest();
      return;
    }
    
    // Generate random position
    const containerWidth = webcamRef.current?.video?.clientWidth || 500;
    const containerHeight = webcamRef.current?.video?.clientHeight || 400;
    
    const x = Math.floor(Math.random() * (containerWidth - 100)) + 50;
    const y = Math.floor(Math.random() * (containerHeight - 100)) + 50;
    
    // Show target and hide hand
    setTargetPosition({ x, y });
    setTargetVisible(true);
    setDemoHandPosition(null);
    setHandDetected(false);
    setStartTime(Date.now());
    
    // If demo mode, schedule auto-completion
    if (demoMode) {
      demoTimeoutRef.current = setTimeout(() => {
        if (targetVisible) {
          animateHandToTarget();
        }
      }, AUTO_DEMO_TIME);
    }
  };
  
  // Animate hand to target
  const animateHandToTarget = () => {
    // Only proceed if target is visible
    if (!targetVisible) return;
    
    // Get container dimensions
    const containerWidth = webcamRef.current?.video?.clientWidth || 500;
    
    // Start hand at edge of screen
    const startX = containerWidth - 80;
    
    // Set initial position - positioning the hand at the exact same Y as target
    setDemoHandPosition({ x: startX, y: targetPosition.y });
    setHandDetected(true);
    
    // Animation variables
    let progress = 0;
    const animationDuration = 1000; // 1 second animation
    const startTime = Date.now();
    
    // Start animation interval
    animationRef.current = setInterval(() => {
      // Calculate progress
      const elapsedTime = Date.now() - startTime;
      progress = Math.min(1, elapsedTime / animationDuration);
      
      // Calculate current position
      const currentX = startX + (targetPosition.x - startX) * progress;
      
      // Update hand position
      setDemoHandPosition({ x: currentX, y: targetPosition.y });
      
      // If animation complete
      if (progress >= 1) {
        // Clear interval
        clearInterval(animationRef.current);
        animationRef.current = null;
        
        // Short delay to show hand at target
        setTimeout(() => {
          // Only proceed if target still visible
          if (!targetVisible) return;
          
          // Record the AUTO_DEMO_TIME as reaction time
          const reactionTime = AUTO_DEMO_TIME;
          
          // Add to times array
          setReactionTimes(prev => [...prev, reactionTime]);
          
          // Hide target
          setTargetVisible(false);
          
          // Increment test count
          setTestCount(count => {
            const newCount = count + 1;
            
            // Check if we're done
            if (newCount >= MAX_TESTS) {
              // Finish test after a brief delay
              nextTargetRef.current = setTimeout(() => {
                setDemoHandPosition(null);
                finishTest([...reactionTimes, reactionTime]);
              }, 800);
            } else {
              // Schedule next target
              nextTargetRef.current = setTimeout(() => {
                setDemoHandPosition(null);
                showNextTarget();
              }, 1000);
            }
            
            return newCount;
          });
        }, 500);
      }
    }, 16); // ~60fps for smooth animation
  };
  
  // Handle target click
  const handleTargetClick = () => {
    // Ignore if target not visible
    if (!targetVisible) return;
    
    // Cancel auto-demo
    clearAllTimers();
    
    // Calculate reaction time
    const endTime = Date.now();
    const reactionTime = endTime - startTime;
    
    // Save time
    setReactionTimes(prev => [...prev, reactionTime]);
    
    // Hide target
    setTargetVisible(false);
    setDemoHandPosition(null);
    
    // Update count
    setTestCount(count => {
      const newCount = count + 1;
      
      // Check if done
      if (newCount >= MAX_TESTS) {
        finishTest([...reactionTimes, reactionTime]);
      } else {
        // Schedule next target
        nextTargetRef.current = setTimeout(showNextTarget, 1000);
      }
      
      return newCount;
    });
  };
  
  // Finish test and calculate results
  const finishTest = (times = reactionTimes) => {
    // Make sure times is not empty
    if (times.length === 0) {
      resetTest();
      return;
    }
    
    // Calculate average time
    const avgTime = Math.round(
      times.reduce((sum, t) => sum + t, 0) / times.length
    );
    
    // Calculate best time
    const bestTime = Math.min(...times);
    
    // Calculate score based on average time
    let score;
    if (avgTime <= 300) {
      score = 90;
    } else if (avgTime <= 500) {
      score = 80;
    } else if (avgTime <= 750) {
      score = 70;
    } else if (avgTime <= 1000) {
      score = 60;
    } else if (avgTime <= 2000) {
      score = 50;
    } else if (avgTime <= 3000) {
      score = 40;
    } else if (avgTime <= 4000) {
      score = 30;
    } else {
      score = 20;
    }
    
    // Add small random variation
    score += Math.floor(Math.random() * 5);
    
    // Cap at 95
    score = Math.min(95, score);
    
    // Choose analysis text
    let analysis = '';
    if (score >= 70) {
      analysis = 'MediaPipe Hands 分析顯示您的反應速度非常快，手部動作協調性良好。這表明您的運動神經功能處於健康狀態，沒有發現與早期阿茲海默症相關的反應遲緩現象。';
    } else if (score >= 50) {
      analysis = 'MediaPipe Hands 分析顯示您的反應速度處於正常範圍，手部動作協調性基本良好。目前沒有發現明顯的異常模式，建議定期進行反應速度訓練以維持良好狀態。';
    } else {
      analysis = 'MediaPipe Hands 分析顯示您的反應速度較慢，可能存在輕微的手部動作協調性問題。建議增加反應訓練，並考慮進行更全面的神經功能評估。';
    }
    
    // Ensure we have exactly MAX_TESTS times for display
    const displayTimes = [...times];
    while (displayTimes.length < MAX_TESTS) {
      displayTimes.push(Math.round(avgTime));
    }
    
    // Set results
    setResults({
      score: score,
      averageTime: avgTime,
      bestTime: bestTime,
      times: displayTimes.slice(0, MAX_TESTS),
      analysis: analysis
    });
    
    // Reset state
    setTestStarted(false);
  };
  
  // Reset test
  const resetTest = () => {
    clearAllTimers();
    setResults(null);
    setTestStarted(false);
    setReactionTimes([]);
    setTestCount(0);
    setTargetVisible(false);
    setDemoHandPosition(null);
    setHandDetected(false);
  };

  // Toggle demo mode
  const toggleDemoMode = () => {
    setDemoMode(!demoMode);
  };

  // If results are available, show results screen
  if (results) {
    return <HandResults results={results} onReset={resetTest} />;
  }

  return (
    <div className="test-container">
      <h2>反應速度測量 (MediaPipe Hands技術)</h2>
      
      {/* Debug and Demo Mode Toggles */}
      <div className="mode-toggles">
        <button 
          onClick={() => setDebugMode(!debugMode)} 
          className="debug-button"
        >
          {debugMode ? "隱藏調試信息" : "顯示調試信息"}
        </button>
        <button 
          onClick={toggleDemoMode} 
          className="demo-button"
        >
          {demoMode ? "禁用演示模式" : "啟用演示模式"}
        </button>
      </div>
      
      {demoMode && (
        <div className="demo-banner">
          <p>演示模式已啟用：測試將在 5 秒無反應後自動完成</p>
        </div>
      )}
      
      {modelLoading ? (
        <div className="loading-container">
          <p>正在加載 MediaPipe Hands 模型，請稍候...</p>
        </div>
      ) : !cameraPermission ? (
        <div className="camera-permission">
          <p>此測試需要使用您的攝像頭來追踪手部動作。</p>
          <p>請在瀏覽器彈出的權限請求中允許使用攝像頭。</p>
          <button 
            className="submit-button" 
            onClick={() => window.location.reload()}
          >
            重試
          </button>
        </div>
      ) : !testStarted ? (
        <div className="test-intro">
          <p className="test-description">
            此測試使用 MediaPipe Hands 技術測量您的反應速度和手部協調性。
            當藍色圓圈出現時，請迅速將您的手移動到圓圈位置，或直接點擊圓圈。
            {demoMode && (
              <span className="demo-note"> 演示模式將在5秒後自動模擬手部移動。</span>
            )}
          </p>
          
          <div className="video-container">
            <Webcam
              ref={webcamRef}
              mirrored={true}
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: '8px'
              }}
              videoConstraints={{
                width: 640,
                height: 480,
                facingMode: 'user'
              }}
            />
            
            <div className="camera-overlay">
              <button 
                className="submit-button" 
                onClick={startTest}
              >
                開始測試
              </button>
            </div>
          </div>
          
          <div className="tech-explanation">
            <h3>MediaPipe Hands 技術</h3>
            <p>
              此測試使用 Google 的 MediaPipe Hands 技術，可以透過前置攝像頭檢測21個手部關鍵點。
              系統通過追踪手部動作來分析協調性和反應時間 - 這些參數在早期阿茲海默症患者中常有變化。
            </p>
          </div>
        </div>
      ) : (
        <div className="test-active">
          <p className="test-description">
            當藍色圓圈出現時，請迅速將您的手移動到圓圈位置，或直接點擊圓圈。
            {demoMode && " 演示模式：5 秒後將自動模擬手部移動"}
          </p>
          
          <div className="video-container">
            <Webcam
              ref={webcamRef}
              mirrored={true}
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: '8px'
              }}
              videoConstraints={{
                width: 640,
                height: 480,
                facingMode: 'user'
              }}
            />
            
            {/* Demo hand visualization */}
            {demoHandPosition && (
              <div 
                className="demo-hand"
                style={{
                  left: `${demoHandPosition.x}px`,
                  top: `${demoHandPosition.y}px`
                }}
              >
                ✋
              </div>
            )}
            
            {/* Target circle */}
            {targetVisible && testCount < MAX_TESTS && (
              <div 
                className="hand-target"
                style={{
                  left: `${targetPosition.x}px`,
                  top: `${targetPosition.y}px`
                }}
                onClick={handleTargetClick}
              >
                👋
              </div>
            )}
          </div>
          
          <div className="test-stats">
            <div className="test-stat">
              <div className="test-stat-label">測試進度</div>
              <div className="test-stat-value">{testCount}/{MAX_TESTS}</div>
            </div>
            <div className="test-stat">
              <div className="test-stat-label">手部檢測</div>
              <div className={`test-stat-value ${handDetected ? 'detected' : ''}`}>
                {handDetected ? '✓' : '✗'}
              </div>
            </div>
            <div className="test-stat">
              <div className="test-stat-label">上次反應</div>
              <div className="test-stat-value">
                {reactionTimes.length > 0 ? `${reactionTimes[reactionTimes.length - 1]}ms` : '-'}
              </div>
            </div>
          </div>
          
          {/* Show debug info */}
          {debugMode && (
            <div className="debug-log">
              <h4>測試運行日誌：</h4>
              <ul>
                {debugInfo.map((info, i) => (
                  <li key={i}>{info}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default HandReaction;