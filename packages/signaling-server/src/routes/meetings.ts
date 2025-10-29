import { Router } from 'express';
import { MeetingController } from '../controller/meetingController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

router.post('/', MeetingController.createMeeting);
router.get('/my', MeetingController.getMyMeetings);
router.get('/active', MeetingController.getActiveMeetings);
router.get('/:meetingId', MeetingController.getMeeting);
router.delete('/:meetingId', MeetingController.deleteMeeting);

export default router;