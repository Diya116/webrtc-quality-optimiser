// webrtc.ts - WebRTC utility functions

const configuration: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

let localStream: MediaStream | null = null;
let screenStream: MediaStream | null = null;
const peerConnections = new Map<string, RTCPeerConnection>();

// Get local media stream
export const getLocalStream = async (
  video: boolean = true,
  audio: boolean = true
): Promise<MediaStream> => {
  try {
    console.log('📹 Requesting media stream:', { video, audio });
    
    const stream = await navigator.mediaDevices.getUserMedia({
      video: video
        ? {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30 },
          }
        : false,
      audio: audio
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : false,
    });

    console.log('✅ Got media stream:', {
      id: stream.id,
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
      tracks: stream.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        readyState: t.readyState,
        label: t.label,
      })),
    });

    localStream = stream;

    // Listen for track ended events
    stream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        console.warn(`⚠️ Track ended: ${track.kind}`);
        window.dispatchEvent(new Event('webrtc-local-stream-stopped'));
      });
    });

    return stream;
  } catch (error: any) {
    console.error('❌ Error getting local stream:', error);
    throw new Error(
      `Failed to access camera/microphone: ${error.message || 'Permission denied'}`
    );
  }
};

// Stop local stream
export const stopLocalStream = () => {
  console.log('⏹️ Stopping local stream...');
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      track.stop();
      console.log(`Stopped ${track.kind} track`);
    });
    localStream = null;
  }
};

// Toggle audio track
export const toggleAudio = (enabled: boolean) => {
  console.log('🎤 Toggling audio to:', enabled);
  if (localStream) {
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
      console.log(`Audio track enabled: ${track.enabled}`);
    });
  }
};

// Toggle video track
export const toggleVideo = (enabled: boolean) => {
  console.log('📹 Toggling video to:', enabled);
  if (localStream) {
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
      console.log(`Video track enabled: ${track.enabled}`);
    });
  }
};

// Create peer connection
const createPeerConnection = (
  peerId: string,
  socket: any,
  onRemoteStream: (peerId: string, stream: MediaStream) => void,
  localMediaStream: MediaStream | null
): RTCPeerConnection => {
  console.log('🔗 Creating peer connection for:', peerId);

  const peerConnection = new RTCPeerConnection(configuration);

  // Add local stream tracks to peer connection
  if (localMediaStream) {
    console.log('➕ Adding local tracks to peer connection:', peerId);
    localMediaStream.getTracks().forEach((track) => {
      console.log(`Adding ${track.kind} track to peer ${peerId}`);
      peerConnection.addTrack(track, localMediaStream);
    });
  } else {
    console.warn('⚠️ No local stream to add to peer connection');
  }

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('🧊 Sending ICE candidate to:', peerId);
      socket.emit('ice-candidate', {
        to: peerId,
        candidate: event.candidate,
      });
    }
  };

  // Handle connection state changes
  peerConnection.onconnectionstatechange = () => {
    console.log(`🔄 Connection state with ${peerId}:`, peerConnection.connectionState);
    
    if (peerConnection.connectionState === 'failed') {
      console.error('❌ Connection failed with peer:', peerId);
    } else if (peerConnection.connectionState === 'disconnected') {
      console.warn('⚠️ Disconnected from peer:', peerId);
    } else if (peerConnection.connectionState === 'connected') {
      console.log('✅ Successfully connected to peer:', peerId);
    }
  };

  // Handle ICE connection state changes
  peerConnection.oniceconnectionstatechange = () => {
    console.log(`❄️ ICE connection state with ${peerId}:`, peerConnection.iceConnectionState);
  };

  // Handle remote stream
  peerConnection.ontrack = (event) => {
    console.log('📺 Received remote track from:', peerId, {
      kind: event.track.kind,
      enabled: event.track.enabled,
      readyState: event.track.readyState,
      streams: event.streams.length,
    });

    if (event.streams && event.streams[0]) {
      console.log('✅ Setting remote stream for peer:', peerId);
      onRemoteStream(peerId, event.streams[0]);
    }
  };

  peerConnections.set(peerId, peerConnection);
  return peerConnection;
};

