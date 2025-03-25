require('dotenv').config(); // Load environment variables
const nodemailer = require('nodemailer');
// Create a Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,           // e.g., smtp.gmail.com
  port: process.env.EMAIL_PORT,           // e.g., 465 for secure, 587 for TLS
  secure: process.env.EMAIL_SECURE === 'true', // true if port is 465
  auth: {
    user: process.env.EMAIL_USER,         // your email address
    pass: process.env.EMAIL_PASS          // your email password or app password
  }
});
const express = require('express');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId, GridFSBucket } = require('mongodb');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/portfolio';
const client = new MongoClient(MONGO_URI);
let videoBucket, cvBucket;

async function connectToDB() {
  try {
    await client.connect();
    const db = client.db(); // Uses DB from URI
    videoBucket = new GridFSBucket(db, { bucketName: "videos" });
    cvBucket = new GridFSBucket(db, { bucketName: "cv" });
    console.log("✅ Connected to MongoDB and initialized GridFS buckets");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}
connectToDB();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));
app.use(express.static('public'));  // Serve static files from public/

// Ensure upload directories exist (for temporary disk storage if needed)
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
};
ensureDir(path.join(__dirname, 'uploads'));
ensureDir(path.join(__dirname, 'uploads/videos'));
ensureDir(path.join(__dirname, 'uploads/cv'));

// Use Multer's memory storage for GridFS uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// -------------------- Admin Credentials --------------------
// Use 'let' so they can be updated dynamically
let adminUser = process.env.ADMIN_USER || "admin";
let adminPass = process.env.ADMIN_PASS || "admin12345";

// -------------------- Endpoints --------------------

// Admin login endpoint
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === adminUser && password === adminPass) {
    req.session.loggedIn = true;
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, message: "Invalid credentials" });
});

// Video upload endpoint (use POST /upload-video)
app.post("/upload-video", upload.single("video"), (req, res) => {
  console.log("Received video upload request.");
  console.log("req.file:", req.file); // Debug: log file info

  if (!req.file) {
    console.error("No video file received.");
    return res.status(400).send("No video file uploaded.");
  }
  if (!videoBucket) {
    console.error("MongoDB video bucket not ready.");
    return res.status(500).send("DB not ready");
  }

  // Create an upload stream to GridFS
  const uploadStream = videoBucket.openUploadStream(req.file.originalname, {
    metadata: { 
      title: req.body.videoTitle || req.file.originalname, 
      contentType: req.file.mimetype 
    }
  });
  uploadStream.end(req.file.buffer);

  uploadStream.on("finish", () => {
    console.log("Video uploaded to GridFS successfully.");
    res.status(200).send("Video uploaded successfully");
  });

  uploadStream.on("error", (err) => {
    console.error("Video upload error:", err);
    res.status(500).send("Upload failed");
  });
});

// Endpoint to fetch videos
app.get('/videos', async (req, res) => {
  try {
    const files = await videoBucket.find({}).toArray();
    const videoList = files.map(file => ({
      id: file._id.toString(),
      title: file.metadata?.title || file.filename,
      url: `/video/${file._id.toString()}`,  // endpoint to stream video
      contentType: file.metadata?.contentType || 'video/mp4'
    }));
    res.json(videoList);
  } catch (err) {
    console.error('Error listing videos:', err);
    res.status(500).send('Internal server error');
  }
});

// Stream video by ID
app.get('/video/:id', async (req, res) => {
  try {
    const fileId = new ObjectId(req.params.id);
    const files = await videoBucket.find({ _id: fileId }).toArray();
    if (!files.length) return res.status(404).send('Video not found');
    const fileDoc = files[0];
    res.contentType(fileDoc.metadata?.contentType || 'application/octet-stream');
    const downloadStream = videoBucket.openDownloadStream(fileId);
    downloadStream.on('error', err => {
      console.error('Error streaming video:', err);
      res.status(500).send('Error retrieving video');
    });
    downloadStream.pipe(res);
  } catch (err) {
    console.error('Invalid video ID:', err);
    res.status(400).send('Invalid video ID');
  }
});

