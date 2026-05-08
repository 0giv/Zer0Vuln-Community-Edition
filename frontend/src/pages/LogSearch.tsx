import React, { useState, useEffect } from 'react';
import { Search, Filter, Database, Calendar, User, Eye, BarChart3 } from 'lucide-react';
import { agentService } from '../services/api';

const LogSearch: React.FC = () => {
    const [agents, setAgents] = useState<any[]>([]);
    const [selectedAgent, setSelectedAgent] = useState('*');
    const [selectedTable, setSelectedTable] = useState('*');
    const [query, setQuery] = useState('*');
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [selectedLog, setSelectedLog] = useState<any>(null);

    const tables = [
        { id: '*', name: 'All Types' },
        { id: 'siem_events', name: 'SIEM Events' },
        { id: 'events_alert', name: 'Security Alerts' },
        { id: 'process_events', name: 'Process Events' },
        { id: 'network_connections', name: 'Network' },
        { id: 'fim_data', name: 'File Integrity' },
        { id: 'audit_logs', name: 'Audit Logs' }
    ];

    useEffect(() => {
        agentService.getAgents().then(setAgents).catch(console.error);
        handleSearch();
    }, []);

    const handleSearch = () => {
        setLoading(true);
        agentService.searchLogs({
            agent: selectedAgent,
            table: selectedTable,
            q: query,
            limit: 100
        })
        .then(res => {
            setLogs(res.hits || []);
            setTotal(res.total || 0);
        })
        .catch(err => {
            console.error(err);
            setLogs([]);
        })
        .finally(() => setLoading(false));
    };

    return (
        <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '8px', background: 'linear-gradient(90deg, #fff, rgba(255,255,255,0.7))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Log Explorer</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>Global search engine powered by OpenSearch across all agents and datasets.</p>
                </div>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '10px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Database size={20} color="#60a5fa" />
                        <div>
                            <p style={{ fontSize: '0.7rem', color: '#60a5fa', fontWeight: 600, textTransform: 'uppercase' }}>OpenSearch Cluster</p>
                            <p style={{ fontSize: '0.9rem', fontWeight: 700 }}>{total.toLocaleString()} Records Indexed</p>
                        </div>
                    </div>
                    <a 
                        href={`http://${window.location.hostname}:5601`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ 
                            backgroundColor: 'rgba(37, 99, 235, 0.1)', 
                            padding: '10px 24px', 
                            borderRadius: 'var(--radius-md)', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px',
                            textDecoration: 'none',
                            color: 'white',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            transition: 'all 0.3s ease',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            boxShadow: '0 0 15px rgba(37, 99, 235, 0.1)'
                        }}
                        onMouseOver={e => { e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 0.2)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 0 25px rgba(37, 99, 235, 0.2)'; }}
                        onMouseOut={e => { e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 0.1)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 0 15px rgba(37, 99, 235, 0.1)'; }}
                    >
                        <BarChart3 size={20} color="var(--accent-secondary)" />
                        Open Advanced Dashboards (Kibana)
                    </a>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '32px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '16px', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Search Query</label>
                        <div style={{ position: 'relative' }}>
                            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                            <input 
                                type="text" 
                                placeholder="Search anything... (e.g. 'powershell', '192.168', 'Suspicious')" 
                                value={query === '*' ? '' : query}
                                onChange={(e) => setQuery(e.target.value || '*')}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                style={{ width: '100%', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 12px 12px 42px', color: 'white', fontSize: '0.9rem', transition: 'border-color 0.2s' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Security Agent</label>
                        <select 
                            value={selectedAgent}
                            onChange={(e) => setSelectedAgent(e.target.value)}
                            style={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', color: 'white' }}
                        >
                            <option value="*">All Agents</option>
                            {agents.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Dataset Type</label>
                        <select 
                            value={selectedTable}
                            onChange={(e) => setSelectedTable(e.target.value)}
                            style={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', color: 'white' }}
                        >
                            {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>

                    <button 
                        onClick={handleSearch}
                        disabled={loading}
                        style={{ backgroundColor: 'var(--accent-secondary)', color: 'white', padding: '12px 24px', borderRadius: '10px', fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'transform 0.2s', opacity: loading ? 0.7 : 1 }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        {loading ? 'Searching...' : <><Search size={18} /> Run Search</>}
                    </button>
                </div>
            </div>

            <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Filter size={18} color="var(--accent-secondary)" />
                        <span style={{ fontWeight: 600 }}>Results from OpenSearch</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Showing top 100 matches</span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', textAlign: 'left' }}>
                                <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Timestamp</th>
                                <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Agent</th>
                                <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Log Content / Details</th>
                                <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <td style={{ padding: '16px 24px', fontSize: '0.875rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                                            <Calendar size={14} />
                                            {new Date(log['@timestamp']).toLocaleString()}
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px 24px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ padding: '4px', backgroundColor: 'rgba(37, 99, 235, 0.1)', borderRadius: '4px' }}>
                                                <User size={14} color="var(--accent-secondary)" />
                                            </div>
                                            <span style={{ fontWeight: 600 }}>{log.agent_name}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px 24px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <code style={{ fontSize: '0.75rem', color: '#10b981', display: 'block', backgroundColor: 'rgba(16, 185, 129, 0.05)', padding: '2px 6px', borderRadius: '4px', width: 'fit-content' }}>
                                                {log.file_path || log.path || log.process_name || log.remote_ip || 'TELEMETRY_DATA'}
                                            </code>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', opacity: 0.9 }}>
                                                {JSON.stringify(log).substring(0, 150)}...
                                            </span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px 24px' }}>
                                        <button onClick={() => setSelectedLog(log)} style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Eye size={14} /> View JSON
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {logs.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={4} style={{ padding: '100px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        <Search size={48} style={{ marginBottom: '16px', opacity: 0.2 }} />
                                        <p>No log entries found for specific criteria.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedLog && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s ease-out' }} onClick={() => setSelectedLog(null)}>
                    <div style={{ backgroundColor: 'var(--card-bg)', width: '80%', maxWidth: '800px', maxHeight: '80vh', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Raw JSON Data</h3>
                            <button onClick={() => setSelectedLog(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
                        </div>
                        <div style={{ padding: '20px', overflowY: 'auto' }}>
                            <pre style={{ margin: 0, color: '#10b981', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontFamily: 'monospace' }}>
                                {JSON.stringify(selectedLog, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LogSearch;
