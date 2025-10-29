import { Router } from "express";
import { Room } from "../websocket/Room";

const router = Router();
const rooms: Map<string, Room> = new Map();

router.post("/create", (_req, res) => {
  const roomId = `room-${Math.floor(Math.random() * 10000)}`;
  const room = new Room(roomId);
  rooms.set(roomId, room);
  res.json({ roomId });
});

router.get("/:roomId", (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  return res.json({ 
    id: room.getMeetingId(), 
    participants: room.getAllParticipants() 
  });
});

export default router;
