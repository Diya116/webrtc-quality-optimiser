import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Modal.css';

interface JoinMeetingProps {
  onClose: () => void;
}

const JoinMeeting: React.FC<JoinMeetingProps> = ({ onClose }) => {
  const [meetingId, setMeetingId] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleJoinMeeting = (e: React.FormEvent) => {
    e.preventDefault();

    if (!meetingId.trim()) {
      setError('Please enter a meeting ID');
      return;
    }

    if (user) {
      // Use authenticated user's name
      localStorage.setItem('displayName', user.name);
      navigate(`/meeting/${meetingId}`, { state: { displayName: user.name } });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={24} />
        </button>

        <h2>Join Meeting</h2>
        
        <form onSubmit={handleJoinMeeting}>
          <div className="form-group">
            <label>Meeting ID</label>
            <input
              type="text"
              placeholder="Enter meeting ID"
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value.toUpperCase())}
              autoFocus
            />
          </div>

          <div className="user-info-display">
            <p>Joining as: <strong>{user?.name}</strong></p>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="btn btn-primary">
            Join Meeting
          </button>
        </form>
      </div>
    </div>
  );
};

export default JoinMeeting;