// Delete video endpoint
app.delete('/admin/delete-video/:id', async (req, res) => {
  if (!req.session.loggedIn) return res.status(401).send('Unauthorized');
  try {
    const fileId = new ObjectId(req.params.id);
    await videoBucket.delete(fileId);
    res.send('Video deleted successfully');
  } catch (err) {
    console.error('Error deleting video:', err);
    if (err.message?.includes('FileNotFound')) {
      res.status(404).send('Video not found');
    } else {
      res.status(500).send('Error deleting video');
    }
  }
});

// Edit video endpoint – update title and optionally replace the video file
app.put('/admin/edit-video/:id', upload.single('videoFile'), async (req, res) => {
  if (!req.session.loggedIn) return res.status(401).send('Unauthorized');
  const fileId = new ObjectId(req.params.id);
  try {
    const files = await videoBucket.find({ _id: fileId }).toArray();
    if (!files.length) return res.status(404).send('Video not found');
    const fileDoc = files[0];
    const newTitle = req.body.videoTitle;
    if (newTitle) {
      // Update title in metadata (in GridFS files collection)
      await client.db().collection('videos.files').updateOne(
        { _id: fileId },
        { $set: { "metadata.title": newTitle } }
      );
    }
    if (req.file) {
      // Replace the video file
      await videoBucket.delete(fileId);
      const newStream = videoBucket.openUploadStream(req.file.originalname, {
        metadata: {
          title: newTitle || fileDoc.metadata?.title || fileDoc.filename,
          contentType: req.file.mimetype
        }
      });
      newStream.end(req.file.buffer);
      newStream.on('finish', () => res.send('Video updated successfully'));
      newStream.on('error', err => {
        console.error('Error replacing video:', err);
        res.status(500).send('Error updating video file');
      });
    } else {
      res.send('Video updated successfully');
    }
  } catch (err) {
    console.error('Edit video error:', err);
    res.status(500).send('Error updating video');
  }
});

//Upload CV Endpoint
// CV upload endpoint.
app.post("/upload-cv", upload.single("cvFile"), (req, res) => {
  console.log("Received CV upload request.");
  console.log("req.file:", req.file); // Debug log

  if (!req.file) {
    console.error("No CV file received.");
    return res.status(400).send("No CV file uploaded.");
  }
  if (!cvBucket) {
    console.error("MongoDB CV bucket not ready.");
    return res.status(500).send("DB not ready");
  }
  const uploadStream = cvBucket.openUploadStream(req.file.originalname, {
    metadata: { contentType: req.file.mimetype }
  });
  uploadStream.end(req.file.buffer);

  uploadStream.on("finish", () => {
    console.log("CV uploaded to GridFS successfully.");
    res.status(200).send("CV uploaded successfully");
  });

  uploadStream.on("error", (err) => {
    console.error("CV upload error:", err);
    res.status(500).send("Upload failed");
  });
});

// Endpoint to download the CV.
app.get('admin/cv-download', (req, res) => {
  try {
    const downloadStream = cvBucket.openDownloadStreamByName('cv.pdf', { revision: -1 });
    res.setHeader('Content-Disposition', 'attachment; filename=CV.pdf');
    res.setHeader('Content-Type', 'application/pdf');
    downloadStream.on('error', err => {
      console.error('CV download error:', err);
      res.status(404).send('CV not available');
    });
    downloadStream.pipe(res);
  } catch (err) {
    console.error('CV download exception:', err);
    res.status(500).send('Internal server error');
  }
});

// Endpoint to change admin credentials.
app.post('/admin/change-credentials', (req, res) => {
  if (!req.session.loggedIn) return res.status(401).send('Unauthorized');
  const { newUsername, newPassword } = req.body;
  if (newUsername && newPassword) {
    adminUser = newUsername;
    adminPass = newPassword;
    res.send('Credentials updated successfully');
  } else {
    res.status(400).send('Both username and password are required');
  }
});

// Demo email endpoint.
app.post('/send-email', (req, res) => {
  const { name, email, message } = req.body;
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,  // sender address
    to: process.env.EMAIL_TO,       // your personal email address (set in environment variables)
    subject: `New message from ${name}`,
    text: `You have received a new message from ${name} (${email}):\n\n${message}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      res.status(500).send('Error sending email.');
    } else {
      console.log('Email sent: ' + info.response);
      res.send('Message sent successfully.');
    }
  });
});

