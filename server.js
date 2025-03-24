require('dotenv').config(); // if using .env for local development
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
let db, videoBucket, cvBucket;
client.connect().then(() => {
  db = client.db();  // use default DB from URI
  videoBucket = new GridFSBucket(db, { bucketName: 'videos' });
  cvBucket = new GridFSBucket(db, { bucketName: 'cvFiles' });
  console.log('Connected to MongoDB and initialized GridFS buckets');
}).catch(err => console.error('MongoDB connection error:', err));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));
app.use(express.static('public'));  // serve static files in public/

// Configure Multer to store file data in memory (we will handle persistence)
const uploadVideo = multer({ storage: multer.memoryStorage() });
const uploadCV = multer({ storage: multer.memoryStorage() });

// Admin credentials (for demo – in production, use secure storage)
//let adminUser = { username: "admin", password: "password" };

// Ensure upload directories exist
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
};
ensureDir(path.join(__dirname, 'uploads'));
ensureDir(path.join(__dirname, 'uploads/videos'));
ensureDir(path.join(__dirname, 'uploads/cv'));

// Middleware ordering: body-parser and session before static middleware.
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'your-secret-key', // Change this in production.
  resave: false,
  saveUninitialized: true
}));

// Serve static files from the public folder
app.use(express.static('public'));

// Serve uploaded files (videos and CVs)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create storage for videos and CV separately
const videoStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, 'uploads/videos'));
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const cvStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, 'uploads/cv'));
  },
  filename: function(req, file, cb) {
    // Always save as "cv" with the original extension.
    cb(null, 'cv' + path.extname(file.originalname));
  }
});
// const uploadVideo = multer({ storage: videoStorage });
// const uploadCV = multer({ storage: cvStorage });

// Dummy admin credentials stored in memory (for demo only).
//let adminUser = { username: "admin", password: "password" };

// In-memory store for videos
//let videos = [];
//let videoIdCounter = 1;

// In-memory store for CV file path
let cvFilePath = null;

// -------------------- Endpoints --------------------

// Admin login endpoint (AJAX-based).
const adminUser = process.env.ADMIN_USER || "admin";
const adminPass = process.env.ADMIN_PASS || "admin12345";

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === adminUser && password === adminPass) {
    req.session.loggedIn = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: "Invalid credentials" });
  }
});

// Video upload endpoint.
app.post('/admin/upload-video', uploadVideo.single('videoFile'), (req, res) => {
  if (!req.session.loggedIn) return res.status(401).send('Unauthorized');
  if (!req.file) return res.status(400).send('No video file uploaded');

  const videoTitle = req.body.videoTitle || 'Untitled Video';
  // Save file to GridFS
  try {
    const uploadStream = videoBucket.openUploadStream(req.file.originalname, {
      metadata: { title: videoTitle, contentType: req.file.mimetype }
    });
    uploadStream.end(req.file.buffer);
    uploadStream.on('error', err => {
      console.error('GridFS video upload error:', err);
      res.status(500).send('Error storing video');
    });
    uploadStream.on('finish', () => {
      res.send('Video uploaded successfully');
    });
  } catch (err) {
    console.error('Upload video exception:', err);
    res.status(500).send('Internal server error');
  }
});

// Endpoint to fetch videos (for main page and admin dashboard).
// Get Videos (list metadata for front-end)
app.get('/videos', async (req, res) => {
  try {
    const files = await videoBucket.find({}).toArray();
    const videoList = files.map(file => ({
      id: file._id.toString(),
      title: file.metadata?.title || file.filename,
      url: `/video/${file._id.toString()}`,                  // endpoint to stream
      contentType: file.metadata?.contentType || 'video/mp4' // default to mp4 if missing
    }));
    res.json(videoList);
  } catch (err) {
    console.error('Error listing videos:', err);
    res.status(500).send('Internal server error');
  }
});

// Stream Video by ID
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

// Delete video endpoint.
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

// Edit video endpoint – allows updating the title and optionally replacing the video file.
app.put('/admin/edit-video/:id', uploadVideo.single('videoFile'), async (req, res) => {
  if (!req.session.loggedIn) return res.status(401).send('Unauthorized');
  const fileId = new ObjectId(req.params.id);
  try {
    const files = await videoBucket.find({ _id: fileId }).toArray();
    if (!files.length) return res.status(404).send('Video not found');
    const fileDoc = files[0];
    const newTitle = req.body.videoTitle;
    if (newTitle) {
      // Update title in metadata
      await db.collection('videos.files').updateOne(
        { _id: fileId }, 
        { $set: { "metadata.title": newTitle } }
      );
    }
    if (req.file) {
      // Replace the video file
      await videoBucket.delete(fileId);
      const newStream = videoBucket.openUploadStream(req.file.originalname, {
        metadata: { title: newTitle || fileDoc.metadata?.title || fileDoc.filename,
                    contentType: req.file.mimetype }
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

// CV upload endpoint.
app.post('/admin/upload-cv', uploadCV.single('cvFile'), async (req, res) => {
  if (!req.session.loggedIn) return res.status(401).send('Unauthorized');
  if (!req.file) return res.status(400).send('No CV file uploaded');
  try {
    // Remove old CV files
    const oldFiles = await cvBucket.find({}).toArray();
    for (let f of oldFiles) {
      await cvBucket.delete(f._id);
    }
    // Save new CV file
    const cvStream = cvBucket.openUploadStream('cv.pdf', {
      metadata: { contentType: req.file.mimetype }
    });
    cvStream.end(req.file.buffer);
    cvStream.on('finish', () => res.send('CV uploaded successfully'));
    cvStream.on('error', err => {
      console.error('CV upload error:', err);
      res.status(500).send('Error storing CV');
    });
  } catch (err) {
    console.error('Upload CV exception:', err);
    res.status(500).send('Internal server error');
  }
});

// Endpoint to download the CV.
app.get('/cv-download', (req, res) => {
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
    adminUser.username = newUsername;
    adminUser.password = newPassword;
    res.send('Credentials updated successfully');
  } else {
    res.status(400).send('Both username and password are required');
  }
});

// Demo email endpoint.
app.post('/send-email', (req, res) => {
  const { name, email, message } = req.body;
  console.log(`Received contact form submission from ${name} <${email}>: ${message}`);
  // In real deployment, integrate with an email service (e.g., SendGrid, Nodemailer)
  res.send('Email sent successfully (demo endpoint)');
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
