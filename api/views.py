import pandas as pd
import numpy as np
from datetime import datetime 
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from .ml_model import StreetlightMLSystem , create_features
import requests
from django.views.decorators.http import require_http_methods
from django.utils import timezone
import random
from django.conf import settings
import logging



# Global variable to hold the trained model system
_model_system = None
VISUAL_CROSSING_API_KEY = settings.VISUAL_CROSSING_API_KEY
OPENWEATHER_API_KEY = settings.OPENWEATHER_API_KEY 


def get_trained_model_system():
    """
    Loads and returns the trained StreetlightMLSystem instance.
    Trains it if it hasn't been trained yet.
    """
    global _model_system
    if _model_system is None:
        print("Loading and training ML system for the first time...")
        try:
            _model_system = StreetlightMLSystem()
            df_raw = pd.read_csv("./harareweather2.csv")
            df = create_features(df_raw) 
            _model_system.train_models(df)
            print("ML system loaded and trained successfully.")
        except FileNotFoundError:
            print("Error: 'harareweather.csv' file not found! Make sure it's in the 'api' directory.")
           
            raise 
        except Exception as e:
            print(f"Error training ML system: {e}")
            raise

    return _model_system


@csrf_exempt
def predict_light(request):
    if request.method == 'GET':
        try:
            # Initialize system with API keys
            model_system = StreetlightMLSystem(
                visual_crossing_api_key=VISUAL_CROSSING_API_KEY,
                openweather_api_key=OPENWEATHER_API_KEY
            )
            
            # Train the model if not already trained
            if not model_system.is_trained:
                model_system = get_trained_model_system()

            # Fetch REAL external data from APIs
            print("Fetching real-time data from APIs...")
            external_data = model_system.get_external_api_data()
            sensor_data = model_system.simulate_iot_sensor_data()

            # Use real weather data for prediction features
            current_weather = external_data['current_weather']
            
            # Calculate proper composite features
            tempmax = current_weather['temperature'] + 5
            tempmin = current_weather['temperature'] - 5
            temp = current_weather['temperature']
            humidity = current_weather['humidity']
            sealevelpressure = 1013.25
            cloudcover = current_weather['cloudcover']
            visibility = current_weather['visibility']
            solarradiation = 200  # You might want to get this from API or estimate based on time
            windspeed = current_weather['wind_speed']
            precipprob = 30  # Default or get from API
            
            # Time features
            now = datetime.now()
            hour = now.hour
            day_of_year = now.timetuple().tm_yday
            month = now.month
            is_weekend = 1 if now.weekday() >= 5 else 0
            daylight_duration = 12  # Could be calculated more accurately
            
            # Calculate composite features properly
            # Natural light index (similar to training data calculation)
            natural_light_index = (
                solarradiation * (100 - cloudcover) / 100 * 
                visibility / max(visibility, 1)  # Using current visibility as reference
            )
            
            # Weather severity (similar to training data calculation)
            weather_severity = (
                windspeed / max(windspeed, 1) * 0.3 +  # Normalize by current windspeed
                precipprob / 100 * 0.4 +
                cloudcover / 100 * 0.3
            )
            
            # Create feature array in the EXACT order expected by the model
            weather_features = [
                tempmax,            # 0: tempmax
                tempmin,            # 1: tempmin  
                temp,               # 2: temp
                humidity,           # 3: humidity
                sealevelpressure,   # 4: sealevelpressure
                cloudcover,         # 5: cloudcover
                visibility,         # 6: visibility
                solarradiation,     # 7: solarradiation
                windspeed,          # 8: windspeed
                precipprob,         # 9: precipprob
                hour,               # 10: hour
                day_of_year,        # 11: day_of_year
                month,              # 12: month
                is_weekend,         # 13: is_weekend
                daylight_duration,  # 14: daylight_duration
                natural_light_index, # 15: natural_light_index
                weather_severity    # 16: weather_severity
            ]

            # Make prediction with properly formatted features
            prediction = model_system.make_prediction(
                weather_features,
                external_data=external_data,
                sensor_data=sensor_data
            )

            # Convert NumPy types to Python native types
            def convert_numpy_types(obj):
                if isinstance(obj, dict):
                    return {key: convert_numpy_types(value) for key, value in obj.items()}
                elif isinstance(obj, (np.int_, np.intc, np.intp, np.int8, np.int16, np.int32, np.int64,
                                    np.uint8, np.uint16, np.uint32, np.uint64)):
                    return int(obj)
                elif isinstance(obj, (np.float64, np.float16, np.float32, np.float64)):
                    return float(obj)
                elif isinstance(obj, np.bool_):
                    return bool(obj)
                elif isinstance(obj, np.ndarray):
                    return obj.tolist()
                else:
                    return obj

            safe_result = convert_numpy_types(prediction)
            
            # Add debugging info
            safe_result['debug_info'] = {
                'input_features': {
                    'tempmax': tempmax,
                    'tempmin': tempmin,
                    'temp': temp,
                    'humidity': humidity,
                    'cloudcover': cloudcover,
                    'visibility': visibility,
                    'windspeed': windspeed,
                    'hour': hour,
                    'natural_light_index': natural_light_index,
                    'weather_severity': weather_severity
                },
                'data_sources': {
                    'weather_api': 'Visual Crossing',
                    'current_conditions': current_weather,
                    'location': 'Harare, Zimbabwe'
                },
                'timestamp': datetime.now().isoformat()
            }
            
            return JsonResponse(safe_result)

        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse({'error': 'Only GET requests are allowed'}, status=405)



