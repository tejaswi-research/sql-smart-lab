from django.urls import path
from .views import execute_query

urlpatterns = [
    path('execute/', execute_query),
]