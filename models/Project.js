// models/Project.js
const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  category: { type: String, required: true }, // e.g., 'iot', 'python', etc.
    title: { type: String, required: true },
    description: { type: String },
    image: { type: String }, // URL or file path to the project image
    code: { type: String },
    configuration: { type: String },
    documentation: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Project', projectSchema);
