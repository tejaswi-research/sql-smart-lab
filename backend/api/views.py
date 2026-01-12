from django.http import JsonResponse
from django.db import connection
from django.views.decorators.csrf import csrf_exempt
import json

@csrf_exempt
def execute_query(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            query = data.get('query', '')
            
            with connection.cursor() as cursor:
                cursor.execute(query)
                
                # If it's a SELECT query, we fetch the results
                if query.strip().upper().startswith("SELECT"):
                    columns = [col[0] for col in cursor.description]
                    rows = cursor.fetchall()
                    return JsonResponse({
                        "status": "success",
                        "columns": columns,
                        "data": [list(row) for row in rows]
                    })
                
                # For CREATE, INSERT, DELETE, ALTER
                return JsonResponse({
                    "status": "success",
                    "message": "Command executed successfully!",
                    "columns": [],
                    "data": []
                })
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)
    return JsonResponse({"status": "error", "message": "Invalid request"}, status=405)