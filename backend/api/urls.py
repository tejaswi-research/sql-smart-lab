from django.urls import path
from . import views

urlpatterns = [
    # This makes the URL: http://localhost:8000/api/execute/
    path('execute/', views.execute_sql, name='execute_sql'),
    # This makes the URL: http://localhost:8000/api/tables/
    path('tables/', views.get_tables, name='get_tables'),
]