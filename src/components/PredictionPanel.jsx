import { useState} from 'react';
import { Activity, Lightbulb, Zap, Play, CheckCircle, XCircle, AlertTriangle} from 'lucide-react';


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


const mockApi = {
  post: async (endpoint, data) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return {
      data: {
        recommended_intensity: Math.floor(Math.random() * 100),
        lights_should_be_on: Math.random() > 0.3,
        confidence: 0.85 + Math.random() * 0.15
      }
    };
  }
};

const PredictionPanel = () => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState(null);


  const makeDecision = (predictionResult) => {
    const intensity = 100 - predictionResult.recommended_intensity; // Invert the intensity value
    const confidence = predictionResult.confidence * 100;
    const shouldBeOn = predictionResult.lights_should_be_on;
    
    let action = 'WAIT';
    let reason = '';
    let priority = 'low';
    let finalStatus = false; 
    
    // CLEAR LOGIC: High ambient light = lights OFF, Low ambient light = lights ON
    
    // MANDATORY RULE: High ambient light (>65%) = lights MUST be OFF
    if (intensity > 65) {
      action = 'TURN_OFF';
      finalStatus = false;
      reason = `HIGH ambient light detected (${intensity.toFixed(1)}%) - lights OFF to save energy`;
      priority = 'high';
    }
    // MANDATORY RULE: Low ambient light (<35%) = lights MUST be ON
    else if (intensity < 35) {
      action = 'TURN_ON';
      finalStatus = true;
      reason = `LOW ambient light detected (${intensity.toFixed(1)}%) - lights ON for visibility`;
      priority = 'high';
    }
    // MODERATE ambient light (35-65%) = use AI recommendation with confidence check
    else {
      if (confidence >= 70) {
        // High confidence: trust AI recommendation
        if (shouldBeOn) {
          action = 'TURN_ON';
          finalStatus = true;
          reason = `Moderate light (${intensity.toFixed(1)}%) - AI recommends ON with ${confidence.toFixed(1)}% confidence`;
        } else {
          action = 'TURN_OFF';
          finalStatus = false;
          reason = `Moderate light (${intensity.toFixed(1)}%) - AI recommends OFF with ${confidence.toFixed(1)}% confidence`;
        }
        priority = 'medium';
      } else {
        // Low confidence: use simple threshold-based decision
        if (intensity > 50) {
          action = 'TURN_OFF';
          finalStatus = false;
          reason = `Moderate-high light (${intensity.toFixed(1)}%) - lights OFF (low AI confidence: ${confidence.toFixed(1)}%)`;
        } else {
          action = 'TURN_ON';
          finalStatus = true;
          reason = `Moderate-low light (${intensity.toFixed(1)}%) - lights ON (low AI confidence: ${confidence.toFixed(1)}%)`;
        }
        priority = 'medium';
      }
    }
    
    return { action, reason, priority, intensity, confidence, finalStatus };
  };

