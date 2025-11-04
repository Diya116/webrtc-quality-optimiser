import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Users,
  MonitorUp,
} from 'lucide-react';
import socketService from '../Services/socketService';
import VideoTile from './VideoTitle';
import {type Participant } from '../types';
import {
  getLocalStream,
  stopLocalStream,
  handleNewPeer,
  handleOffer,
  handleAnswer,
  handleIceCandidate,
  toggleAudio as toggleAudioTrack,
  toggleVideo as toggleVideoTrack,
  closeAllConnections,
  startScreenShare,
  stopScreenShare,
} from '../utils/webrtc';
import './MeetingRoom.css';

const MeetingRoom: React.FC = () => {
  const { meetingId } = useParams<{ meetingId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [participants, setParticipants] = useState<Map<string, Participant>>(
    new Map()
  );
  const [localParticipant, setLocalParticipant] = useState<Participant | null>(
    null
  );
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showParticipantsList, setShowParticipantsList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(true);

  const socketRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Initialize and join meeting
  useEffect(() => {
    const initMeeting = async () => {
      try {
        // Get display name
        const displayName =
          location.state?.displayName ||
          localStorage.getItem('displayName') ||
          'Guest User';

        // Get or create token
        let token = localStorage.getItem('token');
        if (!token) {
          token = `guest_${Date.now()}`;
          localStorage.setItem('token', token);
        }

        // Get local media stream
        console.log('🎥 Getting local media stream...');
        const stream = await getLocalStream(true, true);
        
        if (!stream) {
          setError('Failed to access camera/microphone. Please check permissions.');
          setIsJoining(false);
          return;
        }


        // Set local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Connect to signaling server
        console.log('🔌 Connecting to signaling server...');
        const socket = socketService.connect(token);
        socketRef.current = socket;

        // Setup socket listeners
        setupSocketListeners(socket, stream);

        // Join meeting
        console.log(`📞 Joining meeting ${meetingId}...`);
        socket.emit('join-meeting', {
          meetingId,
          displayName,
        });
      } catch (err: any) {
        console.error('❌ Error initializing meeting:', err);
        setError(err.message || 'Failed to join meeting');
        setIsJoining(false);
      }
    };

    if (meetingId) {
      initMeeting();
    }

    // Cleanup on unmount
    return () => {
      console.log('🧹 Cleaning up meeting room...');
      socketService.emit('leave-meeting');
      socketService.disconnect();
      stopLocalStream();
      closeAllConnections();
    };
  }, [meetingId]);

  // Setup socket event listeners
  const setupSocketListeners = useCallback(
    (socket: any, stream: MediaStream) => {
      // Successfully joined meeting
      socket.on('joined-meeting', (data: any) => {
        console.log('✅ Successfully joined meeting:', data);
        setIsJoining(false);

        // Set local participant
        const local: Participant = {
          socketId: data.participant.socketId,
          userId: data.participant.userId,
          displayName: data.participant.displayName,
          isHost: data.participant.isHost,
          audioEnabled: true,
          videoEnabled: true,
          screenShareEnabled: false,
          stream: stream,
        };
        setLocalParticipant(local);

        // Add existing participants
        const newParticipants = new Map<string, Participant>();
        data.participants.forEach((p: any) => {
          newParticipants.set(p.socketId, {
            ...p,
            stream: undefined,
          });

          // Create WebRTC connection for existing participant (pass local stream)
          handleNewPeer(p.socketId, socket, handleRemoteStream, stream);
        });
        setParticipants(newParticipants);
      });

      // New participant joined
      socket.on('participant-joined', (data: any) => {
        console.log('👋 New participant joined:', data.participant.displayName);

        setParticipants((prev) => {
          const newMap = new Map(prev);
          newMap.set(data.participant.socketId, {
            ...data.participant,
            stream: undefined,
          });
          return newMap;
        });

    // Create WebRTC connection for new participant (pass local stream)
    handleNewPeer(data.participant.socketId, socket, handleRemoteStream, stream);
      });

      // Participant left
      socket.on('participant-left', (data: any) => {
        console.log('👋 Participant left:', data.socketId);

        setParticipants((prev) => {
          const newMap = new Map(prev);
          newMap.delete(data.socketId);
          return newMap;
        });
      });

      // Participant media changed
      socket.on('participant-media-changed', (data: any) => {
        console.log('🎬 Participant media changed:', data);

        setParticipants((prev) => {
          const newMap = new Map(prev);
          const participant = newMap.get(data.socketId);

          if (participant) {
            newMap.set(data.socketId, {
              ...participant,
              audioEnabled: data.audioEnabled ?? participant.audioEnabled,
              videoEnabled: data.videoEnabled ?? participant.videoEnabled,
              screenShareEnabled:
                data.screenShareEnabled ?? participant.screenShareEnabled,
            });
          }

          return newMap;
        });
      });

      // WebRTC Signaling Events
      socket.on('offer', (data: any) => {
        console.log('📥 Received offer from:', data.from);
        // Pass local stream so we can attach local tracks when creating answer
        handleOffer(data, socket, handleRemoteStream, stream);
      });

      socket.on('answer', (data: any) => {
        console.log('📥 Received answer from:', data.from);
        handleAnswer(data);
      });

      socket.on('ice-candidate', (data: any) => {
        console.log('🧊 Received ICE candidate from:', data.from);
        handleIceCandidate(data);
      });

      // Error
      socket.on('error', (data: any) => {
        console.error('❌ Socket error:', data);
        setError(data.message || 'An error occurred');
      });
    },
    []
  );

  // Handle remote stream
  const handleRemoteStream = useCallback(
    (peerId: string, stream: MediaStream) => {
      console.log('📺 Setting remote stream for peer:', peerId);

      setParticipants((prev) => {
        const newMap = new Map(prev);
        const participant = newMap.get(peerId);

        if (participant) {
          newMap.set(peerId, {
            ...participant,
            stream: stream,
          });
        }

        return newMap;
      });
    },
    []
  );

  // Toggle audio
  const handleToggleAudio = () => {
    const newState = !audioEnabled;
    setAudioEnabled(newState);
    toggleAudioTrack(newState);
    socketService.emit('toggle-audio', { enabled: newState });

    if (localParticipant) {
      setLocalParticipant({
        ...localParticipant,
        audioEnabled: newState,
      });
    }
  };

  // Toggle video
  const handleToggleVideo = () => {
    const newState = !videoEnabled;
    setVideoEnabled(newState);
    toggleVideoTrack(newState);
    socketService.emit('toggle-video', { enabled: newState });

    if (localParticipant) {
      setLocalParticipant({
        ...localParticipant,
        videoEnabled: newState,
      });
    }
  };

  // Toggle screen share
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
      setIsScreenSharing(false);
      socketService.emit('toggle-screen-share', { enabled: false });
    } else {
      const screenStream = await startScreenShare();
      if (screenStream) {
        setIsScreenSharing(true);
        socketService.emit('toggle-screen-share', { enabled: true });
      }
    }
  };

  // Leave meeting
  const handleLeaveMeeting = () => {
    socketService.emit('leave-meeting');
    socketService.disconnect();
    stopLocalStream();
    closeAllConnections();
    navigate('/');
  };

  if (error) {
    return (
      <div className="meeting-error">
        <div className="error-content">
          <h2>Unable to Join Meeting</h2>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (isJoining) {
    return (
      <div className="meeting-loading">
        <div className="loading-spinner"></div>
        <p>Joining meeting...</p>
      </div>
    );
  }

  return (
    <div className="meeting-room">
      {/* Header */}
      <header className="meeting-header">
        <div className="meeting-info">
          <h3>Meeting: {meetingId}</h3>
          <span className="participant-count">
            <Users size={16} />
            {participants.size + 1} participant
            {participants.size !== 0 ? 's' : ''}
          </span>
        </div>

        <button
          className="btn-participants"
          onClick={() => setShowParticipantsList(!showParticipantsList)}
        >
          <Users size={20} />
          Participants
        </button>
      </header>

      {/* Video Grid */}
      <div className="video-grid-container">
        <div
          className={`video-grid ${
            participants.size + 1 === 1
              ? 'grid-1'
              : participants.size + 1 === 2
              ? 'grid-2'
              : participants.size + 1 <= 4
              ? 'grid-4'
              : 'grid-many'
          }`}
        >
          {/* Local video */}
          {localParticipant && (
            <div className="video-tile">
              {videoEnabled && localParticipant?.stream ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="video-element"
                />
              ) : (
                <div className="video-placeholder">
                  <div className="avatar">
                    {localParticipant.displayName.charAt(0).toUpperCase()}
                  </div>
                </div>
              )}
              <div className="video-info">
                <span className="participant-name">
                  {localParticipant.displayName} (You)
                </span>
                <div className="media-indicators">
                  {!audioEnabled && (
                    <div className="indicator muted">
                      <MicOff size={16} />
                    </div>
                  )}
                  {!videoEnabled && (
                    <div className="indicator video-off">
                      <VideoOff size={16} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Remote videos */}
          {Array.from(participants.values()).map((participant) => (
            <VideoTile key={participant.socketId} participant={participant} />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="meeting-controls">
        <div className="controls-group">
          <button
            className={`control-btn ${!audioEnabled ? 'disabled' : ''}`}
            onClick={handleToggleAudio}
            title={audioEnabled ? 'Mute' : 'Unmute'}
          >
            {audioEnabled ? <Mic size={24} /> : <MicOff size={24} />}
          </button>

          <button
            className={`control-btn ${!videoEnabled ? 'disabled' : ''}`}
            onClick={handleToggleVideo}
            title={videoEnabled ? 'Stop Video' : 'Start Video'}
          >
            {videoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
          </button>

          <button
            className={`control-btn ${isScreenSharing ? 'active' : ''}`}
            onClick={handleToggleScreenShare}
            title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
          >
            <MonitorUp size={24} />
          </button>

          <button
            className="control-btn leave-btn"
            onClick={handleLeaveMeeting}
            title="Leave Meeting"
          >
            <PhoneOff size={24} />
          </button>
        </div>
      </div>

      {/* Participants List Sidebar */}
      {showParticipantsList && (
        <div className="participants-sidebar">
          <div className="sidebar-header">
            <h3>Participants ({participants.size + 1})</h3>
            <button
              className="close-sidebar"
              onClick={() => setShowParticipantsList(false)}
            >
              ×
            </button>
          </div>

          <div className="participants-list">
            {/* Local participant */}
            {localParticipant && (
              <div className="participant-item">
                <div className="participant-avatar">
                  {localParticipant.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="participant-details">
                  <span className="participant-name">
                    {localParticipant.displayName} (You)
                  </span>
                  <div className="participant-status">
                    {localParticipant.isHost && (
                      <span className="host-badge">Host</span>
                    )}
                    {!audioEnabled && <MicOff size={14} color="#ef4444" />}
                    {!videoEnabled && <VideoOff size={14} color="#f97316" />}
                  </div>
                </div>
              </div>
            )}

            {/* Remote participants */}
            {Array.from(participants.values()).map((participant) => (
              <div key={participant.socketId} className="participant-item">
                <div className="participant-avatar">
                  {participant.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="participant-details">
                  <span className="participant-name">
                    {participant.displayName}
                  </span>
                  <div className="participant-status">
                    {participant.isHost && (
                      <span className="host-badge">Host</span>
                    )}
                    {!participant.audioEnabled && (
                      <MicOff size={14} color="#ef4444" />
                    )}
                    {!participant.videoEnabled && (
                      <VideoOff size={14} color="#f97316" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingRoom;