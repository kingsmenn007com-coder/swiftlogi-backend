const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    buyer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    rider: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null // Assigned later
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    // --- FINANCIAL/LOGISTICS DATA ---
    deliveryFee: {
        type: Number,
        default: 1500 // Base Fee (₦1,500)
    },
    totalAmount: {
        type: Number,
        required: true // Price + Delivery Fee
    },
    commission: {
        type: Number,
        default: 0 // Your system profit
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'shipping', 'delivered', 'cancelled'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Order', OrderSchema);
