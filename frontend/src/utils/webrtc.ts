import { Socket } from 'socket.io-client';

// ICE Server configuration (STUN/TURN servers)
const iceServers: RTCIceServer[] = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
    ],
  },
  // Add TURN server if needed
  // {
  //   urls: 'turn:your-turn-server.com:3478',
  //   username: 'username',
  //   credential: 'password',
  // },
];

// Store peer connections
const peerConnections = new Map<string, RTCPeerConnection>();

// Store remote streams
const remoteStreams = new Map<string, MediaStream>();

// Local stream
let localStream: MediaStream | null = null;

/**
 * Get local media stream (camera + microphone)
 */
export const getLocalStream = async (
  videoEnabled: boolean = true,
  audioEnabled: boolean = true
): Promise<MediaStream | null> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoEnabled
        ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          }
        : false,
      audio: audioEnabled
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : false,
    });

    localStream = stream;
    console.log('✅ Local stream obtained:', stream.id);
    return stream;
  } catch (error) {
    console.error('❌ Error getting local stream:', error);
    return null;
  }
};

/**
 * Stop local stream
 */
export const stopLocalStream = () => {
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      track.stop();
    });
    localStream = null;
    console.log('🛑 Local stream stopped');
  }
};

/**
 * Create RTCPeerConnection for a peer
 */
const createPeerConnection = (
  peerId: string,
  socket: Socket,
  onRemoteStream: (peerId: string, stream: MediaStream) => void
): RTCPeerConnection => {
  const pc = new RTCPeerConnection({ iceServers });

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('🧊 Sending ICE candidate to:', peerId);
      socket.emit('ice-candidate', {
        to: peerId,
        candidate: event.candidate,
      });
    }
  };

  // Handle remote stream
  pc.ontrack = (event) => {
    console.log('📥 Received remote track from:', peerId);
    const [remoteStream] = event.streams;
    
    if (remoteStream) {
      remoteStreams.set(peerId, remoteStream);
      onRemoteStream(peerId, remoteStream);
    }
  };

  // Handle connection state changes
  pc.onconnectionstatechange = () => {
    console.log(`🔗 Connection state with ${peerId}:`, pc.connectionState);
    
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      console.log(`❌ Peer ${peerId} disconnected`);
      closePeerConnection(peerId);
    }
  };

  // Handle ICE connection state changes
  pc.oniceconnectionstatechange = () => {
    console.log(`🧊 ICE connection state with ${peerId}:`, pc.iceConnectionState);
  };

  // Add local tracks to peer connection
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream!);
      console.log(`➕ Added local track to peer ${peerId}:`, track.kind);
    });
  }

  peerConnections.set(peerId, pc);
  return pc;
};

/**
 * Close peer connection
 */
const closePeerConnection = (peerId: string) => {
  const pc = peerConnections.get(peerId);
  
  if (pc) {
    pc.close();
    peerConnections.delete(peerId);
    console.log(`🔌 Closed peer connection with ${peerId}`);
  }

  remoteStreams.delete(peerId);
};

/**
 * Handle new peer joining (create offer)
 */
export const handleNewPeer = async (
  peerId: string,
  socket: Socket,
  onRemoteStream: (peerId: string, stream: MediaStream) => void
): Promise<void> => {
  try {
    console.log('👋 New peer joined, creating offer for:', peerId);

    // Create peer connection
    const pc = createPeerConnection(peerId, socket, onRemoteStream);

    // Create offer
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });

    await pc.setLocalDescription(offer);

    // Send offer to peer
    console.log('📤 Sending offer to:', peerId);
    socket.emit('offer', {
      to: peerId,
      offer: pc.localDescription,
    });
  } catch (error) {
    console.error('❌ Error creating offer:', error);
  }
};

/**
 * Handle received offer (create answer)
 */
export const handleOffer = async (
  data: { from: string; offer: RTCSessionDescriptionInit },
  socket: Socket,
  onRemoteStream: (peerId: string, stream: MediaStream) => void
): Promise<void> => {
  try {
    const { from: peerId, offer } = data;
    console.log('📥 Received offer from:', peerId);

    // Create peer connection if doesn't exist
    let pc = peerConnections.get(peerId);
    if (!pc) {
      pc = createPeerConnection(peerId, socket, onRemoteStream);
    }

    // Set remote description
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Create answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Send answer to peer
    console.log('📤 Sending answer to:', peerId);
    socket.emit('answer', {
      to: peerId,
      answer: pc.localDescription,
    });
  } catch (error) {
    console.error('❌ Error handling offer:', error);
  }
};

