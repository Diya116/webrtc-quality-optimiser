import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Copy, Check } from 'lucide-react';
import { meetingAPI } from '../Services/apiService';
import { useAuth } from '../contexts/AuthContext';
import './Modal.css';

interface CreateMeetingProps {
  onClose: () => void;
}

const CreateMeeting: React.FC<CreateMeetingProps> = ({ onClose }) => {
  const [meetingId, setMeetingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  // Auto-generate meeting ID on component mount
  useEffect(() => {
    const createMeeting = async () => {
      try {
        const response = await meetingAPI.createMeeting('Quick Meeting');
        
        if (response.success) {
          setMeetingId(response.data.meeting.meetingId);
        }
      } catch (err: any) {
        console.error('Create meeting error:', err);
        setError(err.response?.data?.error || 'Failed to create meeting');
      } finally {
        setLoading(false);
      }
    };

    createMeeting();
  }, []);

  const handleCopyMeetingId = () => {
    navigator.clipboard.writeText(meetingId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoinMeeting = () => {
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

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Creating meeting...</p>
          </div>
        ) : error ? (
          <>
            <h2>Error</h2>
            <div className="error-message">{error}</div>
            <button className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <>
            <h2>Meeting Created!</h2>
            <p className="success-message">
              Your meeting is ready. Share the Meeting ID with others to invite them.
            </p>

            <div className="meeting-id-box">
              <label>Meeting ID</label>
              <div className="meeting-id-display">
                <code>{meetingId}</code>
                <button
                  className="btn-icon"
                  onClick={handleCopyMeetingId}
                  title="Copy Meeting ID"
                >
                  {copied ? <Check size={20} /> : <Copy size={20} />}
                </button>
              </div>
              <small>Share this ID with others to join</small>
            </div>

            <div className="user-info-display">
              <p>Joining as: <strong>{user?.name}</strong></p>
            </div>

            <button 
              onClick={handleJoinMeeting} 
              className="btn btn-primary"
            >
              Join Meeting
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default CreateMeeting;