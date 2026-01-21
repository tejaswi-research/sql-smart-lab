import React from 'react';

const SmartSuggestions = ({ query, onApplySuggestion }) => {
  // Logic to detect if we are looking at the 'student' table
  const isStudentTable = query.toLowerCase().includes('student');

  if (!isStudentTable) return null;

  const suggestions = [
    { label: "🔍 View all student names", sql: "SELECT emp_name FROM student;" },
    { label: "🏢 Filter by Department", sql: "SELECT * FROM student WHERE departmenit_id = 'CS';" },
    { label: "📊 Count students per Dept", sql: "SELECT departmenit_id, COUNT(*) FROM student GROUP BY departmenit_id;" }
  ];

  return (
    <div style={styles.container}>
      <p style={styles.title}>💡 Curiosity Corner: Try exploring...</p>
      <div style={styles.buttonGroup}>
        {suggestions.map((item, index) => (
          <button 
            key={index} 
            onClick={() => onApplySuggestion(item.sql)}
            style={styles.button}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const styles = {
  container: {
    background: '#f0f7ff',
    borderLeft: '4px solid #007bff',
    padding: '15px',
    margin: '10px 0',
    borderRadius: '4px',
    animation: 'fadeIn 0.5s ease-in'
  },
  title: { margin: 0, fontWeight: 'bold', color: '#0056b3', fontSize: '14px' },
  buttonGroup: { display: 'flex', gap: '10px', marginTop: '10px' },
  button: {
    padding: '8px 12px',
    background: '#fff',
    border: '1px solid #007bff',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'all 0.3s'
  }
};

export default SmartSuggestions;