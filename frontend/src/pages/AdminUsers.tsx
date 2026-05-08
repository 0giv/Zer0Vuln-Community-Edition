import React, { useState, useEffect } from 'react';
import { UserPlus, Shield, Trash2, Key } from 'lucide-react';
import { adminService } from '../services/api';

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [resetUser, setResetUser] = useState<any>(null);
  
  // Form states
  const [newUser, setNewUser] = useState({ username: '', password: '', role: '' });
  const [newRole, setNewRole] = useState({ role_name: '' });
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userData, roleData, permData] = await Promise.all([
        adminService.getUsers(),
        adminService.getRoles(),
        adminService.getPermissions()
      ]);
      setUsers(userData);
      setRoles(roleData);
      setPermissions(permData);
      if (roleData.length > 0 && !newUser.role) {
        setNewUser(prev => ({ ...prev, role: roleData[0].role_name }));
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminService.createUser(newUser);
      setShowUserModal(false);
      setNewUser({ username: '', password: '', role: roles[0]?.role_name || '' });
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to create user");
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (window.confirm("Delete this user?")) {
      try {
        await adminService.deleteUser(id);
        fetchData();
      } catch (err) {
        alert("Failed to delete user");
      }
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;
    try {
      await adminService.resetUserPassword(resetUser.id, newPassword);
      setShowResetModal(false);
      setNewPassword('');
      setResetUser(null);
      alert("Password reset successfully!");
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to reset password");
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminService.createRole(newRole);
      setShowRoleModal(false);
      setNewRole({ role_name: '' });
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to create role");
    }
  };

  const handleDeleteRole = async (id: number) => {
    if (window.confirm("Delete this role?")) {
      try {
        await adminService.deleteRole(id);
        fetchData();
      } catch (err: any) {
        alert(err.response?.data?.message || "Failed to delete role");
      }
    }
  };

  const togglePermission = async (role: any, permName: string) => {
    const currentPerms = Array.isArray(role.permissions) ? role.permissions.map((p: any) => p.name) : [];
    const updatedPerms = currentPerms.includes(permName)
      ? currentPerms.filter((p: string) => p !== permName)
      : [...currentPerms, permName];
    

    try {
      await adminService.updateRolePermissions(role.id, role.role_name, updatedPerms);
      fetchData();
    } catch (err) {
      alert("Failed to update permissions");
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h2 style={{ fontSize: '1.875rem', marginBottom: '8px' }}>Identity & Access</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Manage platform users, assign roles, and configure granular permissions.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => setShowRoleModal(true)}
            style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Shield size={18} /> New Role
          </button>
          <button 
            onClick={() => setShowUserModal(true)}
            style={{ backgroundColor: 'var(--accent-secondary)', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <UserPlus size={18} /> Add User
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
        {/* Users Table */}
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: '1.125rem' }}>Active Users</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>User</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Assigned Role</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Created</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 500 }}>{user.username}</td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: user.role === 'admin' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: user.role === 'admin' ? 'var(--accent-color)' : 'var(--accent-secondary)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                        {user.role}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>{user.created_at || 'N/A'}</td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button onClick={() => { setResetUser(user); setShowResetModal(true); }} title="Reset Password" style={{ color: 'var(--text-secondary)', padding: '6px' }}><Key size={16} /></button>
                        <button onClick={() => handleDeleteUser(user.id)} title="Delete" style={{ color: 'var(--accent-color)', padding: '6px' }} disabled={user.username === 'admin'}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Roles List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={20} color="var(--accent-success)" /> Platform Roles
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {roles.map((role) => (
                <div key={role.id} style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editingRole?.id === role.id ? '12px' : '0' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{role.role_name.toUpperCase()}</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setEditingRole(editingRole?.id === role.id ? null : role)} style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)', fontWeight: 600 }}>
                        {editingRole?.id === role.id ? 'Close' : 'Permissions'}
                      </button>
                      {role.role_name !== 'admin' && (
                        <button onClick={() => handleDeleteRole(role.id)} style={{ color: 'var(--accent-color)' }}><Trash2 size={14} /></button>
                      )}
                    </div>
                  </div>
                  
                  {editingRole?.id === role.id && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginTop: '16px', padding: '12px', backgroundColor: 'var(--bg-color)', borderRadius: '8px' }}>
                      {permissions.map(perm => {
                        const isAssigned = role.permissions.some((p: any) => p.name === perm.name);
                        return (
                          <label key={perm.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.8rem' }}>
                            <input 
                              type="checkbox" 
                              checked={isAssigned} 
                              onChange={() => togglePermission(role, perm.name)}
                              disabled={role.role_name === 'admin'} 
                            />
                            <span style={{ color: isAssigned ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{perm.description || perm.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* User Modal */}
      {showUserModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: 'var(--card-bg)', width: '100%', maxWidth: '400px', borderRadius: '16px', border: '1px solid var(--border-color)', padding: '32px' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>Create New User</h3>
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Username</label>
                <input type="text" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} required style={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px', color: 'white' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Password</label>
                <input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} required style={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px', color: 'white' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Role</label>
                <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} style={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px', color: 'white' }}>
                  {roles.map(r => <option key={r.id} value={r.role_name}>{r.role_name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowUserModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'white' }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: '8px', backgroundColor: 'var(--accent-secondary)', color: 'white', fontWeight: 600 }}>Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: 'var(--card-bg)', width: '100%', maxWidth: '400px', borderRadius: '16px', border: '1px solid var(--border-color)', padding: '32px' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Reset Password</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '24px' }}>Set a new password for <strong>{resetUser?.username}</strong></p>
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} style={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px', color: 'white' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowResetModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'white' }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: '8px', backgroundColor: 'var(--accent-color)', color: 'white', fontWeight: 600 }}>Reset Password</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {showRoleModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: 'var(--card-bg)', width: '100%', maxWidth: '400px', borderRadius: '16px', border: '1px solid var(--border-color)', padding: '32px' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>Create New Role</h3>
            <form onSubmit={handleCreateRole} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Role Name</label>
                <input type="text" value={newRole.role_name} onChange={e => setNewRole({role_name: e.target.value})} required placeholder="e.g. analyst" style={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px', color: 'white' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowRoleModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'white' }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: '8px', backgroundColor: 'var(--accent-secondary)', color: 'white', fontWeight: 600 }}>Create Role</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
