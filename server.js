const express = require('express');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

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
const uploadVideo = multer({ storage: videoStorage });
const uploadCV = multer({ storage: cvStorage });

// Dummy admin credentials stored in memory (for demo only).
let adminUser = { username: "admin", password: "password" };

// In-memory store for videos
let videos = [];
let videoIdCounter = 1;

// In-memory store for CV file path
let cvFilePath = null;

// -------------------- Endpoints --------------------

// Admin login endpoint (AJAX-based).
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === adminUser.username && password === adminUser.password) {
    req.session.loggedIn = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: "Invalid credentials" });
  }
});

// Video upload endpoint.
app.post('/admin/upload-video', uploadVideo.single('videoFile'), (req, res) => {
  if (req.session.loggedIn) {
    const videoTitle = req.body.videoTitle;
    const videoPath = req.file ? req.file.filename : null;
    if (videoPath) {
      const videoData = { id: videoIdCounter++, title: videoTitle, filename: videoPath };
      videos.push(videoData);
      res.send('Video uploaded successfully');
    } else {
      res.status(400).send('No video file uploaded');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// Endpoint to fetch videos (for main page and admin dashboard).
app.get('/videos', (req, res) => {
  res.json(videos);
});

// Delete video endpoint.
app.delete('/admin/delete-video/:id', (req, res) => {
  if (req.session.loggedIn) {
    const videoId = parseInt(req.params.id);
    const videoIndex = videos.findIndex(v => v.id === videoId);
    if (videoIndex !== -1) {
      const filePath = path.join(__dirname, 'uploads/videos/', videos[videoIndex].filename);
      fs.unlink(filePath, (err) => {
        if (err) console.error(err);
      });
      videos.splice(videoIndex, 1);
      res.send('Video deleted successfully');
    } else {
      res.status(404).send('Video not found');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// Edit video endpoint – allows updating the title and optionally replacing the video file.
app.put('/admin/edit-video/:id', uploadVideo.single('videoFile'), (req, res) => {
  if (req.session.loggedIn) {
    const videoId = parseInt(req.params.id);
    const video = videos.find(v => v.id === videoId);
    if (video) {
      // Update title
      video.title = req.body.videoTitle || video.title;
      // If a new file is uploaded, replace the old file.
      if (req.file) {
        const oldPath = path.join(__dirname, 'uploads/videos/', video.filename);
        fs.unlink(oldPath, (err) => {
          if (err) console.error(err);
        });
        video.filename = req.file.filename;
      }
      res.send('Video updated successfully');
    } else {
      res.status(404).send('Video not found');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// CV upload endpoint.
app.post('/admin/upload-cv', uploadCV.single('cvFile'), (req, res) => {
  if (req.session.loggedIn) {
    if (req.file) {
      cvFilePath = req.file.filename; // stored as "cv.pdf" (or with extension)
      res.send('CV uploaded successfully');
    } else {
      res.status(400).send('No CV file uploaded');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// Endpoint to download the CV.
app.get('/cv-download', (req, res) => {
  if (cvFilePath) {
    const fileLocation = path.join(__dirname, 'uploads/cv/', cvFilePath);
    res.download(fileLocation, 'CV.pdf');
  } else {
    res.status(404).send('CV not available');
  }
});

// Endpoint to change admin credentials.
app.post('/admin/change-credentials', (req, res) => {
  if (req.session.loggedIn) {
    const { newUsername, newPassword } = req.body;
    if (newUsername && newPassword) {
      adminUser.username = newUsername;
      adminUser.password = newPassword;
      res.send('Credentials updated successfully');
    } else {
      res.status(400).send('Both username and password are required');
    }
  } else {
    res.status(401).send('Unauthorized');
  }
});

// Demo email endpoint.
app.post('/send-email', (req, res) => {
  const { name, email, message } = req.body;
  console.log(`Received email from ${name} (${email}): ${message}`);
  res.send('Email sent successfully (demo endpoint)');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
