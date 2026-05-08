import React, { useState, useEffect } from 'react';
import { Database, Table, RefreshCw, AlertTriangle, List, Grid, Trash2 } from 'lucide-react';
import { adminService } from '../services/api';

const Databases: React.FC = () => {
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState<any[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'tables' | 'columns' | 'data'>('tables');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchDbs();
  }, []);

  const fetchDbs = () => {
    setLoading(true);
    adminService.getDatabases()
      .then(list => {
        setDatabases(list);
        if (list.length > 0 && !selectedDb) setSelectedDb(list[0]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (selectedDb) {
      setLoading(true);
      adminService.getDatabaseTables(selectedDb)
        .then(list => {
          setTables(list);
          setSelectedTable('');
          setViewMode('tables');
        })
        .finally(() => setLoading(false));
    }
  }, [selectedDb]);

  const handleInspectTable = async (table: string) => {
    setSelectedTable(table);
    setLoading(true);
    try {
      const [cols, data] = await Promise.all([
        adminService.getTableColumns(selectedDb, table),
        adminService.getTableData(selectedDb, table)
      ]);
      setColumns(cols);
      setTableData(data);
      setViewMode('data');
    } catch (err) {
      console.error("Failed to inspect table", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDropDb = async () => {
    if (window.confirm(`Are you absolutely sure you want to DROP the database ${selectedDb}? This cannot be undone.`)) {
      try {
        await adminService.dropDatabase(selectedDb);
        setSelectedDb('');
        fetchDbs();
      } catch (err) {
        alert("Failed to drop database");
      }
    }
  };

  const handleClearTable = async (table: string) => {
    if (window.confirm(`Clear all data from table ${table}?`)) {
      try {
        const agent = selectedDb.replace('_db', '');
        await adminService.clearTable(agent, table);
        if (selectedTable === table) handleInspectTable(table);
      } catch (err) {
        alert("Failed to clear table. Note: Only agent databases support clear currently.");
      }
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h2 style={{ fontSize: '1.875rem', marginBottom: '8px' }}>Database Explorer</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Inspect schema, columns, and data across all system databases.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {selectedTable && (
            <div style={{ display: 'flex', backgroundColor: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)', padding: '4px' }}>
              <button 
                onClick={() => setViewMode('columns')}
                style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: viewMode === 'columns' ? 'var(--bg-color)' : 'transparent', color: viewMode === 'columns' ? 'var(--accent-secondary)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}
              >
                <List size={16} /> Columns
              </button>
              <button 
                onClick={() => setViewMode('data')}
                style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: viewMode === 'data' ? 'var(--bg-color)' : 'transparent', color: viewMode === 'data' ? 'var(--accent-secondary)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}
              >
                <Grid size={16} /> Data
              </button>
            </div>
          )}
          <button onClick={fetchDbs} style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-secondary)', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <RefreshCw size={18} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '32px' }}>
        {/* Sidebar: DB and Table List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '16px' }}>Databases</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {databases.map(db => (
                <button 
                  key={db}
                  onClick={() => setSelectedDb(db)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: selectedDb === db ? 'var(--text-primary)' : 'var(--text-secondary)',
                    backgroundColor: selectedDb === db ? 'rgba(255,255,255,0.05)' : 'transparent',
                    textAlign: 'left'
                  }}
                >
                  <Database size={16} color={selectedDb === db ? 'var(--accent-secondary)' : 'var(--text-secondary)'} />
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{db}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '16px' }}>Tables in {selectedDb}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {tables.map(table => (
                <button 
                  key={table}
                  onClick={() => handleInspectTable(table)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: selectedTable === table ? 'var(--text-primary)' : 'var(--text-secondary)',
                    backgroundColor: selectedTable === table ? 'rgba(255,255,255,0.05)' : 'transparent',
                    textAlign: 'left'
                  }}
                >
                  <Table size={16} color={selectedTable === table ? 'var(--accent-secondary)' : 'var(--text-secondary)'} />
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{table}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', minHeight: '600px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <RefreshCw size={32} className="animate-spin" style={{ opacity: 0.2 }} />
            </div>
          ) : !selectedDb ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
              <Database size={64} style={{ opacity: 0.1, marginBottom: '24px' }} />
              <p>Select a database to begin exploration.</p>
            </div>
          ) : viewMode === 'tables' ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <Table size={48} style={{ opacity: 0.1, marginBottom: '20px', margin: '0 auto' }} />
              <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>{selectedDb}</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>This database contains {tables.length} tables. Select a table from the sidebar to view its structure and content.</p>
              
              {selectedDb !== 'userdb' && (
                <button onClick={handleDropDb} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto', fontSize: '0.875rem', fontWeight: 600 }}>
                  <Trash2 size={16} /> Drop Database
                </button>
              )}
            </div>
          ) : viewMode === 'columns' ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '16px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Column Name</th>
                    <th style={{ padding: '16px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</th>
                    <th style={{ padding: '16px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Nullable</th>
                    <th style={{ padding: '16px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Key</th>
                    <th style={{ padding: '16px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Default</th>
                    <th style={{ padding: '16px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Extra</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '16px 20px', fontWeight: 600 }}>{col.name}</td>
                      <td style={{ padding: '16px 20px', fontFamily: 'monospace', color: 'var(--accent-secondary)' }}>{col.type}</td>
                      <td style={{ padding: '16px 20px' }}>{col.null}</td>
                      <td style={{ padding: '16px 20px' }}>{col.key || '-'}</td>
                      <td style={{ padding: '16px 20px' }}>{col.default || 'NULL'}</td>
                      <td style={{ padding: '16px 20px', fontSize: '0.75rem' }}>{col.extra || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Data Preview (Top 100 rows)</span>
                <button onClick={() => handleClearTable(selectedTable)} style={{ color: 'var(--accent-color)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Trash2 size={14} /> Clear Table
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                      {columns.map(col => (
                        <th key={col.name} style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{col.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s ease' }} onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.01)'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        {columns.map(col => (
                          <td key={col.name} style={{ padding: '12px 16px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row[col.name]?.toString() || 'NULL'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {tableData.length === 0 && (
                      <tr>
                        <td colSpan={columns.length} style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>No data available in this table.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '32px', padding: '20px', backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', borderRadius: '12px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <AlertTriangle color="var(--accent-color)" />
        <div>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent-color)' }}>Database Inspector Mode</h4>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>You are viewing live system data. Destructive actions like Clear and Drop are permanent. Use with caution.</p>
        </div>
      </div>
    </div>
  );
};

export default Databases;