@csrf_exempt
@require_http_methods(["GET"])
def get_sensor_data_from_thingspeak(request):
    myChannelID = settings.THINGSPEAK_CHANNEL_ID
    myWriteAPIKey = settings.THINGSPEAK_WRITE_API_KEY
    myReadAPIKey = settings.THINGSPEAK_READ_API_KEY
    
    url = f"https://api.thingspeak.com/channels/{myChannelID}/feeds.json?results=1&api_key={myReadAPIKey}"
    
    try:
        print(f"Fetching data from: {url}")
        response = requests.get(url, timeout=10)
        response.raise_for_status() 
        
        json_data = response.json()
        print(f"ThingSpeak response: {json_data}")
        
        if 'feeds' not in json_data or not json_data['feeds']:
            return JsonResponse({'error': 'No data available from ThingSpeak'}, status=404)
        
        data = json_data['feeds'][0]
        
        # Validate that required fields exist
        if 'field1' not in data or 'field2' not in data:
            return JsonResponse({'error': 'Missing required sensor data fields'}, status=400)
        
        # Handle None values
        ambient_light = data['field1']
        motion_sensor = data['field2']
        
        if ambient_light is None:
            ambient_light = 0
        if motion_sensor is None:
            motion_sensor = 0
            
        return JsonResponse({
            'ambient_light_sensor': float(ambient_light),
            'motion_sensor': int(motion_sensor),
            'timestamp': data.get('created_at', ''),
            'status': 'success'
        })
        
    except requests.exceptions.Timeout:
        print("Request to ThingSpeak timed out")
        return JsonResponse({'error': 'Request to ThingSpeak timed out'}, status=500)
    except requests.exceptions.ConnectionError:
        print("Connection error to ThingSpeak")
        return JsonResponse({'error': 'Unable to connect to ThingSpeak'}, status=500)
    except requests.exceptions.HTTPError as e:
        print(f"HTTP error: {e}")
        return JsonResponse({'error': f'ThingSpeak API error: {e}'}, status=500)
    except KeyError as e:
        print(f"KeyError: {e}")
        return JsonResponse({'error': f'Invalid response format from ThingSpeak: {e}'}, status=500)
    except ValueError as e:
        print(f"ValueError: {e}")
        return JsonResponse({'error': f'Invalid data format: {e}'}, status=500)
    except Exception as e:
        print(f"Unexpected error: {e}")
        return JsonResponse({'error': f'Unexpected error: {str(e)}'}, status=500)
    
    
    
