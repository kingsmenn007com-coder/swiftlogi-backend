const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const MONGO_URI = process.env.MONGO_URI; 
const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_FOR_PROTOTYPE';
const PORT = process.env.PORT || 3001;

app.use(cors({ limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

mongoose.connect(MONGO_URI).then(() => console.log('MongoDB connected')).catch(err => console.error(err));

// --- Schemas ---
const User = mongoose.model('User', new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'rider'], default: 'user' }
}));

const Product = mongoose.model('Product', new mongoose.Schema({
    name: String, price: Number, location: String, image: String,
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sellerName: String, createdAt: { type: Date, default: Date.now }
}));

const Order = mongoose.model('Order', new mongoose.Schema({
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String, price: Number, quantity: { type: Number, default: 1 }
    }],
    totalPrice: Number,
    status: { type: String, enum: ['pending', 'shipped', 'delivered', 'rejected'], default: 'pending' },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now }
}));

// --- Routes ---
app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ error: 'Invalid' });
    res.json({ token: jwt.sign({ id: user._id }, JWT_SECRET), user: { id: user._id, name: user.name, role: user.role } });
});

app.post('/api/products', async (req, res) => {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
});

app.get('/api/products', async (req, res) => { res.json(await Product.find().sort({ createdAt: -1 })); });

app.get('/api/user/products/:userId', async (req, res) => {
    res.json(await Product.find({ seller: req.params.userId }).sort({ createdAt: -1 }));
});

// ROOT FIX: Handles both Accept and Reject actions for Riders
app.post('/api/orders', async (req, res) => {
    const order = new Order(req.body);
    await order.save();
    res.status(201).json(order);
});

app.post('/api/jobs/:orderId/status', async (req, res) => {
    const { status, riderId } = req.body;
    await Order.findByIdAndUpdate(req.params.orderId, { status, rider: riderId });
    res.json({ message: `Order marked as ${status}` });
});

app.get('/api/jobs', async (req, res) => {
    res.json(await Order.find({ status: 'pending', rider: null }));
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