// Handle new peer (create offer)
export const handleNewPeer = async (
  peerId: string,
  socket: any,
  onRemoteStream: (peerId: string, stream: MediaStream) => void,
  localMediaStream: MediaStream | null = null
) => {
  try {
    console.log('👤 Handling new peer (creating offer):', peerId);

    const peerConnection = createPeerConnection(
      peerId,
      socket,
      onRemoteStream,
      localMediaStream
    );

    // Create and send offer
    console.log('📤 Creating offer for:', peerId);
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });

    await peerConnection.setLocalDescription(offer);
    console.log('✅ Local description set, sending offer to:', peerId);

    socket.emit('offer', {
      to: peerId,
      offer: offer,
    });
  } catch (error) {
    console.error('❌ Error handling new peer:', error);
  }
};

// Handle incoming offer (create answer)
export const handleOffer = async (
  data: { from: string; offer: RTCSessionDescriptionInit },
  socket: any,
  onRemoteStream: (peerId: string, stream: MediaStream) => void,
  localMediaStream: MediaStream | null = null
) => {
  try {
    console.log('📥 Handling offer from:', data.from);

    let peerConnection = peerConnections.get(data.from);

    if (!peerConnection) {
      console.log('Creating new peer connection for:', data.from);
      peerConnection = createPeerConnection(
        data.from,
        socket,
        onRemoteStream,
        localMediaStream
      );
    }

    console.log('🤝 Setting remote description (offer)');
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.offer)
    );

    console.log('📤 Creating answer for:', data.from);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    console.log('✅ Sending answer to:', data.from);
    socket.emit('answer', {
      to: data.from,
      answer: answer,
    });
  } catch (error) {
    console.error('❌ Error handling offer:', error);
  }
};

// Handle incoming answer
export const handleAnswer = async (data: {
  from: string;
  answer: RTCSessionDescriptionInit;
}) => {
  try {
    console.log('📥 Handling answer from:', data.from);

    const peerConnection = peerConnections.get(data.from);

    if (!peerConnection) {
      console.error('❌ No peer connection found for:', data.from);
      return;
    }

    console.log('🤝 Setting remote description (answer)');
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.answer)
    );

    console.log('✅ Answer processed for:', data.from);
  } catch (error) {
    console.error('❌ Error handling answer:', error);
  }
};

// Handle ICE candidate
export const handleIceCandidate = async (data: {
  from: string;
  candidate: RTCIceCandidateInit;
}) => {
  try {
    console.log('🧊 Handling ICE candidate from:', data.from);

    const peerConnection = peerConnections.get(data.from);

    if (!peerConnection) {
      console.error('❌ No peer connection found for:', data.from);
      return;
    }

    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    console.log('✅ ICE candidate added for:', data.from);
  } catch (error) {
    console.error('❌ Error handling ICE candidate:', error);
  }
};

// Start screen share
export const startScreenShare = async (): Promise<MediaStream | null> => {
  try {
    console.log('🖥️ Starting screen share...');
    
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' } as any,
      audio: false,
    });

    screenStream = stream;

    // Handle stream ended
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      console.log('🖥️ Screen share stopped');
      stopScreenShare();
    });

    // Replace video track in all peer connections
    const videoTrack = stream.getVideoTracks()[0];
    peerConnections.forEach((peerConnection, peerId) => {
      const senders = peerConnection.getSenders();
      const videoSender = senders.find((s) => s.track?.kind === 'video');
      if (videoSender) {
        console.log('🔄 Replacing video track for peer:', peerId);
        videoSender.replaceTrack(videoTrack);
      }
    });

    console.log('✅ Screen share started');
    return stream;
  } catch (error: any) {
    console.error('❌ Error starting screen share:', error);
    return null;
  }
};

// Stop screen share
export const stopScreenShare = async () => {
  console.log('⏹️ Stopping screen share...');
  
  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
    screenStream = null;
  }

  // Restore camera video track
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      peerConnections.forEach((peerConnection, peerId) => {
        const senders = peerConnection.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');
        if (videoSender) {
          console.log('🔄 Restoring camera track for peer:', peerId);
          videoSender.replaceTrack(videoTrack);
        }
      });
    }
  }

  console.log('✅ Screen share stopped');
};

// Close all peer connections
export const closeAllConnections = () => {
  console.log('🔌 Closing all peer connections...');
  
  peerConnections.forEach((peerConnection, peerId) => {
    console.log('Closing connection with:', peerId);
    peerConnection.close();
  });
  
  peerConnections.clear();
  console.log('✅ All connections closed');
};

// Get peer connection (for debugging)
export const getPeerConnection = (peerId: string): RTCPeerConnection | undefined => {
  return peerConnections.get(peerId);
};

// Get all peer connections (for debugging)
export const getAllPeerConnections = (): Map<string, RTCPeerConnection> => {
  return peerConnections;
};