@csrf_exempt
@require_http_methods(["GET"])
def get_live_sensor_logs_from_thingspeak(request):
    myChannelID = settings.THINGSPEAK_CHANNEL_ID
    myWriteAPIKey = settings.THINGSPEAK_WRITE_API_KEY
    myReadAPIKey = settings.THINGSPEAK_READ_API_KEY
    
    # Get recent entries (default 20 for live logs)
    results = request.GET.get('results', 20)
   
    url = f"https://api.thingspeak.com/channels/{myChannelID}/feeds.json?results={results}&api_key={myReadAPIKey}"
    
    try:
        print(f"Fetching live logs from: {url}")
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        json_data = response.json()
        print(f"ThingSpeak response: {len(json_data.get('feeds', []))} live entries")
        
        # Check if feeds exist and have data
        if 'feeds' not in json_data or not json_data['feeds']:
            return JsonResponse({'error': 'No live data available from ThingSpeak'}, status=404)
        
        # Process live log entries - REVERSE ORDER to get latest first
        live_logs = []
        for entry in reversed(json_data['feeds']):  
            # Handle None values
            ambient_light = entry.get('field1')
            motion_sensor = entry.get('field2')
            
            if ambient_light is None:
                ambient_light = 0
            if motion_sensor is None:
                motion_sensor = 0
            
            live_entry = {
                'entry_id': entry.get('entry_id', 0),
                'ambient_light_sensor': float(ambient_light),
                'motion_sensor': int(motion_sensor),
                'timestamp': entry.get('created_at', ''),
            }
            live_logs.append(live_entry)
        
        return JsonResponse({
            'status': 'success',
            'live_logs': live_logs,
            'total_entries': len(live_logs),
            'last_updated': live_logs[0]['timestamp'] if live_logs else None
        })
        
    except requests.exceptions.Timeout:
        print("Request to ThingSpeak timed out")
        return JsonResponse({'error': 'Request to ThingSpeak timed out'}, status=500)
    except requests.exceptions.ConnectionError:
        print("Connection error to ThingSpeak")
        return JsonResponse({'error': 'Unable to connect to ThingSpeak'}, status=500)
    except requests.exceptions.HTTPError as e:
        print(f"HTTP error: {e}")
        return JsonResponse({'error': f'ThingSpeak API error: {e}'}, status=500)
    except KeyError as e:
        print(f"KeyError: {e}")
        return JsonResponse({'error': f'Invalid response format from ThingSpeak: {e}'}, status=500)
    except ValueError as e:
        print(f"ValueError: {e}")
        return JsonResponse({'error': f'Invalid data format: {e}'}, status=500)
    except Exception as e:
        print(f"Unexpected error: {e}")
        return JsonResponse({'error': f'Unexpected error: {str(e)}'}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def fetch_weather_data(request):
    location = request.GET.get('location', 'Harare,ZW')
    api_key = VISUAL_CROSSING_API_KEY
    
    url = f"https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/{location}/today?unitGroup=metric&key={api_key}&include=hours"
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # Get current hour from timezone-aware datetime
        now_hour = timezone.now().hour
        
        # Find the current hour's data from the API
        current_hour_data = None
        for hour_data in data['days'][0]['hours']:
            hour_time = datetime.strptime(hour_data['datetime'], '%H:%M:%S').hour
            if hour_time == now_hour:
                current_hour_data = hour_data
                break
        
        # If current hour not found, use the first hour as fallback
        if current_hour_data is None:
            current_hour_data = data['days'][0]['hours'][0]
        
        
        if 7 <= now_hour <= 9 or 16 <= now_hour <= 18:
            vehicle_base = 50
            vehicle_count = int(random.uniform(0.8, 1.2) * vehicle_base)
        else:
            vehicle_base = 10
            vehicle_count = int(random.uniform(0.7, 1.3) * vehicle_base)
        
        if 8 <= now_hour <= 20:
            ped_base = 30
            pedestrian_count = int(random.uniform(0.85, 1.15) * ped_base)
        else:
            ped_base = 3
            pedestrian_count = int(random.uniform(0.5, 1.5) * ped_base)
       
        W_PER_M2_TO_LUX = 130  # mid-range of 120–150 lux per W/m²
        
        solar_radiation = current_hour_data.get("solarradiation", 50)
        cloudcover = current_hour_data.get("cloudcover", 50)
        
        if solar_radiation > 0:
            base_lux = solar_radiation * W_PER_M2_TO_LUX
        
            cloud_factor = 1.0 - (0.8 * (cloudcover / 100.0))
        
      
            ambient_light_lux = int(base_lux * cloud_factor)
        else:
            # Night or no sun
            ambient_light_lux = 0
  
        ambient_light_lux = max(ambient_light_lux, 0)
        
        
        # Transform weather data using current hour's actual values
        transformed = {
            "ambient_light": ambient_light_lux, 
            "cloudcover": cloudcover,
            "aqi": min(int(current_hour_data.get("uvindex", 8) * 10), 500),
            "vehicle_count": vehicle_count,
            "pedestrian_count": pedestrian_count,
            "motion": 1 if int(current_hour_data.get("windspeed", 0)) > 5 else 0,
        }
        
        return JsonResponse(transformed)
        
    except requests.RequestException as e:
        # Return fallback data for Harare if API fails
        return JsonResponse({
            "error": f"Failed to fetch weather data for {location}: {str(e)}",
            "ambient_light": 1000,  
            "cloudcover": 40,
            "aqi": 80,
            "vehicle_count": 5,
            "pedestrian_count": 10,
            "motion": 0,
        }, status=200)

logger = logging.getLogger(__name__)

@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def update_light_control(request):
    """
    Handle light control updates from React frontend and send to ThingSpeak
    """
    THINGSPEAK_WRITE_API_KEY = settings.THINGSPEAK_WRITE_API_KEY
    THINGSPEAK_CHANNEL_ID = settings.THINGSPEAK_CHANNEL_ID
    THINGSPEAK_WRITE_URL = f'https://api.thingspeak.com/update'

    
    # Handle CORS preflight request
    if request.method == 'OPTIONS':
        response = JsonResponse({'status': 'ok'})
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Content-Type, Accept"
        return response
    
    try:
        # Parse JSON data from request
        data = json.loads(request.body)
        lights_on = data.get('lights_on', 0)
        
        logger.info(f"Received light control request: lights_on={lights_on}")
        
        # Validate input
        if lights_on not in [0, 1]:
            return JsonResponse({
                'error': 'Invalid lights_on value. Must be 0 or 1.',
                'status': 'error'
            }, status=400)
        
        
        # Send the user_override field
        thingspeak_data = {
            'api_key': THINGSPEAK_WRITE_API_KEY,
            'field3': lights_on  
        }
        

        # Send data to ThingSpeak
        try:
            response = requests.post(
                THINGSPEAK_WRITE_URL,
                data=thingspeak_data,
                timeout=10  # 10 second timeout
            )
            
            if response.status_code == 200:
                entry_id = response.text.strip()
                if entry_id != '0':  # ThingSpeak returns 0 if write fails
                    logger.info(f"Successfully updated ThingSpeak. Entry ID: {entry_id}")
                    
                    # Prepare success response
                    response_data = {
                        'status': 'success',
                        'message': 'Light control updated successfully',
                        'lights_on': lights_on,
                        'user_override': lights_on,  
                        'thingspeak_entry_id': entry_id,
                        'timestamp': None
                    }
                    
                    # Add timestamp if available
                    try:
                        import datetime
                        response_data['timestamp'] = datetime.datetime.now().isoformat()
                    except:
                        pass
                    
                    json_response = JsonResponse(response_data)
                    
                else:
                    logger.error("ThingSpeak write failed - returned 0")
                    json_response = JsonResponse({
                        'error': 'ThingSpeak write failed',
                        'status': 'error',
                        'details': 'ThingSpeak API returned 0 (write failed). Check API key and rate limits.'
                    }, status=500)
                    
            else:
                logger.error(f"ThingSpeak API error: {response.status_code} - {response.text}")
                json_response = JsonResponse({
                    'error': 'ThingSpeak API error',
                    'status': 'error',
                    'details': f'HTTP {response.status_code}: {response.text}'
                }, status=500)
                
        except requests.exceptions.Timeout:
            logger.error("ThingSpeak request timed out")
            json_response = JsonResponse({
                'error': 'ThingSpeak request timed out',
                'status': 'error',
                'details': 'Request to ThingSpeak API timed out after 10 seconds'
            }, status=504)
            
        except requests.exceptions.RequestException as e:
            logger.error(f"ThingSpeak request failed: {str(e)}")
            json_response = JsonResponse({
                'error': 'Failed to connect to ThingSpeak',
                'status': 'error',
                'details': str(e)
            }, status=503)
        
    except json.JSONDecodeError:
        logger.error("Invalid JSON in request body")
        json_response = JsonResponse({
            'error': 'Invalid JSON in request body',
            'status': 'error'
        }, status=400)
        
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        json_response = JsonResponse({
            'error': 'Internal server error',
            'status': 'error',
            'details': str(e)
        }, status=500)
    
    # Add CORS headers
    json_response["Access-Control-Allow-Origin"] = "*"
    json_response["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    json_response["Access-Control-Allow-Headers"] = "Content-Type, Accept"
    
    return json_response