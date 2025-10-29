import { io } from "socket.io-client";

// Point this to your backend
export const socket = io("http://localhost:4000", {
  transports: ["websocket"],
});