const handlePredict = async () => {
  setLoading(true);
  try {
    const response = await fetch('http://127.0.0.1:8000/api/predict/');
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Prediction failed');
    }

    setResult(result);
    console.log('prediction from ai: ', result)
    // Make decision based on the result
    const newDecision = makeDecision(result);
    setDecision(newDecision);
    
    console.log('Prediction:', result);
    console.log('Decision:', newDecision);
  } catch (error) {
    console.error('Prediction failed:', error);
    // For demo purposes, use mock data on error
    const mockResult = {
      recommended_intensity: Math.floor(Math.random() * 100),
      lights_should_be_on: Math.random() > 0.3,
      confidence: 0.85 + Math.random() * 0.15
    };
    setResult(mockResult);
    const newDecision = makeDecision(mockResult);
    setDecision(newDecision);
  } finally {
    setLoading(false);
  }
};

  const getDecisionIcon = (action) => {
    switch (action) {
      case 'TURN_ON':
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'TURN_OFF':
        return <XCircle className="w-6 h-6 text-red-600" />;
      default:
        return <AlertTriangle className="w-6 h-6 text-yellow-600" />;
    }
  };

  const getDecisionColor = (action, priority) => {
    switch (action) {
      case 'TURN_ON':
        return priority === 'high' 
          ? 'from-green-500 to-emerald-600' 
          : 'from-green-400 to-emerald-500';
      case 'TURN_OFF':
        return 'from-red-400 to-rose-500';
      default:
        return 'from-yellow-400 to-amber-500';
    }
  };

  const getPriorityBadge = (priority) => {
    const colors = {
      high: 'bg-red-100 text-red-800 border-red-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      low: 'bg-gray-100 text-gray-800 border-gray-200'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${colors[priority]}`}>
        {priority.toUpperCase()} PRIORITY
      </span>
    );
  };

  return (
    <Card className="p-6" gradient>
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
          <Activity className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
          AI Prediction Engine
        </h2>
      </div>

      <button
        onClick={handlePredict}
        disabled={loading}
        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-xl
                   hover:from-purple-700 hover:to-pink-700 transition-all duration-200
                   disabled:opacity-50 disabled:cursor-not-allowed font-semibold
                   transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl"
      >
        {loading ? (
          <div className="flex items-center justify-center space-x-2">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Analyzing...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-2">
            <Play className="w-5 h-5" />
            <span>Run Prediction</span>
          </div>
        )}
      </button>

      {result && (
        <div className="mt-6 space-y-6 animate-in slide-in-from-bottom duration-500">
          {/* Prediction Results */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 
                            p-4 rounded-xl border border-blue-200 dark:border-blue-800">
              <div className="flex items-center space-x-2 mb-2">
                <Lightbulb className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-blue-900 dark:text-blue-100">Ambient Light Level</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{(100 - result.recommended_intensity).toFixed(1)}%</p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                {(100 - result.recommended_intensity) > 65 ? '☀️ Bright (Natural Light)' : 
                 (100 - result.recommended_intensity) < 35 ? '🌙 Dark (Need Lights)' : '🌤️ Moderate Light'}
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 
                            p-4 rounded-xl border border-green-200 dark:border-green-800">
              <div className="flex items-center space-x-2 mb-2">
                <Zap className="w-5 h-5 text-green-600" />
                <span className="font-semibold text-green-900 dark:text-green-100">AI Recommendation</span>
              </div>
              <p className="text-lg font-bold text-green-600">
                {result.lights_should_be_on ? 'ON' : 'OFF'}
              </p>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                Confidence: {(result.confidence * 100).toFixed(1)}%
              </p>
            </div>
          </div>
          
          {/* Final Status  */}
          {decision && (
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 
                            p-4 rounded-xl border border-indigo-200 dark:border-indigo-800">
              <div className="flex items-center space-x-2 mb-2">
                <Zap className="w-5 h-5 text-indigo-600" />
                <span className="font-semibold text-indigo-900 dark:text-indigo-100">Final Status</span>
              </div>
              <div className="flex items-center space-x-2">
                <p className={`text-2xl font-bold ${decision.finalStatus ? 'text-green-600' : 'text-red-600'}`}>
                  {decision.finalStatus ? 'ON' : 'OFF'}
                </p>
                {decision.finalStatus ? 
                  <CheckCircle className="w-6 h-6 text-green-600" /> : 
                  <XCircle className="w-6 h-6 text-red-600" />
                }
              </div>
            </div>
          )}
          
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 
                          p-4 rounded-xl border border-orange-200 dark:border-orange-800">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-orange-900 dark:text-orange-100">Confidence Score</span>
              <span className="text-xl font-bold text-orange-600">
                {(result.confidence * 100).toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 bg-orange-200 dark:bg-orange-800 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-orange-500 to-amber-500 h-2 rounded-full transition-all duration-1000"
                style={{ width: `${result.confidence * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Decision Section */}
          {decision && (
            <div className="bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-900/50 dark:to-gray-900/50 
                            p-6 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  {getDecisionIcon(decision.action)}
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    Decision: {decision.action.replace('_', ' ')}
                  </h3>
                </div>
                {getPriorityBadge(decision.priority)}
              </div>
              
              <div className={`bg-gradient-to-r ${getDecisionColor(decision.action, decision.priority)} 
                              text-white p-4 rounded-lg mb-4`}>
                <p className="font-semibold text-lg">
                  {decision.action === 'TURN_ON' ? '💡 Turn Lights ON' : 
                   decision.action === 'TURN_OFF' ? '🔌 Turn Lights OFF' : 
                   '⏳ Wait for Better Data'}
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg">
                  <span className="text-slate-600 dark:text-slate-400 text-sm">Reasoning:</span>
                  <p className="text-slate-900 dark:text-slate-100 font-medium mt-1">
                    {decision.reason}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-600">
                  <div className="text-center">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Ambient Light Level</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {decision.intensity.toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Confidence</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {decision.confidence.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default PredictionPanel