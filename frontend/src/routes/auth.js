const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Counter = require('../models/counter');
const router = express.Router();

async function getNextUid() {
  const counter = await Counter.findByIdAndUpdate(
    { _id: "user_uid" },
    { $inc: { sequence_value: 1 } },
    { new: true, upsert: true }
  );
  return counter.sequence_value;
}

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ msg: 'Email already in use' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const nextUid = await getNextUid();

    const newUser = new User({
      uid: nextUid,
      email,
      password: hashedPassword
    });

    await newUser.save();
    res.status(201).json({ msg: 'User created', uid: newUser.uid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'No account with this email' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Incorrect password' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.json({ token, email: user.email, uid: user.uid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
