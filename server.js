const express = require('express');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure file uploads using multer.
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Setup session middleware.
app.use(session({
  secret: 'your-secret-key', // Change this key in production.
  resave: false,
  saveUninitialized: true
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve static files from the public folder.
app.use(express.static('public'));

// Dummy admin credentials (replace with secure mechanism in production).
const adminUser = { username: "admin", password: "password" };

// Admin login endpoint.
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === adminUser.username && password === adminUser.password) {
    req.session.loggedIn = true;
    res.redirect('/admin-dashboard.html');
  } else {
    res.send('Invalid credentials');
  }
});

// Secured video upload endpoint.
app.post('/admin/upload-video', upload.single('videoFile'), (req, res) => {
  if (req.session.loggedIn) {
    // Save file info and videoTitle (req.body.videoTitle) to your database here.
    res.send('Video uploaded successfully');
  } else {
    res.status(401).send('Unauthorized');
  }
});

// Email endpoint (integrate with a mailing service like Nodemailer).
app.post('/send-email', (req, res) => {
  const { name, email, message } = req.body;
  console.log(`Received email from ${name} (${email}): ${message}`);
  res.send('Email sent successfully (demo endpoint)');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
