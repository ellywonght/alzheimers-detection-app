import React from 'react';

function HandResults({ results, onReset }) {
  // Calculate a performance score from 0-100 based on reaction times
  const calculateScore = (avgTime) => {
    // Lower reaction time is better
    // 200ms or less = 100%, 800ms or more = 0%
    const score = Math.max(0, Math.min(100, 100 - ((avgTime - 200) / 6)));
    return Math.round(score);
  };

  const performanceScore = calculateScore(results.averageTime);

  // Prepare for proportional bars
  const times = results.times || [];
  const maxTime = Math.max(...times, 1);          // avoid div by zero
  const maxBarHeight = 200;                       // px for the slowest response

  return (
    <div className="results-container">
      <h2>反應速度測量結果</h2>
      
      <div className="score-summary">
        <div className="score-circle">
          <span>{results.score}%</span>
        </div>
        <p>手部反應表現</p>
      </div>
      
      <div className="metrics-grid">
        <div className="metric">
          <h3>平均反應時間</h3>
          <div className="metric-value">{results.averageTime}ms</div>
        </div>
        
        <div className="metric">
          <h3>最快反應時間</h3>
          <div className="metric-value">{results.bestTime}ms</div>
        </div>
      </div>
      
      <div className="reaction-times-container">
        {/* moved slightly higher */}
        <h3 style={{ marginBottom: '20px' }}>反應時間記錄 (5次測試)</h3>
        <div
          className="reaction-times-chart"
          style={{ 
            display: 'flex', 
            alignItems: 'flex-end', 
            justifyContent: 'space-between', 
            margin: '20px 0 40px 0'  /* chart moved lower */ 
          }}
        >
          {times.map((time, index) => {
            // proportional height
            const heightPx = (time / maxTime) * maxBarHeight;
            return (
              <div
                key={index}
                className="chart-column"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center'
                }}
              >
                <div 
                  className="reaction-time-bar"
                  style={{
                    position: 'relative',
                    width: '40px',
                    height: `${heightPx}px`,
                    backgroundColor:
                      time < 400 ? '#5D5CDE' :
                      time < 600 ? '#8C8BE6' :
                      '#ff9800',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s'
                  }}
                >
                  <span
                    className="reaction-time-label"
                    style={{
                      position: 'absolute',
                      top: '-20px',
                      width: '100%',
                      textAlign: 'center',
                      fontSize: '12px',
                      color: '#333'
                    }}
                  >
                    {time}ms
                  </span>
                </div>
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: '#6c757d',
                    textAlign: 'center'
                  }}
                >
                  測試 {index + 1}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="analysis-box">
        <h3>MediaPipe Hands 分析</h3>
        <p>{results.analysis}</p>
        <p className="analysis-detail">
          反應時間和手部追踪準確度是重要的運動神經功能指標。早期阿茲海默症可能影響這些功能，表現為反應時間延長和運動協調性下降。
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

export default HandResults;
