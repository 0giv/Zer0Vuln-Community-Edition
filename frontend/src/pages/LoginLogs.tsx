import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Globe, Search } from 'lucide-react';
import { adminService } from '../services/api';

const LoginLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminService.getLoginLogs()
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.875rem', marginBottom: '8px' }}>Access Audit Logs</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Detailed history of all authentication attempts, including local and LDAP logins.</p>
      </div>

      <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.125rem' }}>Login History</h3>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input type="text" placeholder="Filter by user or IP..." style={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 12px 6px 32px', fontSize: '0.75rem', color: 'var(--text-primary)', width: '250px' }} />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Timestamp</th>
                <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Username</th>
                <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Auth Type</th>
                <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>IP Address</th>
                <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={log.id || i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>{log.timestamp}</td>
                  <td style={{ padding: '14px 20px', fontWeight: 600 }}>{log.username}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ 
                      padding: '4px 8px', 
                      borderRadius: '6px', 
                      backgroundColor: 'rgba(255,255,255,0.05)',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase'
                    }}>{log.auth_type}</span>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px',
                      color: log.status === 'success' ? 'var(--accent-success)' : 'var(--accent-color)',
                      fontWeight: 600
                    }}>
                      {log.status === 'success' ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
                      {log.status.toUpperCase()}
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Globe size={14} style={{ opacity: 0.5 }} />
                      {log.ip_address}
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.reason || '-'}</td>
                </tr>
              ))}
              {logs.length === 0 && !loading && (
                <tr><td colSpan={6} style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>No access logs found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LoginLogs;
