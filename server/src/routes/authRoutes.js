const express = require('express');
const router = express.Router();
console.log('Auth routes file loading...');
const { registerUser, loginUser, getUsers, deleteUser, resetPassword, updatePassword } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/signup', registerUser);
router.post('/login', loginUser);
router.post('/reset-password', resetPassword);
router.post('/update-password', protect, updatePassword);
router.get('/ping', (req, res) => res.json({ message: 'Auth routes working' }));

router.route('/users')
    .get(protect, getUsers)
    .post(protect, registerUser);

router.route('/users/:id')
    .delete(protect, deleteUser);

module.exports = router;
