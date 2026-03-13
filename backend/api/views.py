from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
import sqlite3
import os

# Helper to connect to the database and enable constraints
def get_db_connection():
    # This keeps univ.db in your backend folder
    conn = sqlite3.connect('univ.db')
    conn.row_factory = sqlite3.Row
    # 🚀 CRITICAL: Enable Foreign Key enforcement for your constraints
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

@csrf_exempt
def execute_sql(request):
    if request.method == 'POST':
        try:
            body = json.loads(request.body)
            query = body.get('query', '').strip()
            
            conn = get_db_connection()
            cursor = conn.cursor()

            # Logic for SELECT queries (Returning Data)
            if query.lower().startswith("select"):
                cursor.execute(query)
                columns = [d[0] for d in cursor.description]
                rows = [list(row) for row in cursor.fetchall()]
                conn.close()
                return JsonResponse({"status": "success", "columns": columns, "data": rows})
            
            # Logic for CREATE, INSERT, UPDATE (Changing Data)
            else:
                # Use executescript to handle multi-line CREATE TABLE commands
                cursor.executescript(query)
                conn.commit()
                conn.close()
                return JsonResponse({"status": "success", "message": "Query executed successfully!"})

        except Exception as e:
            # 🚀 This converts the 500 error into a readable message for React
            return JsonResponse({"status": "error", "message": str(e)}, status=400)

    return JsonResponse({"status": "error", "message": "Invalid method"}, status=405)

@csrf_exempt
def get_tables(request):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # Fetch all user tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        table_names = [row['name'] for row in cursor.fetchall()]
        
        full_registry = {}
        for name in table_names:
            # Get columns for the skeleton
            cursor.execute(f"PRAGMA table_info({name});")
            cols = [col['name'] for col in cursor.fetchall()]
            # Get existing rows
            cursor.execute(f"SELECT * FROM {name};")
            rows = [list(row) for row in cursor.fetchall()]
            full_registry[name] = {"columns": cols, "rows": rows}
            
        return JsonResponse({"status": "success", "tables": full_registry})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)
    finally:
        conn.close()