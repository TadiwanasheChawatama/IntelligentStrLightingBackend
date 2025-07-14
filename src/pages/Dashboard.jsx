import PredictionPanel from '../components/PredictionPanel'
import ControlsPanel from '../components/ControlsPanel'
import ExternalDataPanel from '../components/ExternalDataPanel'
import LiveCharts from '../components/LiveCharts'
import LogsPanel from '../components/LogsPanel'
import SensorMonitor from '../components/SensorMonitor'

const Dashboard = () => {
  const handleControlUpdate = (updatedValues) => {
    console.log('Updated control inputs:', updatedValues);
  };

  return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-100 
                    dark:from-gray-900 dark:via-blue-900 dark:to-indigo-900 
                    transition-colors duration-500 p-4">
      <div className="w-full p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 
                         bg-clip-text text-transparent mb-2 text-center">
            Smart Lighting Control Center
          </h1>
          <p className="text-gray-600 text-center dark:text-gray-400 text-lg">
            Intelligent Streetlight Control System with Machine Learning
          </p>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
          {/* Left Column - Primary Controls */}
          <div className="lg:col-span-4 space-y-6">
            <PredictionPanel />
            <SensorMonitor />
          </div>

          {/* Middle Column - Data & Analytics */}
          <div className="lg:col-span-5 space-y-6">
            <LiveCharts />
            <ControlsPanel onUpdate={handleControlUpdate} />
          </div>

          {/* Right Column - External Data & Logs */}
          <div className="lg:col-span-3 space-y-6">
            <ExternalDataPanel />
            <LogsPanel />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Smart Streetlight Control System with Machine Learning || Last updated: {new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

export default Dashboard