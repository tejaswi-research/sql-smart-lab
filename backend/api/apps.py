from flask import Flask, request, jsonify
from flask_cors import CORS # 1. Import CORS
import sqlite3

app = Flask(__name__)
CORS(app) # 2. This unblocks the connection from your browser

def get_db_connection():
    # This database will store your research data
    conn = sqlite3.connect('univ.db')
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/api/tables/', methods=['GET'])
def get_tables():
    # This route allows your UI to find existing tables on startup
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        tables = [row['name'] for row in cursor.fetchall()]
        
        full_data = {}
        for t in tables:
            cursor.execute(f"PRAGMA table_info({t});")
            cols = [c['name'] for c in cursor.fetchall()]
            cursor.execute(f"SELECT * FROM {t};")
            rows = [list(r) for r in cursor.fetchall()]
            full_data[t] = {"columns": cols, "rows": rows}
        return jsonify({"status": "success", "tables": full_data})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400
    finally:
        conn.close()

@app.route('/api/execute/', methods=['POST'])
def execute_sql():
    data = request.json
    query = data.get('query', '')
    conn = get_db_connection()
    try:
        # Use executescript to allow multiple commands for beginners
        if "select" not in query.lower():
            conn.executescript(query)
            conn.commit()
            return jsonify({"status": "success", "message": "Query successful"})
        else:
            cursor = conn.cursor()
            cursor.execute(query)
            cols = [d[0] for d in cursor.description]
            rows = [list(r) for r in cursor.fetchall()]
            return jsonify({"status": "success", "columns": cols, "data": rows})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400
    finally:
        conn.close()

if __name__ == '__main__':
    # 3. Force port 5000 to match your React UI
    app.run(port=5000, debug=True)