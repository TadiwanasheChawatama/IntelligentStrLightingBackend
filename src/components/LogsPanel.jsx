import { useState, useEffect } from 'react';
import { Activity, Zap, Settings, FileText, Wifi, AlertCircle, CheckCircle } from 'lucide-react';


const Card = ({ children, className = "", gradient = false }) => (
  <div className={`
    bg-white dark:bg-gray-900 backdrop-blur-sm
    ${gradient ? 'bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800' : ''}
    border border-gray-200 dark:border-gray-700
    rounded-2xl shadow-lg hover:shadow-xl
    transition-all duration-300 ease-in-out
    hover:scale-[1.02] hover:-translate-y-1
    ${className}
  `}>
    {children}
  </div>
);

const LogsPanel = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);


  // Fetch logs from ThingSpeak
  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('http://127.0.0.1:8000/api/sensor-logs/live/?results=15');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'success') {
  
        const transformedLogs = data.live_logs.map((entry, index) => ({
          id: entry.entry_id || Date.now() + index,
          time: new Date(entry.timestamp).toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          action: generateLogMessage(entry),
          type: determineLogType(entry),
          rawData: entry 
        }));
        
        // Sort logs by timestamp (most recent first)
        const sortedLogs = transformedLogs.sort((a, b) => 
          new Date(b.rawData.timestamp) - new Date(a.rawData.timestamp)
        );
        
        setLogs(sortedLogs);
        setLastUpdated(data.last_updated);
      } else {
        throw new Error(data.error || 'Failed to fetch logs');
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // human-readable log messages from sensor data
  const generateLogMessage = (entry) => {
    const lightLevel = entry.ambient_light_sensor;
    const motionDetected = entry.motion_sensor === 1;
    
    if (motionDetected && lightLevel > 100) {
      return `Motion detected - High ambient light (${lightLevel.toFixed(1)} lux)`;
    } else if (motionDetected && lightLevel <= 100) {
      return `Motion detected - Low light conditions (${lightLevel.toFixed(1)} lux)`;
    } else if (lightLevel > 200) {
      return `Bright environment detected (${lightLevel.toFixed(1)} lux)`;
    } else if (lightLevel < 50) {
      return `Dark environment detected (${lightLevel.toFixed(1)} lux)`;
    } else {
      return `Ambient light: ${lightLevel.toFixed(1)} lux, Motion: ${motionDetected ? 'Yes' : 'No'}`;
    }
  };

  // Determine log type based on sensor readings
  const determineLogType = (entry) => {
    const motionDetected = entry.motion_sensor === 1;
    const lightLevel = entry.ambient_light_sensor;
    
    if (motionDetected) {
      return 'sensor';
    } else if (lightLevel > 150) {
      return 'system';
    } else if (lightLevel < 50) {
      return 'power';
    } else {
      return 'prediction';
    }
  };

  // Initial fetch and set up polling
  useEffect(() => {
    fetchLogs();
    
    // Poll every 30 seconds for live updates
    const interval = setInterval(fetchLogs, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const getLogColor = (type) => {
    switch (type) {
      case 'prediction': return 'purple';
      case 'system': return 'blue';
      case 'sensor': return 'green';
      case 'power': return 'orange';
      default: return 'gray';
    }
  };

  const getLogIcon = (type) => {
    switch (type) {
      case 'prediction': return Activity;
      case 'system': return Settings;
      case 'sensor': return Wifi;
      case 'power': return Zap;
      default: return FileText;
    }
  };

  // Loading state
  if (loading && logs.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-gradient-to-br from-gray-500 to-slate-500 rounded-xl">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Activity Logs</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading logs...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-gray-500 to-slate-500 rounded-xl">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Activity Logs</h2>
        </div>
        
        {/* Status indicators */}
        <div className="flex items-center space-x-2">
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          )}
          {error ? (
            <AlertCircle className="w-5 h-5 text-red-500" title={error} />
          ) : (
            <CheckCircle className="w-5 h-5 text-green-500" title="Connected" />
          )}
          <button
            onClick={fetchLogs}
            className="text-sm px-3 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 
                       dark:bg-blue-900/30 dark:hover:bg-blue-900/50 
                       text-blue-600 dark:text-blue-400 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Last updated info */}
      {lastUpdated && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">
            Error: {error}
          </p>
        </div>
      )}

      {/* Logs list */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No logs available
          </div>
        ) : (
          logs.map((log) => {
            const Icon = getLogIcon(log.type);
            const color = getLogColor(log.type);
            
            return (
              <div 
                key={log.id}
                className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700
                           hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-200
                           animate-in slide-in-from-top duration-300"
              >
                <div className={`p-2 rounded-lg bg-${color}-100 dark:bg-${color}-900/30 flex-shrink-0`}>
                  <Icon className={`w-4 h-4 text-${color}-600 dark:text-${color}-400`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {log.action}
                    </p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
                      {log.time}
                    </span>
                  </div>
                  <p className={`text-xs text-${color}-600 dark:text-${color}-400 capitalize`}>
                    {log.type}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

export default LogsPanel;
