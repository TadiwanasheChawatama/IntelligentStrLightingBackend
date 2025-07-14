from django.db import models

# Create your models here.
class PredictionLog(models.Model):
    timestamp = models.DateTimeField(auto_now_add=True)
    intensity = models.FloatField()
    lights_on = models.BooleanField()
    confidence = models.FloatField()