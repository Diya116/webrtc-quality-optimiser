import { useState, useRef } from 'react';

export const useMediaDevices = () => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const getMediaStream = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      setStream(mediaStream);
      setError(null);

      // Set initial track states
      mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = audioEnabled;
      });
      mediaStream.getVideoTracks().forEach((track) => {
        track.enabled = videoEnabled;
      });
      console.log('🎥 Obtained media stream with tracks:', await mediaStream);
      console.log('🎥 Video Tracks:', await mediaStream.getVideoTracks());
      console.log('🎥 Audio Tracks:', await mediaStream.getAudioTracks());
      return mediaStream;
    } catch (err: any) {
      console.error('Error accessing media devices:', err);
      setError(err.message || 'Failed to access camera/microphone');
      return null;
    }
  };

  const toggleAudio = () => {
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setAudioEnabled(!audioEnabled);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setVideoEnabled(!videoEnabled);
    }
  };

  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  // Removed the useEffect that was causing issues
  // Components should handle attaching the stream themselves

  return {
    stream,
    audioEnabled,
    videoEnabled,
    error,
    videoRef,
    getMediaStream,
    toggleAudio,
    toggleVideo,
    stopStream,
  };
};