// src/components/EyeTest/EyeResults.js
import React from 'react';

function EyeResults({ results, onReset }) {
  return (
    <div className="results-container">
      <h2>視覺追蹤測試結果</h2>
      
      <div className="score-summary">
        <div className="score-circle">
          <span>{results.score}%</span>
        </div>
        <p>眼球運動表現</p>
      </div>
      
      <div className="metrics-grid">
        <div className="metric">
          <h3>平均反應時間</h3>
          <div className="metric-value">{results.averageTime}ms</div>
        </div>
        
        <div className="metric">
          <h3>追蹤準確度</h3>
          <div className="metric-value">{results.accuracy}%</div>
        </div>
      </div>
      
      <div className="analysis-box">
        <h3>LSTM+CNN 分析</h3>
        <p>{results.analysis}</p>
        <p className="analysis-detail">
          眼球運動和視覺追蹤能力是重要的神經功能指標。早期認知障礙可能表現為視覺追蹤速度延遲和準確度下降。
        </p>
      </div>
      
      <button 
        className="submit-button" 
        onClick={onReset}
      >
        再試一次
      </button>
    </div>
  );
}

export default EyeResults;