import React, { useState, useEffect } from 'react';
import { BrainCircuit, Play, Clock, Search, ShieldAlert, Cpu, RefreshCw, Layers } from 'lucide-react';
import api, { agentService } from '../services/api';

const AIAnalysis: React.FC = () => {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchGlobalInsights();
    agentService.getAgents().then(list => {
      setAgents(list);
      if (list.length > 0) setSelectedAgent(list[0].name || list[0]);
    });

    const interval = setInterval(fetchGlobalInsights, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, []);

  const fetchGlobalInsights = async () => {
    try {
      const res = await api.get('/api/ai-insights/all');
      if (res.data.success) {
        setInsights(res.data.results);
      }
    } catch (err) {
      console.error("AI Insights fetch error", err);
    } finally {
      setLoading(false);
    }
  };

  const runManualAnalysis = () => {
    if (!selectedAgent) return;
    setAnalyzing(true);
    agentService.runManualAnalysis(selectedAgent, 100)
      .then((res) => {
        alert(res.message || "Manual analysis queued in background.");
        fetchGlobalInsights();
      })
      .catch(err => {
        console.error("Manual analysis error", err);
        alert("Failed to start manual analysis.");
      })
      .finally(() => setAnalyzing(false));
  };

  const filteredInsights = insights.filter(i => 
    i.agent?.toLowerCase().includes(filter.toLowerCase()) || 
    i.critical_summary?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div style={{ paddingBottom: '60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h2 style={{ fontSize: '2.25rem', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <BrainCircuit size={36} color="var(--accent-secondary)" />
            AI Security Pulse
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
            Continuous real-time log triage powered by <strong>Ollama Local AI</strong>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--accent-success)', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-success)', boxShadow: '0 0 10px var(--accent-success)' }}></div>
            RabbitMQ Worker Active
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) 1fr', gap: '32px', alignItems: 'start' }}>
        
        {/* Main Insights Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={20} />
            <input 
              type="text" 
              placeholder="Search insights by agent or threat..." 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '16px 16px 16px 52px',
                color: 'var(--text-primary)',
                fontSize: '1rem',
                outline: 'none',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                transition: 'border-color 0.2s ease'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent-secondary)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {loading ? (
              <div style={{ padding: '100px', textAlign: 'center' }}>
                <RefreshCw className="animate-spin" size={48} style={{ opacity: 0.1, marginBottom: '20px' }} />
                <p style={{ color: 'var(--text-secondary)' }}>Loading AI Intelligence...</p>
              </div>
            ) : filteredInsights.length > 0 ? (
              filteredInsights.map((insight) => (
                <div key={insight.id} className="card" style={{ 
                  padding: '24px', 
                  borderLeft: '4px solid var(--accent-secondary)', 
                  display: 'flex', 
                  gap: '24px', 
                  alignItems: 'flex-start',
                  backgroundColor: 'rgba(255,255,255,0.01)',
                  transition: 'transform 0.2s ease, background-color 0.2s ease',
                  cursor: 'default'
                }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
                onMouseOut={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.01)'; e.currentTarget.style.transform = 'translateX(0)'; }}
                >
                  <div style={{ padding: '12px', backgroundColor: 'rgba(96, 165, 250, 0.1)', borderRadius: '12px', flexShrink: 0 }}>
                    <ShieldAlert size={28} color="var(--accent-secondary)" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text-primary)' }}>{insight.agent}</span>
                        <span style={{ fontSize: '0.75rem', padding: '4px 10px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '6px', color: 'var(--text-secondary)', fontWeight: 600 }}>{insight.source_file}</span>
                      </div>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                        <Clock size={14} /> {new Date(insight.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p style={{ fontSize: '1.0625rem', color: 'var(--text-primary)', lineHeight: 1.6, fontWeight: 500 }}>
                      {insight.critical_summary}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '100px 0', border: '2px dashed var(--border-color)', borderRadius: '24px' }}>
                <Layers size={64} style={{ opacity: 0.1, marginBottom: '24px' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>No Insights Found</h3>
                <p style={{ color: 'var(--text-secondary)' }}>System is monitoring. Automatic analysis will appear here.</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Cpu size={18} /> Manual Scanner
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
              Force a manual scan on a specific agent to backfill missing analysis.
            </p>
            
            <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>Target Agent</label>
            <select 
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-color)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '12px',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                outline: 'none',
                marginBottom: '20px',
                cursor: 'pointer'
              }}
            >
              {agents.map(a => (
                <option key={typeof a === 'string' ? a : a.name} value={typeof a === 'string' ? a : a.name}>
                  {typeof a === 'string' ? a : a.name}
                </option>
              ))}
            </select>
            
            <button 
              onClick={runManualAnalysis}
              disabled={analyzing || !selectedAgent}
              style={{
                width: '100%',
                backgroundColor: analyzing ? 'var(--border-color)' : 'var(--accent-secondary)',
                color: 'white',
                padding: '14px',
                borderRadius: '10px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: analyzing ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={e => !analyzing && (e.currentTarget.style.filter = 'brightness(1.1)')}
              onMouseOut={e => !analyzing && (e.currentTarget.style.filter = 'brightness(1)')}
            >
              {analyzing ? <RefreshCw size={18} className="animate-spin" /> : <Play size={18} />}
              {analyzing ? 'Processing...' : 'Start Manual Scan'}
            </button>
          </div>

          <div className="card" style={{ padding: '24px', backgroundColor: 'rgba(96, 165, 250, 0.03)' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '12px' }}>System Stats</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total Insights</span>
                <span style={{ fontWeight: 700 }}>{insights.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Agents Covered</span>
                <span style={{ fontWeight: 700 }}>{agents.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAnalysis;
