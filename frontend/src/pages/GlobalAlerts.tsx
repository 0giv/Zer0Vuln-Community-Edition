import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Search, 
  Filter, 
  Download, 
  ExternalLink, 
  Clock, 
  Monitor,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Brain,
  RefreshCw
} from 'lucide-react';
import { agentService } from '../services/api';

import Fuse from 'fuse.js';

const GlobalAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchSource] = useState('');
  const [searchMode, setSearchMode] = useState('fuzzy');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000); // Auto refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const fetchAlerts = async () => {
    try {
      const data = await agentService.getAllAlerts();
      setAlerts(data);
    } catch (err) {
      console.error("Failed to fetch global alerts", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredAlerts.map((_, i) => i)); // Using index as ID since raw alerts might lack unique ID in this view
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (index: number) => {
    setSelectedIds(prev => 
      prev.includes(index) ? prev.filter(id => id !== index) : [...prev, index]
    );
  };

  const runAIAnalysisOnSelected = async () => {
    if (selectedIds.length === 0) return;
    setAnalyzing(true);
    
    // Group selected alerts by agent to send batch requests
    const selectedAlerts = selectedIds.map(idx => filteredAlerts[idx]);
    const agents = Array.from(new Set(selectedAlerts.map(a => a.agent)));

    try {
      for (const agent of agents) {
        const agentLogs = selectedAlerts
          .filter(a => a.agent === agent)
          .map(a => ({ table: 'events_alert', data: a }));
        
        await agentService.analyzeSelected(agent, agentLogs);
      }
      alert(`Successfully queued ${selectedIds.length} alerts for AI analysis.`);
      setSelectedIds([]);
    } catch (err) {
      console.error("AI Analysis error", err);
      alert("Failed to queue AI analysis.");
    } finally {
      setAnalyzing(false);
    }
  };

  const filteredAlerts = React.useMemo(() => {
    let result = alerts;

    if (searchTerm) {
      const fuse = new Fuse(result, {
        keys: ['source', 'message', 'agent'],
        threshold: 0.2, // Tighter threshold
        ignoreLocation: true,
        useExtendedSearch: true // Enable advanced prefixes
      });
      
      let query = searchTerm;
      if (searchMode === 'exact') query = `="${searchTerm}"`;
      else if (searchMode === 'exclude') query = `!${searchTerm}`;
      else if (searchMode === 'prefix') query = `^${searchTerm}`;

      result = fuse.search(query).map(r => r.item);
    }

    if (severityFilter !== 'ALL') {
      result = result.filter(alert => alert.severity === severityFilter);
    }

    return result;
  }, [alerts, searchTerm, severityFilter, searchMode]);

  const stats = {
    critical: alerts.filter(a => a.severity === 'CRITICAL').length,
    high: alerts.filter(a => a.severity === 'HIGH').length,
    medium: alerts.filter(a => a.severity === 'MEDIUM').length,
    low: alerts.filter(a => a.severity === 'LOW').length
  };

  return (
    <div>
      <div className="flex-responsive" style={{ justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <h2 style={{ fontSize: '1.875rem', marginBottom: '8px' }}>Global Security Alerts</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Centralized monitoring of all critical security events across the enterprise.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-secondary" style={{ padding: '10px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Severity Stats */}
      <div className="responsive-grid" style={{ marginBottom: '32px' }}>
        <SeverityStat label="CRITICAL" count={stats.critical} color="var(--accent-color)" icon={<XCircle size={20} />} />
        <SeverityStat label="HIGH" count={stats.high} color="#f97316" icon={<AlertTriangle size={20} />} />
        <SeverityStat label="MEDIUM" count={stats.medium} color="var(--accent-warning)" icon={<AlertCircle size={20} />} />
        <SeverityStat label="LOW" count={stats.low} color="var(--accent-secondary)" icon={<CheckCircle2 size={20} />} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Filters Bar */}
        <div className="flex-responsive" style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', gap: '8px', flex: 1, maxWidth: '600px' }}>
            <select
              value={searchMode}
              onChange={(e) => setSearchMode(e.target.value)}
              style={{ backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px', fontSize: '0.875rem', color: 'white', cursor: 'pointer', outline: 'none' }}
            >
              <option value="fuzzy">Fuzzy</option>
              <option value="exact">Exact Match</option>
              <option value="exclude">Exclude</option>
              <option value="prefix">Starts With</option>
            </select>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                placeholder="Search by agent, source, or message..." 
                value={searchTerm}
                onChange={e => setSearchSource(e.target.value)}
                style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px 10px 40px', color: 'white', outline: 'none', fontFamily: 'Fira Code' }} 
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {selectedIds.length > 0 && (
              <button 
                onClick={runAIAnalysisOnSelected}
                disabled={analyzing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'var(--accent-secondary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: analyzing ? 'not-allowed' : 'pointer',
                  boxShadow: '0 0 15px rgba(96, 165, 250, 0.3)'
                }}
              >
                {analyzing ? <RefreshCw size={16} className="animate-spin" /> : <Brain size={16} />}
                Analyze {selectedIds.length} with AI
              </button>
            )}
            <Filter size={18} color="var(--text-secondary)" />
            <select 
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              style={{ backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', color: 'white', outline: 'none' }}
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical Only</option>
              <option value="HIGH">High Only</option>
              <option value="MEDIUM">Medium Only</option>
              <option value="LOW">Low Only</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '14px 20px', width: '40px' }}>
                  <input 
                    type="checkbox" 
                    onChange={handleSelectAll} 
                    checked={selectedIds.length === filteredAlerts.length && filteredAlerts.length > 0} 
                  />
                </th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Severity</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Timestamp</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Agent</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Source</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Alert Message</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.map((alert, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s ease', backgroundColor: selectedIds.includes(i) ? 'rgba(96, 165, 250, 0.05)' : 'transparent' }} onMouseOver={e => !selectedIds.includes(i) && (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.01)')} onMouseOut={e => !selectedIds.includes(i) && (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <td style={{ padding: '16px 20px' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(i)} 
                      onChange={() => handleSelectRow(i)} 
                    />
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div className="mono" style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      backgroundColor: 'transparent',
                      color: alert.severity === 'CRITICAL' ? 'var(--accent-color)' : 'var(--text-secondary)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      border: 'none',
                      textTransform: 'uppercase'
                    }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: alert.severity === 'CRITICAL' ? 'var(--accent-color)' : 'var(--text-secondary)' }}></div>
                      {alert.severity}
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={14} /> {alert.timestamp}
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Monitor size={14} color="var(--accent-secondary)" />
                      {alert.agent}
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>{alert.source}</td>
                  <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{alert.message}</td>
                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                    <button title="View Details" style={{ color: 'var(--accent-secondary)' }}><ExternalLink size={18} /></button>
                  </td>
                </tr>
              ))}
              {filteredAlerts.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} style={{ padding: '80px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <ShieldAlert size={48} style={{ opacity: 0.1, marginBottom: '16px', margin: '0 auto' }} />
                    <p>No security alerts found matching your filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SeverityStat: React.FC<{ label: string, count: number, color: string, icon: React.ReactNode }> = ({ label, count, color, icon }) => (
  <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
    <div style={{ color }}>{icon}</div>
    <div>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div className="mono" style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{count}</div>
    </div>
  </div>
);

export default GlobalAlerts;