/**
 * Handle received answer
 */
export const handleAnswer = async (data: {
  from: string;
  answer: RTCSessionDescriptionInit;
}): Promise<void> => {
  try {
    const { from: peerId, answer } = data;
    console.log('📥 Received answer from:', peerId);

    const pc = peerConnections.get(peerId);
    if (!pc) {
      console.error('❌ No peer connection found for:', peerId);
      return;
    }

    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    console.log('✅ Set remote description for:', peerId);
  } catch (error) {
    console.error('❌ Error handling answer:', error);
  }
};

/**
 * Handle received ICE candidate
 */
export const handleIceCandidate = async (data: {
  from: string;
  candidate: RTCIceCandidateInit;
}): Promise<void> => {
  try {
    const { from: peerId, candidate } = data;
    console.log('🧊 Received ICE candidate from:', peerId);

    const pc = peerConnections.get(peerId);
    if (!pc) {
      console.error('❌ No peer connection found for:', peerId);
      return;
    }

    await pc.addIceCandidate(new RTCIceCandidate(candidate));
    console.log('✅ Added ICE candidate for:', peerId);
  } catch (error) {
    console.error('❌ Error handling ICE candidate:', error);
  }
};

/**
 * Toggle local audio track
 */
export const toggleAudio = (enabled: boolean): void => {
  if (localStream) {
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
    console.log(`🎤 Audio ${enabled ? 'enabled' : 'disabled'}`);
  }
};

/**
 * Toggle local video track
 */
export const toggleVideo = (enabled: boolean): void => {
  if (localStream) {
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
    console.log(`📹 Video ${enabled ? 'enabled' : 'disabled'}`);
  }
};

/**
 * Replace video track (for screen sharing)
 */
export const replaceVideoTrack = async (
  newTrack: MediaStreamTrack
): Promise<void> => {
  try {
    peerConnections.forEach((pc, peerId) => {
      const sender = pc
        .getSenders()
        .find((s) => s.track?.kind === 'video');
      
      if (sender) {
        sender.replaceTrack(newTrack);
        console.log('✅ Replaced video track for peer:', peerId);
      }
    });
  } catch (error) {
    console.error('❌ Error replacing video track:', error);
  }
};

/**
 * Start screen sharing
 */
export const startScreenShare = async (): Promise<MediaStream | null> => {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    const screenTrack = screenStream.getVideoTracks()[0];

    // Replace video track with screen track
    await replaceVideoTrack(screenTrack);

    // Handle screen share stop
    screenTrack.onended = () => {
      stopScreenShare();
    };

    console.log('🖥️ Screen sharing started');
    return screenStream;
  } catch (error) {
    console.error('❌ Error starting screen share:', error);
    return null;
  }
};

/**
 * Stop screen sharing
 */
export const stopScreenShare = async (): Promise<void> => {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      await replaceVideoTrack(videoTrack);
      console.log('🖥️ Screen sharing stopped');
    }
  }
};

/**
 * Get remote stream for a peer
 */
export const getRemoteStream = (peerId: string): MediaStream | undefined => {
  return remoteStreams.get(peerId);
};

/**
 * Close all peer connections
 */
export const closeAllConnections = (): void => {
  peerConnections.forEach((_pc, peerId) => {
    closePeerConnection(peerId);
  });
  peerConnections.clear();
  remoteStreams.clear();
  console.log('🔌 All peer connections closed');
};

/**
 * Get all peer connection IDs
 */
export const getPeerIds = (): string[] => {
  return Array.from(peerConnections.keys());
};

/**
 * Get peer connection stats
 */
export const getPeerConnectionStats = async (
  peerId: string
): Promise<RTCStatsReport | null> => {
  const pc = peerConnections.get(peerId);
  if (!pc) return null;

  try {
    return await pc.getStats();
  } catch (error) {
    console.error('❌ Error getting stats:', error);
    return null;
  }
};