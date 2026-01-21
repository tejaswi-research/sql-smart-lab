import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import SmartSuggestions from './SmartSuggestions';

// --- 1. DYNAMIC SCHEMA REGISTRY (Local Source of Truth) ---
const SCHEMA_REGISTRY = {
  student: [
    { name: 'emp_id' }, { name: 'emp_name' }, { name: 'departmenit_id' }
  ],
  department: [
    { name: 'dept_id' }, { name: 'dept_name' }, { name: 'location' }
  ],
  courses: [
    { name: 'course_id' }, { name: 'course_title' }, { name: 'credits' }
  ]
};

// --- 2. ROBUST PARSING LOGIC ---
const parseSchema = (text) => {
  const createMatch = text.match(/CREATE\s+TABLE\s+(\w+)\s*\(([\s\S]*)\)/i);
  if (createMatch) {
    const tableName = createMatch[1];
    const columnsContent = createMatch[2];
    const columnsRaw = columnsContent.split(/,(?![^(]*\))/);
    const parsedCols = columnsRaw.map(col => {
      const parts = col.trim().split(/\s+/);
      const name = parts[0];
      return { name, type: "TEXT" };
    }).filter(c => c.name && !['PRIMARY', 'FOREIGN', 'CONSTRAINT', 'KEY'].includes(c.name.toUpperCase()));
    return { name: tableName, columns: parsedCols };
  }
  return null;
};

