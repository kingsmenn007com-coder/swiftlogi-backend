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
    role: { type: String, enum: ['user', 'rider'], default: 'user' } // Unified 'user' for Buy/Sell
}));

const Product = mongoose.model('Product', new mongoose.Schema({
    name: String, 
    price: Number, 
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sellerName: String
}));

const Order = mongoose.model('Order', new mongoose.Schema({
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    price: Number,
    deliveryFee: { type: Number, default: 1500 },
    status: { type: String, enum: ['pending', 'shipped', 'delivered'], default: 'pending' },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now }
}));

// --- Routes ---
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword, role });
        await user.save();
        res.status(201).json({ message: 'Registered.' });
    } catch (err) { res.status(400).json({ error: 'Email already exists' }); }
});

app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
});

app.get('/api/products', async (req, res) => { res.json(await Product.find()); });

app.post('/api/orders', async (req, res) => {
    try {
        const { productId, buyerId, sellerId, price } = req.body;
        const order = new Order({ product: productId, buyer: buyerId, seller: sellerId, price, deliveryFee: 2500 });
        await order.save();
        res.status(201).json(order);
    } catch (err) { res.status(400).json({ error: 'Order failed' }); }
});

app.get('/api/user/orders/:userId', async (req, res) => {
    const { userId } = req.params;
    const orders = await Order.find({ $or: [{ buyer: userId }, { seller: userId }, { rider: userId }] })
        .populate('product').sort({ createdAt: -1 });
    res.json(orders);
});

app.get('/api/jobs', async (req, res) => {
    res.json(await Order.find({ status: 'pending', rider: null }).populate('product'));
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
