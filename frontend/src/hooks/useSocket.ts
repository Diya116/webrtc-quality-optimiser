import { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import socketService from '../Services/socketService';

export const useSocket = (token: string | null) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;

    try {
      const socket = socketService.connect(token);
      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('✅ Socket connected');
        setIsConnected(true);
        setError(null);
      });

      socket.on('disconnect', (reason) => {
        console.log('❌ Socket disconnected:', reason);
        setIsConnected(false);
      });

      socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        setError(err.message);
        setIsConnected(false);
      });

      socket.on('error', (err) => {
        console.error('Socket error:', err);
        setError(err.message || 'Socket error occurred');
      });

      return () => {
        socketService.disconnect();
        socketRef.current = null;
      };
    } catch (err: any) {
      console.error('Socket initialization error:', err);
      setError(err.message);
    }
  }, [token]);

  return {
    socket: socketRef.current,
    isConnected,
    error,
  };
};