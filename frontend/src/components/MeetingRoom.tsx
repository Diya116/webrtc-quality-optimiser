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
  closeAllConnections,
  startScreenShare,
  stopScreenShare,
} from '../utils/webrtc';
import './MeetingRoom.css';

// Fixed VideoTile component with proper stream attachment
const VideoTile: React.FC<{
  participant: Participant;
  isLocal?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}> = ({ participant, isLocal = false, videoRef }) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const ref = videoRef || localVideoRef;
  const [playError, setPlayError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const streamAttachedRef = useRef<string | null>(null);

  // Effect to attach and play stream
  useEffect(() => {
    const videoElement = ref.current;
    const stream = participant.stream;

    console.log(`🎬 VideoTile effect for ${participant.displayName}:`, {
      hasVideoElement: !!videoElement,
      hasStream: !!stream,
      streamId: stream?.id,
      videoEnabled: participant.videoEnabled,
      audioEnabled: participant.audioEnabled,
      streamTracks: stream?.getTracks().length || 0,
      isLocal,
      currentStreamAttached: streamAttachedRef.current,
    });

    // If no video element or no stream, cleanup and return
    if (!videoElement || !stream) {
      if (videoElement && videoElement.srcObject) {
        console.log(`⚠️ Clearing video element for ${participant.displayName}`);
        videoElement.srcObject = null;
        streamAttachedRef.current = null;
      }
      return;
    }

    // Check if this stream is already attached
    if (streamAttachedRef.current === stream.id) {
      console.log(`✅ Stream already attached for ${participant.displayName}`);
      return;
    }

    // Attach stream to video element
    console.log(`📌 Attaching stream ${stream.id} for ${participant.displayName}`);
    videoElement.srcObject = stream;
    streamAttachedRef.current = stream.id;

    // For remote videos, we need to handle autoplay
    if (!isLocal) {
      // Add metadata/playing listeners for diagnostics
      const onLoaded = () => {
        console.log(`📐 Video loadedmetadata for ${participant.displayName}:`, { 
          videoWidth: videoElement.videoWidth, 
          videoHeight: videoElement.videoHeight,
          tracks: stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState, muted: t.muted }))
        });
        
        // If videoWidth is still 0 after loadedmetadata, try force refresh
        if (videoElement.videoWidth === 0 && stream.getVideoTracks().length > 0) {
          console.warn(`⚠️ Video dimensions are 0 for ${participant.displayName}, attempting refresh...`);
          setTimeout(() => {
            const currentStream = videoElement.srcObject;
            videoElement.srcObject = null;
            videoElement.srcObject = currentStream;
            videoElement.play().catch(e => console.warn('Refresh play failed:', e));
          }, 100);
        }
      };
      const onPlaying = () => {
        console.log(`▶️ Playing ${participant.displayName}:`, { 
          videoWidth: videoElement.videoWidth, 
          videoHeight: videoElement.videoHeight 
        });
        
        // Check again after playing started
        if (videoElement.videoWidth === 0 && stream.getVideoTracks().length > 0) {
          console.error(`❌ Video still has 0 dimensions while playing for ${participant.displayName}`);
        }
      };
      videoElement.addEventListener('loadedmetadata', onLoaded);
      videoElement.addEventListener('playing', onPlaying);

      const playVideo = async () => {
        try {
          // Wait a tiny bit for the stream to be ready
          await new Promise(resolve => setTimeout(resolve, 100));
          
          console.log(`▶️ Attempting to play video for ${participant.displayName}`);
          // Try to play (muted to satisfy autoplay policies)
          await videoElement.play();
          console.log(`✅ Video playing for ${participant.displayName}`);
          setIsPlaying(true);
          setPlayError(null);
        } catch (error: any) {
          console.error(`❌ Autoplay failed for ${participant.displayName}:`, error);
          
          // Handle different autoplay errors
          if (error.name === 'NotAllowedError') {
            setPlayError('Click to play video');
            console.log(`🖱️ User interaction needed for ${participant.displayName}`);
          } else if (error.name === 'NotSupportedError') {
            setPlayError('Video format not supported');
          } else {
            setPlayError('Failed to play video');
          }
        }
      };

      playVideo();

      // Also try to play when tracks become active
      const handleTrackActive = () => {
        console.log(`🎵 Track became active for ${participant.displayName}`);
        if (!isPlaying && videoElement.paused) {
          playVideo();
        }
      };

      stream.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          handleTrackActive();
        }
        track.addEventListener('unmute', handleTrackActive);
      });

      // Cleanup track & video listeners
      return () => {
        stream.getTracks().forEach(track => {
          track.removeEventListener('unmute', handleTrackActive);
        });
        videoElement.removeEventListener('loadedmetadata', onLoaded);
        videoElement.removeEventListener('playing', onPlaying);
      };
    } else {
      // Local video - just ensure it's playing
      if (videoElement.paused) {
        videoElement.play().catch(e => 
          console.warn('Local video play failed:', e)
        );
      }
      setIsPlaying(true);
    }
  }, [participant.stream, participant.displayName, isLocal, ref, participant.videoEnabled, participant.audioEnabled, isPlaying]);

  // Handle manual play click for autoplay-blocked videos
  const handleManualPlay = async () => {
    const videoElement = ref.current;
    if (videoElement && videoElement.paused) {
      try {
        await videoElement.play();
        setIsPlaying(true);
        setPlayError(null);
        console.log(`✅ Manual play successful for ${participant.displayName}`);
      } catch (error) {
        console.error(`❌ Manual play failed for ${participant.displayName}:`, error);
      }
    }
  };

  return (
    <div className="video-tile">
      {participant.videoEnabled && participant.stream ? (
        <div className="video-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
          <video
            ref={ref}
            autoPlay
            playsInline
            // mute by default so autoplay is allowed
            muted={true}
            className="video-element"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {/* Show play button overlay if autoplay failed */}
          {!isLocal && playError && (
            <div 
              onClick={handleManualPlay}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                cursor: 'pointer',
                zIndex: 10,
              }}
            >
              <div style={{ textAlign: 'center', color: 'white' }}>
                <div style={{ fontSize: '48px', marginBottom: '8px' }}>▶️</div>
                <div>{playError}</div>
              </div>
            </div>
          )}
        </div>
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
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showParticipantsList, setShowParticipantsList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(true);
  const [localVideoProblem, setLocalVideoProblem] = useState<string | null>(null);

  const socketRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  // Map of video refs for remote participants (used by diagnostics)
  const videoRefs = useRef<Map<string, React.RefObject<HTMLVideoElement | null>>>(new Map());
  const isInitializedRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);

  const getVideoRefFor = (id: string) => {
    let ref = videoRefs.current.get(id);
    if (!ref) {
      ref = React.createRef<HTMLVideoElement | null>();
      videoRefs.current.set(id, ref);
    }
    return ref as React.RefObject<HTMLVideoElement | null>;
  };

  const diagnosticsPlay = (id: string) => {
    const ref = videoRefs.current.get(id);
    if (ref && ref.current) {
      ref.current.play().then(() => console.log('▶️ Diagnostics: play success for', id)).catch(err => console.warn('Diagnostics: play failed', id, err));
    } else {
      console.warn('Diagnostics: no video element for', id);
    }
  };

  const diagnosticsInfo = async (id: string) => {
    const ref = videoRefs.current.get(id);
    if (ref && ref.current) {
      const el = ref.current;
      const stream = el.srcObject as MediaStream | null;
      console.log(`🔍 Video element diagnostics for ${id}:`, {
        paused: el.paused,
        muted: el.muted,
        videoWidth: el.videoWidth,
        videoHeight: el.videoHeight,
        srcObject: stream?.id,
        videoTracks: stream?.getVideoTracks().map(t => ({
          id: t.id,
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
          muted: t.muted,
          label: t.label,
        })) || [],
      });
      
      // Also get peer connection stats
      const { getPeerDiagnostics } = await import('../utils/webrtc');
      await getPeerDiagnostics(id);
    } else {
      console.warn('Diagnostics: no video element for', id);
    }
  };

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
          
          localStreamRef.current = stream;
          // store stream in ref for toggles and sharing
          localStreamRef.current = stream;
          setAudioEnabled(true);
          setVideoEnabled(true);
          
          // Attach to video element immediately
          if (localVideoRef.current && stream) {
            console.log('📌 Attaching local stream to video element');
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.muted = true;
            
            // Ensure local video plays
            const playLocal = async () => {
              try {
                await localVideoRef.current!.play();
                console.log('✅ Local video playing');
              } catch (e) {
                console.warn('⚠️ Local video autoplay failed:', e);
                // Try again after a short delay
                setTimeout(() => {
                  localVideoRef.current?.play().catch(err => 
                    console.warn('Local video play retry failed:', err)
                  );
                }, 500);
              }
            };
            
            playLocal();
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
      localStreamRef.current = null;
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

        // Set local participant with stream reference
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
        console.log('🎯 Setting local participant with stream:', {
          displayName: local.displayName,
          hasStream: !!local.stream,
          streamId: local.stream?.id,
          videoEnabled: local.videoEnabled,
          audioEnabled: local.audioEnabled,
        });
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

            // Create WebRTC connection for existing participant (pass local stream)
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

  // Create WebRTC connection for new participant (pass local stream)
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

      // Participant media changed - FIXED to preserve stream
      socket.on('participant-media-changed', (data: any) => {
        console.log('🎬 Participant media changed:', data);
        setParticipants((prev) => {
          const newMap = new Map(prev);
          const participant = newMap.get(data.socketId);
          if (participant) {
            // IMPORTANT: Preserve the existing stream reference
            newMap.set(data.socketId, {
              ...participant,
              audioEnabled: data.audioEnabled ?? participant.audioEnabled,
              videoEnabled: data.videoEnabled ?? participant.videoEnabled,
              screenShareEnabled: data.screenShareEnabled ?? participant.screenShareEnabled,
              // Don't overwrite stream!
              stream: participant.stream,
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

  // Handle remote stream - FIXED to prevent stream loss
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
          
          // Create new participant object with stream
          const updatedParticipant: Participant = {
            ...participant,
            stream: stream,
            audioEnabled: stream.getAudioTracks().some(t => t.enabled),
            videoEnabled: stream.getVideoTracks().some(t => t.enabled),
          };
          
          newMap.set(peerId, updatedParticipant);
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
    const stream = localStreamRef.current;
    if (!stream) {
      console.warn('No local stream to toggle audio');
      return;
    }

    const newState = !audioEnabled;
    console.log('🎤 Toggling audio to:', newState);
    
    setAudioEnabled(newState);
    toggleAudioTrack(newState);
    socketService.emit('toggle-audio', { enabled: newState });

    // Update local participant - preserve stream reference
    setLocalParticipant((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        audioEnabled: newState,
        stream: prev.stream, // Preserve stream
      };
    });
  };

  // Toggle video - FIXED to preserve stream
  const handleToggleVideo = () => {
    const stream = localStreamRef.current;
    if (!stream) {
      console.warn('No local stream to toggle video');
      return;
    }

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      console.warn('No video tracks found');
      return;
    }

    const newState = !videoTracks[0].enabled;
    console.log('📹 Toggling local video to:', newState);

    // Toggle the track
    videoTracks.forEach(track => (track.enabled = newState));
    setVideoEnabled(newState);

    // Update participant UI - preserve stream reference
    setLocalParticipant((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        videoEnabled: newState,
        stream: prev.stream, // Preserve stream
      };
    });

    // Notify others
    socketService.emit('toggle-video', { enabled: newState });
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
    localStreamRef.current = null;
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
            <VideoTile key={participant.socketId} participant={participant} videoRef={getVideoRefFor(participant.socketId)} />
          ))}
        </div>
      </div>

      {/* Diagnostics panel (visible when console logs are not available) */}
      <div style={{ position: 'fixed', right: 12, top: 80, zIndex: 1000, background: 'rgba(0,0,0,0.8)', color: 'white', padding: 10, borderRadius: 6, fontSize: 12, maxWidth: 320 }}>
        <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 14 }}>🔍 Connection Diagnostics</div>
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {localParticipant && (
            <div style={{ marginBottom: 8, padding: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 'bold' }}>You (Local)</div>
              <div style={{ fontSize: 10 }}>ID: {localParticipant.socketId.slice(0, 8)}...</div>
              <div style={{ fontSize: 10 }}>Stream: {localParticipant.stream ? '✅' : '❌'}</div>
            </div>
          )}
          {Array.from(participants.values()).map(p => (
            <div key={p.socketId} style={{ marginBottom: 8, padding: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 'bold' }}>{p.displayName}</div>
              <div style={{ fontSize: 10 }}>ID: {p.socketId.slice(0, 8)}...</div>
              <div style={{ fontSize: 10 }}>Stream: {p.stream ? `✅ ${p.stream.id.slice(0, 8)}...` : '❌ none'}</div>
              <div style={{ fontSize: 10, marginTop: 4, color: '#fbbf24' }}>
                ⚠️ Check console for ICE state
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                <button onClick={() => diagnosticsPlay(p.socketId)} style={{ fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>▶ Play</button>
                <button onClick={() => diagnosticsInfo(p.socketId)} style={{ fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>ℹ Info</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, padding: 6, background: 'rgba(255, 193, 7, 0.1)', borderRadius: 4, fontSize: 10 }}>
          💡 <strong>Tip:</strong> If ICE state is stuck at "checking", peers can't connect. TURN servers added to help.
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