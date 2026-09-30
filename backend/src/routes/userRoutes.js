const express = require('express');
const { syncUser, getProfile, updateProfile } = require('../controllers/userController');

const router = express.Router();

router.post('/sync', syncUser);
router.get( "/profile/:email",  getProfile );

router.patch( "/profile/:email", updateProfile );
module.exports = router;