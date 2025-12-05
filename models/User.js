const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['buyer', 'seller', 'rider', 'admin'],
        default: 'buyer'
    },
    // --- MONEY GENERATING FEATURES ---
    walletBalance: {
        type: Number,
        default: 0.00 // Everyone starts with ₦0.00
    },
    // --- SECURITY FEATURES ---
    isVerified: {
        type: Boolean,
        default: false // Riders must be verified before working
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', UserSchema);
