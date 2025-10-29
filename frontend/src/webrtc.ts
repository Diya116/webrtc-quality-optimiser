import { io } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";

export const socket = io("http://localhost:4000", { transports: ["websocket"] });

let device: mediasoupClient.Device;
let sendTransport: mediasoupClient.types.Transport;
let recvTransport: mediasoupClient.types.Transport;

export async function init(roomId: string) {
  // Join room
  socket.emit("join-room", { roomId, name: "User" });

  socket.on("router-rtp-capabilities", async (rtpCapabilities) => {
    device = new mediasoupClient.Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities });

    // Create send transport
    socket.emit("create-transport", { roomId }, async (transportInfo) => {
      sendTransport = device.createSendTransport(transportInfo);

      sendTransport.on("connect", ({ dtlsParameters }, callback) => {
        socket.emit("connect-transport", { roomId, transportId: sendTransport.id, dtlsParameters });
        callback();
      });

      sendTransport.on("produce", async ({ kind, rtpParameters }, callback) => {
        socket.emit("produce", { roomId, transportId: sendTransport.id, kind, rtpParameters }, callback);
      });

      // Get local stream
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(track => sendTransport.produce({ track }));
    });
  });
}
