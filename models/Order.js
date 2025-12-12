const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    // Link to the Product that was ordered
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    // Link to the User who placed the order
    buyer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // The seller of the product (needed for easy lookup and commission calculation)
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Total price including delivery fee (for tracking)
    totalAmount: {
        type: Number,
        required: true
    },
    // Commission earned by the platform
    commission: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Placed'
    },
    orderDate: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Order', OrderSchema);
