const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const MONGO_URI = process.env.MONGO_URI; 
const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_FOR_PROTOTYPE';
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

mongoose.connect(MONGO_URI).then(() => console.log('MongoDB connected')).catch(err => console.error(err));

// --- Schemas ---
const User = mongoose.model('User', new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'rider'], default: 'user' }
}));

const Product = mongoose.model('Product', new mongoose.Schema({
    name: String, price: Number, seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}));

const Order = mongoose.model('Order', new mongoose.Schema({
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    price: Number,
    quantity: { type: Number, default: 1 },
    deliveryFee: { type: Number, default: 2500 },
    status: { type: String, enum: ['pending', 'shipped', 'delivered'], default: 'pending' },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now }
}));

// --- Auth Routes ---
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword, role });
        await user.save();
        res.status(201).json({ message: 'Registered.' });
    } catch (err) { res.status(400).json({ error: 'Account already exists' }); }
});

app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ error: 'Invalid details' });
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
});

// --- Marketplace & Cart Routes ---
app.get('/api/products', async (req, res) => { res.json(await Product.find().populate('seller')); });

app.post('/api/checkout', async (req, res) => {
    try {
        const { items, buyerId } = req.body;
        // Process multiple orders from the cart simultaneously
        const orders = await Promise.all(items.map(item => {
            return new Order({
                product: item._id,
                buyer: buyerId,
                seller: item.seller?._id || item.seller,
                price: item.price,
                quantity: item.quantity || 1
            }).save();
        }));
        res.status(201).json(orders);
    } catch (err) { res.status(400).json({ error: 'Checkout failed' }); }
});

app.get('/api/user/orders/:userId', async (req, res) => {
    const orders = await Order.find({ $or: [{ buyer: req.params.userId }, { seller: req.params.userId }, { rider: req.params.userId }] })
        .populate('product').sort({ createdAt: -1 });
    res.json(orders);
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