const parseAllInsertRows = (text) => {
  const matches = [...text.matchAll(/VALUES\s*\(([\s\S]*?)(?:\)|$)/gi)];
  return matches.map(match => match[1].split(',').map(val => val.trim().replace(/['"]/g, '')));
};

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ columns: [], data: [] });
  const [sources, setSources] = useState([]);
  const [existingData, setExistingData] = useState([]);
  const [multiRowPreview, setMultiRowPreview] = useState([]);
  const [activeSchema, setActiveSchema] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [error, setError] = useState("");
  const [studentQuestion, setStudentQuestion] = useState("");
  const [roadmap, setRoadmap] = useState([]);

  const colors = {
    bg: '#0f0f0f',
    sidebar: '#161616',
    border: '#333',
    mellowBlue: '#4facfe',
    successGreen: '#00c853',
    errorRed: '#ff5252',
    previewPurple: '#b388ff',
    suggestionBg: '#1a1a1a',
    suggestionAccent: '#4facfe',
    suggestionText: '#00f2fe'
  };

  // --- 3. LIVE EDITOR SYNC (Synchronous & Local-First) ---
  const handleEditorChange = (value) => {
    const val = value || "";
    setQuery(val);
    
    // Detect Table Name
    const tableMatch = val.match(/(?:INSERT\s+INTO|FROM|UPDATE|TABLE|DELETE\s+FROM)\s+(\w+)/i);
    
    if (tableMatch) {
      const tableName = tableMatch[1].toLowerCase();
      // SHOW TABLE IMMEDIATELY: No async, no network, no 400-error blocking
      if (SCHEMA_REGISTRY[tableName]) {
        setActiveSchema({ name: tableName, columns: SCHEMA_REGISTRY[tableName] });
      }
    }

    // GHOST-TEXT PREVIEW: Instant mapping of typed values to columns
    setMultiRowPreview(parseAllInsertRows(val));

    const detectedSchema = parseSchema(val);
    if (detectedSchema) setActiveSchema(detectedSchema);
  };

  // --- 4. SILENT BACKGROUND FETCH (Separated from Typing) ---
  useEffect(() => {
    const tableMatch = query.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
    if (tableMatch && activeSchema) {
      const tableName = tableMatch[1].toLowerCase();
      // Only fetch background rows if we don't have them yet
      if (existingData.length === 0) {
        const fetchExisting = async () => {
          try {
            const res = await axios.post('https://sql-smart-lab.onrender.com/api/execute/', { 
              query: `SELECT * FROM ${tableName} LIMIT 5;` 
            });
            if (res.data.status === 'success') setExistingData(res.data.data);
          } catch (e) { /* Fail silently to keep console clean */ }
        };
        fetchExisting();
      }
    }
  }, [activeSchema, query]);

  const applySuggestion = (sql) => {
    setQuery(sql);
    runQuery(sql);
  };

  const analyzeQuestion = () => {
    const q = studentQuestion.toLowerCase();
    let steps = [];
    if (q.match(/minimum|maximum|max|min|avg|average|count|sum/)) {
      steps = [
        { id: 1, text: "Use Aggregate Function: SELECT MAX(), MIN(), etc.", regex: /(MAX|MIN|AVG|COUNT|SUM)/i },
        { id: 2, text: "Specify Source: FROM [Table]", regex: /FROM/i }
      ];
    } else if (q.match(/delete|remove|clear/)) {
      steps = [
        { id: 1, text: "Start with DELETE FROM [Table]", regex: /DELETE\s+FROM/i },
        { id: 2, text: "Filter using WHERE [Condition]", regex: /WHERE/i }
      ];
    } else if (q.match(/list|show|find|select|who/)) {
      steps.push({ id: 1, text: "Start with SELECT [Columns] or *", regex: /SELECT/i });
      steps.push({ id: 2, text: "Identify Source: FROM [Table]", regex: /FROM/i });
      if (q.match(/where|scoring|more than|greater|less|whose/)) {
        steps.push({ id: 3, text: "Filter results using WHERE [Condition]", regex: /WHERE/i });
      }
    }
    setRoadmap(steps);
  };

  const runQuery = async (overrideQuery = null) => {
    const activeQuery = overrideQuery || query;
    setError(""); setSuccessMsg("");
    const upperQ = activeQuery.toUpperCase();
    
    try {
      const tableMatch = activeQuery.match(/(?:FROM|TABLE|UPDATE|INSERT\s+INTO|INTO|DELETE\s+FROM)\s+(\w+)/i);
      const tableName = tableMatch ? tableMatch[1] : null;

      if (tableName && (upperQ.includes("ALTER") || upperQ.includes("DELETE") || upperQ.includes("DROP") || upperQ.includes("UPDATE"))) {
        const snapshot = await axios.post('https://sql-smart-lab.onrender.com/api/execute/', { query: `SELECT * FROM ${tableName};` });
        setSources([{ name: tableName, columns: snapshot.data.columns, data: snapshot.data.data }]);
      }

      const response = await axios.post('https://sql-smart-lab.onrender.com/api/execute/', { query: activeQuery });
      
      if (response.data.status === 'success') {
        setSuccessMsg(response.data.message || "Command executed successfully!");
        if (upperQ.includes("DROP")) {
          setActiveSchema(null); setResults({ columns: [], data: [] }); setSources([]); setExistingData([]);
        } 
        else if (tableName) {
          const updated = await axios.post('https://sql-smart-lab.onrender.com/api/execute/', { query: `SELECT * FROM ${tableName};` });
          setResults({ columns: updated.data.columns, data: updated.data.data });
        }
        setExistingData([]); setMultiRowPreview([]);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Execution Failed");
    }
  };

  return (
    <div style={{ display: 'flex', backgroundColor: colors.bg, color: '#ccc', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      
      {/* SIDEBAR */}
      <div style={{ width: '280px', background: colors.sidebar, padding: '20px', borderRight: `1px solid ${colors.border}` }}>
        <h3 style={{ color: colors.mellowBlue, fontSize: '14px', marginBottom: '10px' }}>LOGIC TUTOR</h3>
        <textarea 
          placeholder="Ask a question..."
          value={studentQuestion}
          onChange={(e) => setStudentQuestion(e.target.value)}
          style={{ width: '100%', height: '80px', background: '#121212', color: '#fff', border: '1px solid #444', padding: '10px', fontSize: '12px', resize:'none' }}
        />
        <button onClick={analyzeQuestion} style={{ width: '100%', marginTop: '10px', padding: '8px', background: colors.mellowBlue, border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight:'bold' }}>ANALYZE</button>
        
        {roadmap.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <p style={{ fontSize: '11px', color: '#888', marginBottom: '10px', textTransform: 'uppercase' }}>Roadmap</p>
            {roadmap.map(step => (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', opacity: step.regex.test(query) ? 1 : 0.5 }}>
                <span style={{ color: step.regex.test(query) ? colors.successGreen : '#fff', marginRight: '10px' }}>
                  {step.regex.test(query) ? '✓' : '○'}
                </span>
                <span style={{ fontSize: '12px', color: step.regex.test(query) ? '#fff' : '#aaa' }}>{step.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, padding: '30px', overflowY: 'auto' }}>
        <h2 style={{ color: colors.mellowBlue, fontWeight: '400', marginBottom: '20px' }}>SQL Smart Lab</h2>
        
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <Editor height="22vh" theme="vs-dark" defaultLanguage="sql" value={query} onChange={handleEditorChange} />
        </div>

        <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
          <button onClick={() => runQuery()} style={{ padding: '10px 25px', backgroundColor: colors.mellowBlue, color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>RUN & ANALYZE</button>
          <button onClick={() => {setQuery(""); setResults({columns:[], data:[]}); setSources([]); setActiveSchema(null); setRoadmap([]); setStudentQuestion(""); setSuccessMsg("");}} style={{ padding: '10px 20px', background: 'transparent', border: `1px solid ${colors.border}`, color: '#666', borderRadius: '4px', cursor: 'pointer' }}>Clear All</button>
        </div>

        {/* CURIOSITY SUGGESTIONS */}
        {query.toLowerCase().includes('student') && (
          <SmartSuggestions query={query} onApplySuggestion={applySuggestion} />
        )}

        {/* STRUCTURAL PREVIEW (ACTIVE SCHEMA) */}
        {activeSchema && (
          <div style={{ marginTop: '20px', background: colors.sidebar, padding: '15px', border: `1px dashed ${colors.mellowBlue}`, borderRadius: '8px', overflowX: 'auto' }}>
            <h5 style={{ margin: '0 0 10px 0', fontSize: '12px' }}>Structural Preview: {activeSchema.name}</h5>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {activeSchema.columns.map((c, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '10px', border: `1px solid ${colors.border}`, color: colors.mellowBlue }}>{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Existing Data (Snapshot) */}
                {existingData.map((row, rIdx) => (
                  <tr key={`ex-${rIdx}`} style={{ opacity: 0.3 }}>
                    {row.map((cell, cIdx) => <td key={cIdx} style={{ padding: '10px', border: `1px solid ${colors.border}` }}>{cell}</td>)}
                  </tr>
                ))}
                {/* Live Typing Ghost Text */}
                {multiRowPreview.map((row, rIdx) => (
                  <tr key={`new-${rIdx}`}>
                    {activeSchema.columns.map((_, cIdx) => (
                      <td key={cIdx} style={{ padding: '10px', border: `1px solid ${colors.border}`, color: colors.previewPurple, fontWeight: 'bold' }}>
                        {row[cIdx] || '...'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {successMsg && <div style={{ marginTop: '20px', color: colors.successGreen }}>✓ {successMsg}</div>}
        {error && <div style={{ marginTop: '20px', color: colors.errorRed }}>⚠ {error}</div>}

        <div style={{ display: 'flex', gap: '20px', marginTop: '30px' }}>
          {sources.length > 0 && (
            <div style={{ flex: 1 }}>
              <h5 style={{ color: '#888', marginBottom:'10px' }}>BEFORE (Snapshot)</h5>
              <div style={{ background: colors.sidebar, padding: '15px', borderRadius: '8px', border: `1px solid ${colors.border}`, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead><tr>{sources[0].columns.map((c, i) => <th key={i} style={{ padding: '8px', border: `1px solid ${colors.border}`, textAlign: 'left' }}>{c}</th>)}</tr></thead>
                  <tbody>{sources[0].data.map((row, rIdx) => (<tr key={rIdx}>{row.map((cell, cIdx) => <td key={cIdx} style={{ padding: '8px', border: `1px solid ${colors.border}` }}>{cell}</td>)}</tr>))}</tbody>
                </table>
              </div>
            </div>
          )}
          {results.columns.length > 0 && (
            <div style={{ flex: 1 }}>
              <h5 style={{ color: colors.mellowBlue, marginBottom:'10px' }}>AFTER (Updated Result)</h5>
              <div style={{ background: colors.sidebar, padding: '15px', borderRadius: '8px', border: `1px solid ${colors.mellowBlue}`, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead><tr>{results.columns.map((c, i) => <th key={i} style={{ padding: '8px', border: `1px solid ${colors.border}`, textAlign: 'left' }}>{c}</th>)}</tr></thead>
                  <tbody>{results.data.map((row, rIdx) => (<tr key={rIdx}>{row.map((cell, cIdx) => <td key={cIdx} style={{ padding: '8px', border: `1px solid ${colors.border}` }}>{cell}</td>)}</tr>))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;