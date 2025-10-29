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
  User,
} from 'lucide-react';
import socketService from '../Services/socketService';
import { type Participant } from '../types';
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

// Inline VideoTile component to avoid import issues
const VideoTile: React.FC<{
  participant: Participant;
  isLocal?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}> = ({ participant, isLocal = false, videoRef }) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const ref = videoRef || localVideoRef;

  useEffect(() => {
    console.log(`🎬 VideoTile effect for ${participant.displayName}:`, {
      hasStream: !!participant.stream,
      videoEnabled: participant.videoEnabled,
      audioEnabled: participant.audioEnabled,
      streamTracks: participant.stream?.getTracks().length || 0,
    });
    
    if (ref.current && participant.stream) {
      console.log(`✅ Attaching stream for ${participant.displayName}`);
      ref.current.srcObject = participant.stream;
      
      // Force play for remote videos
      if (!isLocal) {
        ref.current.play().catch((e) => {
          console.warn(`Could not autoplay video for ${participant.displayName}:`, e);
        });
      }
    }
  }, [participant.stream, participant.displayName, isLocal, ref]);

  return (
    <div className="video-tile">
      {participant.videoEnabled && participant.stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={isLocal}
          className="video-element"
        />
      ) : (
        <div className="video-placeholder">
          <div className="avatar">
            {participant.displayName ? (
              participant.displayName.charAt(0).toUpperCase()
            ) : (
              <User size={48} />
            )}
          </div>
        </div>
      )}

      <div className="video-info">
        <span className="participant-name">
          {participant.displayName} {isLocal && '(You)'}
        </span>
        <div className="media-indicators">
          {!participant.audioEnabled && (
            <div className="indicator muted">
              <MicOff size={16} />
            </div>
          )}
          {!participant.videoEnabled && (
            <div className="indicator video-off">
              <VideoOff size={16} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

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
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showParticipantsList, setShowParticipantsList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(true);
  const [localVideoProblem, setLocalVideoProblem] = useState<string | null>(null);

  const socketRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const isInitializedRef = useRef(false);

  // Initialize and join meeting
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const initMeeting = async () => {
      try {
        console.log('🚀 Starting meeting initialization...');
        
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

        // Try to get local media stream
        console.log('🎥 Attempting to get local media stream...');
        let stream: MediaStream | null = null;
        
        try {
          stream = await getLocalStream(true, true);
          console.log('✅ Successfully obtained local stream:', {
            id: stream.id,
            tracks: stream.getTracks().map(t => ({
              kind: t.kind,
              enabled: t.enabled,
              readyState: t.readyState,
            })),
          });
          
          setLocalStream(stream);
          setAudioEnabled(true);
          setVideoEnabled(true);
          
          // Attach to video element immediately
          if (localVideoRef.current && stream) {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.muted = true;
            localVideoRef.current.play().catch(e => 
              console.warn('Local video autoplay failed:', e)
            );
          }
        } catch (e) {
          console.warn('⚠️ Could not get local media stream:', e);
          setAudioEnabled(false);
          setVideoEnabled(false);
          setLocalVideoProblem(
            'Could not access camera/microphone. You can still join to view others.'
          );
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
      if (socketRef.current) {
        socketService.emit('leave-meeting');
        socketService.disconnect();
      }
      stopLocalStream();
      closeAllConnections();
      isInitializedRef.current = false;
    };
  }, [meetingId, location.state?.displayName]);

  // Setup socket event listeners
  const setupSocketListeners = useCallback(
    (socket: any, stream: MediaStream | null) => {
      console.log('📡 Setting up socket listeners...');
      
      // Remove all previous listeners to prevent duplicates
      socket.removeAllListeners('joined-meeting');
      socket.removeAllListeners('participant-joined');
      socket.removeAllListeners('participant-left');
      socket.removeAllListeners('participant-media-changed');
      socket.removeAllListeners('offer');
      socket.removeAllListeners('answer');
      socket.removeAllListeners('ice-candidate');
      socket.removeAllListeners('error');

      // Successfully joined meeting
      socket.on('joined-meeting', (data: any) => {
        console.log('✅ Successfully joined meeting:', {
          meetingId: data.meetingId,
          localParticipant: data.participant,
          participantCount: data.participants.length,
        });
        
        setIsJoining(false);

        // Set local participant
        const local: Participant = {
          socketId: data.participant.socketId,
          userId: data.participant.userId,
          displayName: data.participant.displayName,
          isHost: data.participant.isHost,
          audioEnabled: !!stream && stream.getAudioTracks().some(t => t.enabled),
          videoEnabled: !!stream && stream.getVideoTracks().some(t => t.enabled),
          screenShareEnabled: false,
          stream: stream ?? undefined,
        };
        setLocalParticipant(local);

        // Add existing participants
        const newParticipants = new Map<string, Participant>();
        data.participants.forEach((p: any) => {
          if (p.socketId !== data.participant.socketId) {
            console.log('👤 Adding existing participant:', p.displayName, p.socketId);
            newParticipants.set(p.socketId, {
              ...p,
              stream: undefined,
            });

            // Create WebRTC connection for existing participant
            console.log('🔗 Creating peer connection for:', p.socketId);
            handleNewPeer(p.socketId, socket, handleRemoteStream, stream);
          }
        });
        
        console.log('📊 Total remote participants:', newParticipants.size);
        setParticipants(newParticipants);
      });

      // New participant joined
      socket.on('participant-joined', (data: any) => {
        console.log('👋 New participant joined:', data.participant.displayName, data.participant.socketId);

        setParticipants((prev) => {
          const newMap = new Map(prev);
          if (!newMap.has(data.participant.socketId)) {
            newMap.set(data.participant.socketId, {
              ...data.participant,
              stream: undefined,
            });
          }
          return newMap;
        });

        // Create WebRTC connection for new participant
        console.log('🔗 Creating peer connection for new participant:', data.participant.socketId);
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
              screenShareEnabled: data.screenShareEnabled ?? participant.screenShareEnabled,
            });
          }
          return newMap;
        });
      });

      // WebRTC Signaling Events
      socket.on('offer', (data: any) => {
        console.log('📥 Received offer from:', data.from);
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
      console.log('📺 Received remote stream from peer:', peerId, {
        streamId: stream.id,
        tracks: stream.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
        })),
      });

      setParticipants((prev) => {
        const newMap = new Map(prev);
        const participant = newMap.get(peerId);

        if (participant) {
          console.log('✅ Updating participant with stream:', participant.displayName);
          newMap.set(peerId, {
            ...participant,
            stream: stream,
            audioEnabled: stream.getAudioTracks().some(t => t.enabled),
            videoEnabled: stream.getVideoTracks().some(t => t.enabled),
          });
        } else {
          console.warn('⚠️ Received stream for unknown participant:', peerId);
        }

        return newMap;
      });
    },
    []
  );

  // Toggle audio
  const handleToggleAudio = () => {
    if (!localStream) {
      console.warn('No local stream to toggle audio');
      return;
    }

    const newState = !audioEnabled;
    console.log('🎤 Toggling audio to:', newState);
    
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
  const handleToggleVideo = async () => {
    const newState = !videoEnabled;
    console.log('📹 Toggling video to:', newState);
    
    // If enabling video but we don't have a local stream, try to get one
    if (newState && !localStream) {
      try {
        console.log('🎥 Attempting to get new stream...');
        const s = await getLocalStream(true, true);
        if (s) {
          console.log('✅ Got new stream');
          setLocalStream(s);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = s;
            localVideoRef.current.muted = true;
            localVideoRef.current.play().catch(e => console.warn('Play failed:', e));
          }
          setAudioEnabled(s.getAudioTracks().some(t => t.enabled));
          setVideoEnabled(s.getVideoTracks().some(t => t.enabled));
          setLocalVideoProblem(null);
        }
      } catch (err) {
        console.error('❌ Error obtaining stream on toggle:', err);
        setLocalVideoProblem('Could not access camera. Check permissions.');
        return;
      }
    }

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
    console.log('👋 Leaving meeting...');
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

  const totalParticipants = participants.size + 1;

  return (
    <div className="meeting-room">
      {/* Header */}
      <header className="meeting-header">
        <div className="meeting-info">
          <h3>Meeting: {meetingId}</h3>
          <span className="participant-count">
            <Users size={16} />
            {totalParticipants} participant{totalParticipants !== 1 ? 's' : ''}
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
        {localVideoProblem && (
          <div className="video-warning" role="alert">
            ⚠️ {localVideoProblem}
          </div>
        )}
        <div
          className={`video-grid ${
            totalParticipants === 1
              ? 'grid-1'
              : totalParticipants === 2
              ? 'grid-2'
              : totalParticipants === 3
              ? 'grid-3'
              : totalParticipants <= 4
              ? 'grid-4'
              : 'grid-many'
          }`}
        >
          {/* Local video */}
          {localParticipant && (
            <VideoTile
              participant={localParticipant}
              isLocal={true}
              videoRef={localVideoRef}
            />
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
            <h3>Participants ({totalParticipants})</h3>
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