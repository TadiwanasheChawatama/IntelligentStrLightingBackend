from django.urls import path
from .views import predict_light, fetch_weather_data,get_sensor_data_from_thingspeak, update_light_control, get_live_sensor_logs_from_thingspeak

urlpatterns = [
    path('predict/', predict_light),
    path('fetch_weather_data/', fetch_weather_data, name='fetch_weather_data'),
    path('get_sensor_data_from_thingspeak/', get_sensor_data_from_thingspeak, name='get_sensor_data_from_thingspeak'),
    path('update_light_control/', update_light_control, name='update_light_control'),
    path('sensor-logs/live/', get_live_sensor_logs_from_thingspeak, name='live_sensor_logs'),
]


