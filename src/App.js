import React, { useState, useEffect, useMemo } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";

const API_BASE = 'http://localhost:5000/api/execute/'; 
const TABLES_URL = 'http://localhost:5000/api/tables/';

/* PARSERS */
const parseAllCreates = (sql) => {
  const regex = /create\s+table\s+(\w+)\s*\(([\s\S]*)\)/gi;
  const found = [];
  let m;
  
  while ((m = regex.exec(sql)) !== null) {
    const tableName = m[1].toLowerCase();
    const fullBody = m[2];
    const lines = [];
    let current = "";
    let parenCount = 0;
    
    for (let i = 0; i < fullBody.length; i++) {
      const char = fullBody[i];
      if (char === "(") parenCount++;
      else if (char === ")") parenCount--;
      else if (char === "," && parenCount === 0) {
        lines.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }
    if (current.trim()) lines.push(current.trim());
    
    const cols = lines
      .map((line) => {
        const upperLine = line.toUpperCase();
        if (upperLine.includes("PRIMARY KEY") || upperLine.includes("FOREIGN KEY") || 
            upperLine.includes("CONSTRAINT") || upperLine.includes("CHECK") || upperLine.includes("UNIQUE")) {
          return null;
        }
        const match = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
        return match ? match[1].toLowerCase() : null;
      })
      .filter(Boolean);
    
    if (cols.length > 0) {
      found.push({ name: tableName, columns: cols });
    }
  }
  return found;
};

/* MAIN APP */
export default function App() {
  const [query, setQuery] = useState("");
  const [tables, setTables] = useState(() => JSON.parse(localStorage.getItem("sql_lab_brain") || "{}"));
  const [liveTableData, setLiveTableData] = useState({});
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState({ before: null, after: null, target: null });
  const [studentQuestion, setStudentQuestion] = useState("");
  const [logicSteps, setLogicSteps] = useState([]);

  const colors = { 
    bg: "#0b0f1a", 
    panel: "#0f172a", 
    border: "#1e293b", 
    blue: "#4facfe", 
    yellow: "#facc15", 
    purple: "#c084fc", 
    red: "#ff4d4d", 
    green: "#4ade80",
    preview: "#7c3aed"  // Mellow purple for previews
  };

  useEffect(() => { 
    localStorage.setItem("sql_lab_brain", JSON.stringify(tables)); 
  }, [tables]);

  useEffect(() => {
    const syncWithDatabase = async () => {
      try {
        const res = await axios.get(TABLES_URL);
        if (res.data.status === "success") {
          setTables(res.data.tables);
        }
      } catch (err) {
        console.log("Backend sync failed.");
      }
    };
    syncWithDatabase();
  }, []);

  const analyzeLogic = () => {
    const q = studentQuestion.toLowerCase();
    let steps = [];
    
    if (q.includes("select") || q.includes("show") || q.includes("find") || q.includes("retrieve") || q.includes("get")) 
      steps.push("🔍 Use SELECT to pick columns.");
    if (q.includes("insert") || q.includes("add") || q.includes("put") || q.includes("enter")) 
      steps.push("📥 Use INSERT INTO to add data.");
    if (q.includes("join") || q.includes("combine") || q.includes("link") || q.includes("merge")) 
      steps.push("🔗 Use JOIN to link tables.");
    if (q.includes("delete") || q.includes("remove") || q.includes("drop")) 
      steps.push("🗑️ Use DELETE FROM to remove data.");
    if (q.includes("update") || q.includes("change") || q.includes("modify") || q.includes("edit") || q.includes("alter")) 
      steps.push("✏️ Use UPDATE to modify data.");
    if (q.includes("create") || q.includes("make") || q.includes("build") || q.includes("new")) 
      steps.push("🏗️ Use CREATE TABLE to build tables.");
    
    if (steps.length === 0) {
      steps.push("💡 Describe what you want to do (e.g., 'show all data', 'add new row')");
    }
    
    setLogicSteps(steps);
  };

  // Fetch live data when DELETE/UPDATE is typed
  useEffect(() => {
    const deleteMatch = query.match(/delete\s+from\s+(\w+)/i);
    const updateMatch = query.match(/update\s+(\w+)/i);
    
    const tableName = deleteMatch ? deleteMatch[1].toLowerCase() : updateMatch ? updateMatch[1].toLowerCase() : null;
    
    if (tableName && tables[tableName]) {
      axios.post(API_BASE, { query: `SELECT * FROM ${tableName};` })
        .then(res => {
          setLiveTableData(prev => ({
            ...prev,
            [tableName]: res.data.data
          }));
        })
        .catch(err => console.log("Failed to fetch live data"));
    }
  }, [query, tables]);

  const activeWorkspaces = useMemo(() => {
    const q = query.toLowerCase().trim();
    const liveCreates = parseAllCreates(query);
    
    const insertMatch = query.match(/insert\s+into\s+(\w+)/i);
    const updateMatch = query.match(/update\s+(\w+)/i);
    const deleteMatch = query.match(/delete\s+from\s+(\w+)/i);
    const selectMatch = query.match(/from\s+(\w+)/i);
    
    const insertTableName = insertMatch ? insertMatch[1].toLowerCase() : null;
    const updateTableName = updateMatch ? updateMatch[1].toLowerCase() : null;
    const deleteTableName = deleteMatch ? deleteMatch[1].toLowerCase() : null;
    const selectTableName = selectMatch ? selectMatch[1].toLowerCase() : null;
    
    // Parse ALL INSERT statements (multiple rows)
    const hasValues = query.match(/values\s*\(/i);
    let draftRows = [];
    if (insertTableName && hasValues) {
      const insertRegex = /insert\s+into\s+\w+\s+values\s*\(([\s\S]*?)\)(?:;|$)/gi;
      let match;
      while ((match = insertRegex.exec(query)) !== null) {
        const valueString = match[1];
        const values = [];
        let current = "";
        let inQuotes = false;
        let quoteChar = null;
        
        for (let i = 0; i < valueString.length; i++) {
          const char = valueString[i];
          if ((char === '"' || char === "'" || char === "`") && !inQuotes) {
            inQuotes = true;
            quoteChar = char;
          } else if (char === quoteChar && inQuotes) {
            inQuotes = false;
            quoteChar = null;
          } else if (char === "," && !inQuotes) {
            values.push(current.trim());
            current = "";
            continue;
          }
          current += char;
        }
        if (current.trim()) values.push(current.trim());
        
        const cleanedValues = values.map(v => {
          let cleaned = v.trim();
          if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
              (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
              (cleaned.startsWith("`") && cleaned.endsWith("`"))) {
            cleaned = cleaned.slice(1, -1);
          }
          return cleaned;
        });
        
        if (cleanedValues.length > 0) {
          draftRows.push(cleanedValues);
        }
      }
    }
    
    const toShow = [...liveCreates.map(c => ({...c, isNew: true}))];
    const mentionedTables = new Set();
    
    if (insertTableName && tables[insertTableName]) mentionedTables.add(insertTableName);
    if (updateTableName && tables[updateTableName]) mentionedTables.add(updateTableName);
    if (deleteTableName && tables[deleteTableName]) mentionedTables.add(deleteTableName);
    if (selectTableName && tables[selectTableName]) mentionedTables.add(selectTableName);
    
    Object.keys(tables).forEach(tableName => {
      if (q.includes(tableName)) {
        mentionedTables.add(tableName);
      }
    });
    
    mentionedTables.forEach(tableName => {
      if (!toShow.find(ts => ts.name === tableName) && tables[tableName]) {
        toShow.push({ ...tables[tableName], name: tableName, isNew: false });
      }
    });

    return toShow.map(ws => {
      let displayRows = tables[ws.name]?.rows || [];
      if ((deleteTableName === ws.name || updateTableName === ws.name) && liveTableData[ws.name] !== undefined) {
        displayRows = liveTableData[ws.name];
      }

      return {
        ...ws,
        rows: displayRows,
        draftRows: (insertTableName === ws.name) ? draftRows : [],
        showDelete: (deleteTableName === ws.name) ? true : false,
        showUpdate: (updateTableName === ws.name) ? true : false
      };
    });
  }, [query, tables, liveTableData]);

  const runSQL = async () => {
    setError("");
    setSuccess("");
    
    const lowerQuery = query.toLowerCase().trim();
    const targetMatch = query.match(/(?:into|from|table|update|truncate)\s+(\w+)/i);
    const target = targetMatch ? targetMatch[1].toLowerCase() : null;

    const needsComparison = 
        lowerQuery.startsWith("update") || lowerQuery.startsWith("delete") || 
        lowerQuery.startsWith("alter") || lowerQuery.startsWith("truncate");

    if (needsComparison && target && tables[target]) {
      setHistory({ 
        before: JSON.parse(JSON.stringify(tables[target])), 
        after: null, 
        target 
      });
    } else {
      setHistory({ before: null, after: null, target: null });
    }

    try {
      const res = await axios.post(API_BASE, { query: lowerQuery });
      if (res.data.status === "success") {
        setSuccess(res.data.message || "Query executed successfully!");
        let updatedRegistry = { ...tables };

        if (target) {
          if (lowerQuery.startsWith("drop")) {
            delete updatedRegistry[target];
          } else if (!lowerQuery.startsWith("create")) {
            const fresh = await axios.post(API_BASE, { query: `SELECT * FROM ${target};` });
            updatedRegistry[target] = { columns: fresh.data.columns, rows: fresh.data.data };
            if (needsComparison) {
              setHistory(prev => ({ ...prev, after: updatedRegistry[target] }));
            }
          }
        }

        const newSchemas = parseAllCreates(query);
        newSchemas.forEach(s => { 
          if (!updatedRegistry[s.name]) updatedRegistry[s.name] = { columns: s.columns, rows: [] };
        });

        setTables(updatedRegistry);
        setLiveTableData({});
      }
    } catch (err) {
      setError(err.response?.data?.message || "Check SQL Syntax");
      setHistory({ before: null, after: null, target: null });
    }
  };

  const clearEditor = () => {
    setQuery("");
    setHistory({before:null, after:null, target:null});
    setError("");
    setSuccess("");
  };

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", color: "#e5e7eb", display: "flex", fontFamily: "sans-serif" }}>
      {/* SIDEBAR */}
      <div style={{ width: "300px", background: colors.panel, padding: "20px", borderRight: `1px solid ${colors.border}`, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <h4 style={{ color: colors.blue, marginBottom: "15px", marginTop: 0, fontSize: "14px", fontWeight: "600" }}>LOGIC TUTOR</h4>
        <textarea 
          placeholder="What do you want to achieve?" 
          value={studentQuestion}
          onChange={(e) => setStudentQuestion(e.target.value)}
          style={{ 
            width: "100%", 
            flex: 1,
            minHeight: "100px",
            maxHeight: "150px",
            background: "#0b0f1a", 
            color: "#fff", 
            border: `1px solid ${colors.border}`, 
            padding: "10px", 
            borderRadius: "4px", 
            fontSize: "12px", 
            resize: "vertical",
            fontFamily: "inherit"
          }}
        />
        <button onClick={analyzeLogic} style={{ width: "100%", marginTop: "10px", padding: "8px", background: colors.blue, color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>ANALYZE LOGIC</button>
        <div style={{ marginTop: "15px", flex: 1, overflowY: "auto" }}>
          {logicSteps.length === 0 && <div style={{ color: "#666", fontSize: "12px" }}>Describe your goal above...</div>}
          {logicSteps.map((s, i) => (
            <div key={i} style={{ padding: "10px", marginBottom: "8px", background: "#1e293b", borderRadius: "4px", fontSize: "12px", borderLeft: `3px solid ${colors.blue}` }}>{s}</div>
          ))}
        </div>
      </div>

      {/* MAIN AREA */}
      <div style={{ flex: 1, padding: "30px", overflowY: "auto" }}>
        <h2 style={{ color: colors.blue, marginTop: 0 }}>SQL Smart Lab</h2>
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: "8px", overflow: "hidden", marginTop: "20px" }}>
          <Editor height="25vh" theme="vs-dark" defaultLanguage="sql" value={query} onChange={(v) => setQuery(v || "")} />
        </div>

        <div style={{ marginTop: "15px", display: "flex", gap: "10px" }}>
          <button onClick={runSQL} style={{ padding: "12px 30px", background: colors.blue, border: "none", color: "#fff", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", fontSize: "14px" }}>RUN COMMAND</button>
          <button onClick={clearEditor} style={{ padding: "10px 20px", background: "transparent", border: `1px solid ${colors.border}`, color: "#666", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>CLEAR DATA</button>
        </div>

        <div style={{ marginTop: "15px", minHeight: "24px" }}>
          {error && <div style={{ color: colors.red, fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>⚠️ {error}</div>}
          {success && <div style={{ color: colors.green, fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>✅ {success}</div>}
        </div>

        <div style={{ marginTop: "30px", display: "flex", gap: "20px", flexWrap: "wrap" }}>
          {activeWorkspaces.map(ws => (
            <div key={ws.name} style={{ 
              background: colors.panel, 
              border: `1px solid ${ws.isNew ? colors.yellow : ws.showDelete || ws.showUpdate ? colors.preview : colors.blue}`, 
              padding: "20px", 
              borderRadius: "8px", 
              minWidth: "340px"
            }}>
              <h5 style={{ margin: "0 0 15px 0", color: colors.blue, fontSize: "13px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{ws.name} <span style={{ color: "#666", fontWeight: "400", fontSize: "11px" }}>({ws.columns?.length || 0} cols)</span></span>
                {(ws.showDelete || ws.showUpdate) && (
                  <span style={{ 
                    background: colors.preview, 
                    color: "#fff", 
                    padding: "4px 8px", 
                    borderRadius: "3px", 
                    fontSize: "10px", 
                    fontWeight: "bold",
                    textTransform: "uppercase"
                  }}>
                    {ws.showDelete ? "🗑️ Delete" : "✏️ Update"}
                  </span>
                )}
              </h5>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr>
                      {ws.columns && ws.columns.length > 0 ? (
                        ws.columns.map(c => <th key={c} style={{ color: colors.yellow, borderBottom: `1px solid ${colors.border}`, padding: "10px 8px", textAlign: "left", whiteSpace: "nowrap", fontSize: "11px", fontWeight: "600" }}>{c}</th>)
                      ) : (
                        <th style={{ color: colors.yellow, borderBottom: `1px solid ${colors.border}`, padding: "10px" }}>No columns</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {ws.rows && ws.rows.length > 0 ? (
                      ws.rows.map((row, rIdx) => (
                        <tr key={rIdx} style={{ borderBottom: `1px solid ${colors.border}` }}>
                          {ws.columns.map((_, cIdx) => <td key={cIdx} style={{ padding: "10px 8px", color: "#b0b9c6" }}>{row[cIdx]}</td>)}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td style={{ padding: "15px", color: "#666", fontStyle: "italic", textAlign: "center" }} colSpan={ws.columns?.length || 1}>
                          {ws.isNew ? "Empty table" : "No data"}
                        </td>
                      </tr>
                    )}
                    {ws.draftRows && ws.draftRows.length > 0 && (
                      ws.draftRows.map((draftRow, dIdx) => (
                        <tr key={`draft-${dIdx}`} style={{ background: "rgba(124, 58, 237, 0.1)", borderBottom: `1px solid ${colors.preview}` }}>
                          {ws.columns.map((_, cIdx) => <td key={cIdx} style={{ padding: "10px 8px", color: colors.preview, fontWeight: "500" }}>{draftRow[cIdx] || "..."}</td>)}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {history.before && history.after && (
          <div style={{ marginTop: "40px", padding: "20px", background: "#111827", borderRadius: "8px", border: `1px solid ${colors.purple}` }}>
            <h4 style={{ color: colors.purple, margin: "0 0 20px 0", fontSize: "13px", fontWeight: "600", textTransform: "uppercase" }}>Comparison: {history.target.toUpperCase()}</h4>
            <div style={{ display: "flex", gap: "30px", alignItems: "flex-start", overflowX: "auto" }}>
              <div style={{ flex: 1, opacity: 0.7, minWidth: "300px" }}>
                <h6 style={{ color: "#9ca3af", marginBottom: "10px", fontSize: "11px", fontWeight: "600", textTransform: "uppercase" }}>Before</h6>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", background: "#0f172a" }}>
                    <thead>
                      <tr>{history.before.columns.map(c => <th key={c} style={{ borderBottom: "1px solid #1e293b", padding: "8px", textAlign: "left", color: colors.yellow, fontSize: "10px", fontWeight: "600" }}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {history.before.rows.map((row, i) => (
                        <tr key={i}>{row.map((cell, j) => <td key={j} style={{ padding: "8px", borderBottom: "1px solid #1e293b", color: "#d1d5db" }}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ alignSelf: "center", color: colors.blue, fontSize: "20px", fontWeight: "bold", flexShrink: 0 }}>➔</div>
              <div style={{ flex: 1, minWidth: "300px" }}>
                <h6 style={{ color: colors.blue, marginBottom: "10px", fontSize: "11px", fontWeight: "600", textTransform: "uppercase" }}>After</h6>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", background: "#0f172a" }}>
                    <thead>
                      <tr>{history.after.columns.map(c => <th key={c} style={{ borderBottom: "1px solid #1e293b", padding: "8px", textAlign: "left", color: colors.yellow, fontSize: "10px", fontWeight: "600" }}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {history.after.rows.map((row, i) => (
                        <tr key={i}>{row.map((cell, j) => <td key={j} style={{ padding: "8px", borderBottom: "1px solid #1e293b", color: "#d1d5db" }}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}