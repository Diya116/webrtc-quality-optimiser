import express from "express";
import bodyparser from "body-parser";
import {Server} from 'socket.io'
import cors from "cors";
const io=new Server();
const app = express();
app.use(cors());
app.use(bodyparser.json());
io.on('connection',(socket)=>{
    
})
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
