import React, { useState, useEffect } from 'react';
import './SettingsModal.css';
import { saveGithubToken, getGithubToken } from '../utils/electronAPI';

const SettingsModal = ({ isOpen, onClose }) => {
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Carregar token existente quando o modal for aberto
    if (isOpen) {
      loadToken();
    }
  }, [isOpen]);

  const loadToken = async () => {
    try {
      const result = await getGithubToken();
      if (result && result.token) {
        setToken(result.token);
      } else {
        setToken('');
      }
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar token do GitHub:', err);
      setError('Não foi possível carregar as configurações existentes.');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSaveSuccess(false);
      
      await saveGithubToken(token);
      
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (err) {
      console.error('Erro ao salvar token do GitHub:', err);
      setError('Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="settings-modal-overlay">
      <div className="settings-modal">
        <h2>Configurações</h2>
        
        <div className="settings-section">
          <h3>Configurações do GitHub</h3>
          <p className="settings-description">
            Configure seu token de acesso pessoal do GitHub para aumentar os limites de API e
            permitir acesso a repositórios privados.
          </p>
          
          <div className="form-group">
            <label htmlFor="github-token">Token de Acesso do GitHub:</label>
            <input
              type="password"
              id="github-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="token-input"
            />
            <p className="help-text">
              <a 
                href="https://github.com/settings/tokens" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                Criar um novo token
              </a>
              {' '}(permissões necessárias: <code>repo</code>, <code>read:packages</code>)
            </p>
          </div>
          
          {error && <div className="settings-error">{error}</div>}
          {saveSuccess && <div className="settings-success">Configurações salvas com sucesso!</div>}
          
          <div className="settings-actions">
            <button 
              className="cancel-button" 
              onClick={handleCancel}
              disabled={saving}
            >
              Cancelar
            </button>
            <button 
              className="save-button" 
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal; 