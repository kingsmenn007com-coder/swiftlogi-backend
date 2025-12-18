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
    name: String, 
    price: Number, 
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}));

// Memory Lock: Order schema supporting both Cart items and Rider Payouts
const Order = mongoose.model('Order', new mongoose.Schema({
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        price: Number,
        quantity: { type: Number, default: 1 }
    }],
    totalPrice: Number,
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
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
});

app.get('/api/products', async (req, res) => { 
    res.json(await Product.find()); 
});

// Checkout Route for Multi-item Cart
app.post('/api/orders', async (req, res) => {
    try {
        const { buyerId, items, totalPrice } = req.body;
        const order = new Order({ 
            buyer: buyerId, 
            items, 
            totalPrice, 
            deliveryFee: 1500 
        });
        await order.save();
        res.status(201).json(order);
    } catch (err) { res.status(400).json({ error: 'Checkout failed' }); }
});

// DASHBOARD INDEPENDENCE: Filtered history by Role and ID
app.get('/api/user/orders/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);
        let query = {};

        if (user.role === 'rider') {
            query = { rider: userId };
        } else {
            query = { buyer: userId };
        }

        const orders = await Order.find(query).populate('items.product').sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) { res.status(500).json({ error: 'Error fetching history' }); }
});

// Rider-Specific Job Feed
app.get('/api/jobs', async (req, res) => {
    res.json(await Order.find({ status: 'pending', rider: null }));
});

app.post('/api/jobs/:orderId/accept', async (req, res) => {
    const { riderId } = req.body;
    await Order.findByIdAndUpdate(req.params.orderId, { 
        rider: riderId, 
        status: 'shipped' 
    });
    res.json({ message: 'Job Accepted' });
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
