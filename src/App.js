import React, { useState, useEffect } from 'react';
import './App.css';
import Home from './components/Home';
import LanguageAnalysis from './components/LanguageTest/LanguageAnalysis';
import HandReaction from './components/HandTest/HandReaction';
import EyeTracking from './components/EyeTest/EyeTracking';
import RealEyeTracking from './components/EyeTest/RealEyeTracking';
import PupilTest from './components/PupilTest/PupilTest';

function App() {
  const [currentTest, setCurrentTest] = useState('home');

  // Clean up WebGazer when switching away from eye tests
  useEffect(() => {
    if (currentTest !== 'eye' && currentTest !== 'realEye') {
      if (window.webgazer) {
        console.log("[DEBUG] Clearing WebGazer instance (no .end() call)");
        // we skip calling .end() because it can throw synchronously
        window.webgazer = null;
        console.log("[DEBUG] window.webgazer cleared.");
      }
    }
  }, [currentTest]);

  const handleSetCurrentTest = (testName) => {
    setCurrentTest(testName);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>腦友記 Cognitia</h1>
        <p>阿茲海默症早期檢測 AI 系統</p>
        {currentTest !== 'home' && (
          <button 
            onClick={() => handleSetCurrentTest('home')} 
            className="back-button"
          >
            返回主頁
          </button>
        )}
      </header>
      <main>
        {currentTest === 'home' && <Home setCurrentTest={handleSetCurrentTest} />}
        {currentTest === 'language' && <LanguageAnalysis setCurrentTest={handleSetCurrentTest} />}
        {currentTest === 'hand' && <HandReaction setCurrentTest={handleSetCurrentTest} />}
        {currentTest === 'eye' && <EyeTracking setCurrentTest={handleSetCurrentTest} />}
        {currentTest === 'realEye' && <RealEyeTracking setCurrentTest={handleSetCurrentTest} />}
        {currentTest === 'pupil' && <PupilTest setCurrentTest={handleSetCurrentTest} />}
      </main>
      <footer className="App-footer">
        <p>© 2025 腦友記 Cognitia | 使用實際 AI 技術進行早期認知健康檢測</p>
      </footer>
    </div>
  );
}

export default App;
