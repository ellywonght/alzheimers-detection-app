import React from 'react';

function LanguageResults({ results, onReset }) {
  return (
    <div className="results-container">
      <h2>語言能力分析結果</h2>
      
      <div className="score-summary">
        <div className="score-circle">
          <span>{results.overallScore}%</span>
        </div>
        <p>整體認知語言功能</p>
      </div>
      
      <div className="metrics-grid">
        <div className="metric">
          <h3>語義理解</h3>
          <div className="metric-bar">
            <div 
              className="metric-fill" 
              style={{width: `${results.semanticUnderstanding}%`}}
            ></div>
          </div>
          <span>{results.semanticUnderstanding}%</span>
        </div>
        
        <div className="metric">
          <h3>詞彙檢索</h3>
          <div className="metric-bar">
            <div 
              className="metric-fill" 
              style={{width: `${results.wordRetrieval}%`}}
            ></div>
          </div>
          <span>{results.wordRetrieval}%</span>
        </div>
      </div>
      
      <div className="analysis-box">
        <h3>DistilBERT 分析</h3>
        <p>{results.analysis}</p>
      </div>
      
      <button 
        className="submit-button" 
        onClick={onReset}
      >
        返回測試
      </button>
    </div>
  );
}

export default LanguageResults;