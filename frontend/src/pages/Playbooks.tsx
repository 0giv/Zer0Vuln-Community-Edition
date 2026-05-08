import React, { useEffect, useState } from 'react';
import { 
  PlaySquare, 
  Play, 
  Plus, 
  Trash2, 
  CheckCircle2,
  AlertCircle,
  Clock,
  Edit2,
  X,
  Save,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Server
} from 'lucide-react';
import api, { agentService } from '../services/api';

interface PlaybookNode {
  id: string;
  type: string;
  data: {
    action: string;
    params: {
      target?: string;
      [key: string]: any;
    }
  }
}

const Playbooks: React.FC = () => {
  const [agents, setAgents] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    nodes: PlaybookNode[];
  }>({
    name: '',
    description: '',
    nodes: []
  });

  useEffect(() => {
    agentService.getAgents().then((list: any[]) => {
      const agentNames = list.map(item => typeof item === 'string' ? item : item.name);
      setAgents(agentNames);
      if (agentNames.length > 0) setSelectedAgent(agentNames[0]);
    });
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      fetchData();
    }
  }, [selectedAgent]);

  const fetchData = async () => {
    if (!selectedAgent) return;
    setLoading(true);
    try {
      const [pbList, runList] = await Promise.all([
        agentService.getPlaybooks(selectedAgent),
        agentService.getPlaybookRuns(selectedAgent)
      ]);
      setPlaybooks(pbList);
      setRuns(runList);
    } finally {
      setLoading(false);
    }
  };

  const handleRunPlaybook = async (pbId: number) => {
    if (!selectedAgent) return;
    setRunningId(pbId);
    try {
      await api.post(`/${selectedAgent}/playbooks/${pbId}/run`);
      await fetchData();
      setTimeout(fetchData, 2500);
    } catch (err) {
      console.error('Failed to run playbook:', err);
    } finally {
      setRunningId(null);
    }
  };

  const handleDeletePlaybook = async (pbId: number) => {
    if (!selectedAgent) return;
    if (window.confirm("Are you sure you want to delete this playbook?")) {
      try {
        await api.delete(`/${selectedAgent}/playbooks/${pbId}`);
        fetchData();
      } catch (err) {
        console.error('Failed to delete playbook:', err);
      }
    }
  };

  const handleOpenCreate = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({
      name: '',
      description: 'A new security playbook',
      nodes: [
        { id: `node_${Date.now()}`, type: 'action', data: { action: 'block_ip', params: { target: '' } } }
      ]
    });
    setShowModal(true);
  };

  const handleOpenEdit = (pb: any) => {
    setIsEditing(true);
    setEditingId(pb.id);
    setFormData({
      name: pb.name,
      description: pb.description || '',
      nodes: pb.nodes || []
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent) return;
    try {
      // Auto-generate linear connections from top format
      const connections = [];
      for (let i = 0; i < formData.nodes.length - 1; i++) {
        connections.push({
          source: formData.nodes[i].id,
          target: formData.nodes[i+1].id
        });
      }

      const payload = {
        name: formData.name,
        description: formData.description,
        nodes: formData.nodes,
        connections: connections
      };

      if (isEditing && editingId) {
        await agentService.updatePlaybook(selectedAgent, editingId, payload);
      } else {
        await agentService.createPlaybook(selectedAgent, payload);
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      alert("Error saving playbook: " + (err.response?.data?.error || err.message));
    }
  };

  const handleAddNode = () => {
    const newNode: PlaybookNode = {
      id: `node_${Date.now()}`,
      type: 'action',
      data: { action: 'block_ip', params: { target: '' } }
    };
    setFormData({ ...formData, nodes: [...formData.nodes, newNode] });
  };

  const handleUpdateNode = (index: number, field: string, value: string) => {
    const updatedNodes = [...formData.nodes];
    if (field === 'action') {
      updatedNodes[index].data.action = value;
    } else {
      updatedNodes[index].data.params[field] = value;
    }
    setFormData({ ...formData, nodes: updatedNodes });
  };

  const handleRemoveNode = (index: number) => {
    const updatedNodes = [...formData.nodes];
    updatedNodes.splice(index, 1);
    setFormData({ ...formData, nodes: updatedNodes });
  };

  const handleMoveNode = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === formData.nodes.length - 1) return;
    
    const updatedNodes = [...formData.nodes];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [updatedNodes[index], updatedNodes[targetIndex]] = [updatedNodes[targetIndex], updatedNodes[index]];
    setFormData({ ...formData, nodes: updatedNodes });
  };

  const availableActions = [
    { value: 'block_ip', label: 'Block IP Address', param: 'target', paramLabel: 'Target IP' },
    { value: 'unblock_ip', label: 'Unblock IP Address', param: 'target', paramLabel: 'Target IP' },
    { value: 'disable_user', label: 'Disable User Account', param: 'target', paramLabel: 'Username' },
    { value: 'enable_user', label: 'Enable User Account', param: 'target', paramLabel: 'Username' },
    { value: 'quarantine_file', label: 'Quarantine File', param: 'target', paramLabel: 'File Path' },
    { value: 'delete_file', label: 'Delete File', param: 'target', paramLabel: 'File Path' },
    { value: 'kill_process', label: 'Kill Process', param: 'target', paramLabel: 'PID or Name' },
    { value: 'suspend_process', label: 'Suspend Process (Dondur)', param: 'target', paramLabel: 'PID or Name' },
    { value: 'delete_registry_key', label: 'Delete Registry Key', param: 'target', paramLabel: 'Registry Path' },
    { value: 'protect_shadows', label: 'Protect Volume Shadows (VSS)', param: '', paramLabel: '' },
    { value: 'restart_service', label: 'Restart Service', param: 'target', paramLabel: 'Service Name' },
    { value: 'isolate_host', label: 'Isolate Host from Network', param: '', paramLabel: '' },
    { value: 'lock_machine', label: 'Lock Machine', param: '', paramLabel: '' },
    { value: 'flush_dns', label: 'Flush DNS Cache', param: '', paramLabel: '' },
    { value: 'clear_temp', label: 'Clear Temp Folders', param: '', paramLabel: '' },
    { value: 'logoff_user', label: 'Logoff User', param: 'target', paramLabel: 'Session ID' },
    { value: 'run_cmd', label: 'Run Custom Command', param: 'target', paramLabel: 'Command' }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h2 style={{ fontSize: '1.875rem', marginBottom: '8px' }}>Security Playbooks</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Automated incident response workflows and threat hunting scripts.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select 
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            style={{
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '10px 16px',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none'
            }}
          >
            {agents.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button 
            onClick={handleOpenCreate}
            disabled={!selectedAgent}
            style={{ 
              backgroundColor: !selectedAgent ? 'var(--border-color)' : 'var(--accent-secondary)', 
              color: 'white', 
              padding: '10px 20px', 
              borderRadius: '8px', 
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: !selectedAgent ? 'not-allowed' : 'pointer'
            }}
          >
            <Plus size={18} /> New Playbook
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '32px' }}>
        <div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.125rem' }}>Active Playbooks</h3>
              <button onClick={fetchData} style={{ color: 'var(--text-secondary)' }}><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {playbooks.map((pb, i) => (
                <div key={pb.id || i} style={{ 
                  padding: '24px', 
                  borderBottom: i < playbooks.length - 1 ? '1px solid var(--border-color)' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.01)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <PlaySquare color="var(--accent-secondary)" />
                    </div>
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px' }}>{pb.name || 'Unnamed Playbook'}</h4>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={12} /> Updated: {pb.updated_at}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                      onClick={() => handleRunPlaybook(pb.id)}
                      disabled={runningId === pb.id}
                      style={{ padding: '8px 16px', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-success)', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: runningId === pb.id ? 'not-allowed' : 'pointer', opacity: runningId === pb.id ? 0.5 : 1 }}
                    >
                      <Play size={14} /> {runningId === pb.id ? 'RUNNING...' : 'RUN'}
                    </button>
                    <button onClick={() => handleOpenEdit(pb)} style={{ padding: '8px', color: 'var(--text-secondary)' }}><Edit2 size={18} /></button>
                    <button onClick={() => handleDeletePlaybook(pb.id)} style={{ padding: '8px', color: 'var(--accent-color)', cursor: 'pointer' }}><Trash2 size={18} /></button>
                  </div>
                </div>
              ))}
              {playbooks.length === 0 && !loading && (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <PlaySquare size={48} style={{ opacity: 0.1, marginBottom: '16px', margin: '0 auto' }} />
                  <p>No playbooks found for this agent.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: '1.125rem' }}>Recent Executions</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {runs.map((run, i) => (
                <div key={run.id || i} style={{ padding: '16px 20px', borderBottom: i < runs.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{run.playbook_name || `Run #${run.id}`}</span>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '4px',
                      color: run.status === 'success' || run.status === 'completed' ? 'var(--accent-success)' : 'var(--accent-color)',
                      textTransform: 'uppercase',
                      fontWeight: 600
                    }}>
                      {run.status === 'success' || run.status === 'completed' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                      {run.status || 'COMPLETED'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <span>{run.started_at || 'Just now'}</span>
                    <span>#{run.id}</span>
                  </div>
                </div>
              ))}
              {runs.length === 0 && (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <p style={{ fontSize: '0.875rem' }}>No recent executions.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Playbook Edit/Create Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '40px', backdropFilter: 'blur(8px)' }}>
          <div style={{ backgroundColor: 'var(--card-bg)', backdropFilter: 'blur(24px)', width: '100%', maxWidth: '800px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-neon)', display: 'flex', flexDirection: 'column', maxHeight: '90vh', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.25rem' }}>{isEditing ? 'Edit Playbook' : 'Create New Playbook'}</h3>
              <button onClick={() => setShowModal(false)} style={{ color: 'var(--text-secondary)' }}><X size={24} /></button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ padding: '32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Playbook Name</label>
                  <input 
                    type="text" 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    required 
                    style={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px', color: 'white' }} 
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Description</label>
                  <input 
                    type="text" 
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})} 
                    style={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px', color: 'white' }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Action Steps</label>
                  <button type="button" onClick={handleAddNode} style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-secondary)', padding: '6px 12px', borderRadius: '6px', fontWeight: 600 }}>
                    <Plus size={14} /> Add Step
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: 'rgba(0,0,0,0.1)', padding: '16px', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                  {formData.nodes.map((node, index) => {
                    const actionInfo = availableActions.find(a => a.value === node.data.action) || availableActions[0];
                    return (
                      <div key={node.id} style={{ display: 'flex', gap: '12px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px', alignItems: 'flex-start', position: 'relative' }}>
                        
                        {/* Ordering Controls */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <button type="button" onClick={() => handleMoveNode(index, 'up')} disabled={index === 0} style={{ color: index === 0 ? 'var(--bg-color)' : 'var(--text-secondary)' }}>
                            <ArrowUp size={16} />
                          </button>
                          <div style={{ width: '24px', height: '24px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, margin: '4px 0' }}>
                            {index + 1}
                          </div>
                          <button type="button" onClick={() => handleMoveNode(index, 'down')} disabled={index === formData.nodes.length - 1} style={{ color: index === formData.nodes.length - 1 ? 'var(--bg-color)' : 'var(--text-secondary)' }}>
                            <ArrowDown size={16} />
                          </button>
                        </div>

                        {/* Action Configuration */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ flex: 1 }}>
                              <select 
                                value={node.data.action}
                                onChange={e => handleUpdateNode(index, 'action', e.target.value)}
                                style={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '8px', color: 'white', width: '100%', fontSize: '0.875rem' }}
                              >
                                {availableActions.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                              </select>
                            </div>
                            <button type="button" onClick={() => handleRemoveNode(index)} style={{ padding: '8px', color: 'var(--accent-color)', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                          
                          {actionInfo.param && (
                            <div>
                              <input 
                                type="text" 
                                value={node.data.params[actionInfo.param] || ''}
                                onChange={e => handleUpdateNode(index, actionInfo.param, e.target.value)}
                                placeholder={actionInfo.paramLabel}
                                required
                                style={{ backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', padding: '10px 12px', borderRadius: '8px', color: 'white', width: '100%', fontSize: '0.875rem' }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {formData.nodes.length === 0 && (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                      <Server size={32} style={{ opacity: 0.1, margin: '0 auto 12px auto' }} />
                      No actions defined yet. Click "Add Step" to begin building your playbook.
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'white', fontWeight: 600 }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '14px', borderRadius: '8px', backgroundColor: 'var(--accent-secondary)', color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Save size={18} /> {isEditing ? 'Update Playbook' : 'Create Playbook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Playbooks;
