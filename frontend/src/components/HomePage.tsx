import React, { useState } from 'react';
import { Video, Users, LogOut, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import CreateMeeting from './CreateMeeting';
import JoinMeeting from './JoinMeeting';
import './HomePage.css';

const HomePage: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const { user, logout } = useAuth();

  return (
    <div className="home-page">
      <div className="home-container">
        {/* User info and logout */}
        <div className="user-info-bar">
          <div className="user-details">
            <div className="user-avatar">
              <User size={20} />
            </div>
            <div className="user-text">
              <span className="user-name">{user?.name}</span>
              <span className="user-email">{user?.email}</span>
            </div>
          </div>
          <button className="btn-logout" onClick={logout} title="Logout">
            <LogOut size={20} />
            Logout
          </button>
        </div>

        <header className="home-header">
          <Video size={48} className="logo-icon" />
          <h1>Video Conference</h1>
          <p>Connect with anyone, anywhere</p>
        </header>

        <div className="action-cards">
          <div
            className="action-card"
            onClick={() => setShowCreateModal(true)}
          >
            <div className="card-icon">
              <Video size={32} />
            </div>
            <h2>Create Meeting</h2>
            <p>Start a new video conference and invite others</p>
          </div>

          <div
            className="action-card"
            onClick={() => setShowJoinModal(true)}
          >
            <div className="card-icon">
              <Users size={32} />
            </div>
            <h2>Join Meeting</h2>
            <p>Join an existing meeting with a meeting ID</p>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <CreateMeeting onClose={() => setShowCreateModal(false)} />
      )}

      {showJoinModal && (
        <JoinMeeting onClose={() => setShowJoinModal(false)} />
      )}
    </div>
  );
};

export default HomePage;